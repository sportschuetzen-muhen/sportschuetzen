// =========================================================
//  RESULTATE (Grenzland) - UI Rendering
// =========================================================

function loadResultateData(force = false) {
  ensureResultateShell();

  if (!force && resultateState.rows.length > 0 && document.getElementById('resultate-app')) {
    console.log("⚡ loadResultateData: Lade aus lokalem Cache...");
    return;
  }

  setStatus("Lade…", false);
  renderLoading();

  apiFetch("manager", "action=getResultateData&sheetName=aktuell_Grenzland")
    .then(r => r.text())
    .then(txt => {
      let data;
      try { data = JSON.parse(txt); } catch { throw new Error("Backend-Antwort ist kein JSON"); }
      if (data.error) throw new Error(data.error);

      resultateState.members = (data.members || []).map(m => ({
        id: String(m.id),
        vorname: m.vorname || "",
        nachname: m.nachname || "",
        email: m.email || ""
      }));

      const incoming = (data.rows || []).map(r => normalizeRow(r));
      resultateState.rows = incoming;

      resultateState.teams = buildTeamsList(data.teams || [], resultateState.rows);
      resultateState.isDirty = false;

      renderUI();
      setStatus("Alles geladen", false);
    })
    .catch(e => {
      const wrap = document.getElementById("resultate-wrap");
      if (wrap) wrap.innerHTML = `<div class="alert alert-danger">Fehler: ${escapeHtml(e.message)}</div>`;
      setStatus("Fehler", false);
    });
}

function ensureResultateShell() {
  const host = document.getElementById("resultate-container");
  if (!host) return;

  if (document.getElementById("resultate-app")) return;

  injectStylesOnce();

  host.innerHTML = `
    <div id="resultate-app">
      <div class="d-flex justify-content-between align-items-center mb-3 sticky-top bg-white p-2 shadow-sm rounded" style="z-index: 600;">
        <div>
          <h4 class="m-0">🏁 Resultate – Grenzland</h4>
          <div class="small text-muted">Teams (R2/R3) werden von der vorherigen Runde übernommen, solange nicht manuell geändert.</div>
        </div>
        <div class="d-flex gap-2 flex-wrap">
          <button class="btn btn-outline-primary btn-sm" onclick="pushOneSignalGrenzland()">📣 Push</button>
          <button class="btn btn-outline-info btn-sm" onclick="syncSetupToResultate()" title="Schützen aus Setup_Grenzland übernehmen (nur fehlende)">📥 Von Setup laden</button>
          <button class="btn btn-outline-secondary btn-sm" onclick="loadResultateData(true)">🔄 Laden</button>
          <button id="btn-save-resultate" class="btn btn-success btn-sm fw-bold" onclick="saveResultateData()">💾 Speichern</button>
        </div>
      </div>

      <div id="resultate-status" class="small text-muted mb-2"></div>

      <div class="card shadow-sm border-0">
        <div class="card-body">
          <div id="resultate-wrap"></div>

   <div class="mt-3 p-2 border rounded bg-light">
  <div class="fw-bold mb-2">Schütze hinzufügen (nur aus Mitglieder)</div>
  <div class="d-flex gap-2 flex-wrap align-items-center">
    <select id="new-member-select" class="form-select form-select-sm" style="max-width: 360px;">
      <option value="">— Mitglied wählen —</option>
    </select>

    <select id="new-start-round" class="form-select form-select-sm" style="max-width: 170px;">
      <option value="r1">Start ab Runde 1</option>
      <option value="r2">Start ab Runde 2</option>
      <option value="r3">Start ab Runde 3</option>
    </select>

    <select id="new-start-team" class="form-select form-select-sm" style="max-width: 220px;">
      <option value="">— Team wählen —</option>
    </select>

    <button class="btn btn-primary btn-sm" onclick="confirmAddSelectedMember()">Hinzufügen</button>
    <div id="avail-count" class="small text-muted"></div>
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
    .round-head { border-left: 6px solid #0d6efd; }
  .round-1 .team-card { border-top: 4px solid #0d6efd; background: #fbfdff; }
.round-2 .team-card { border-top: 4px solid #198754; background: #fbfffd; }
.round-3 .team-card { border-top: 4px solid #fd7e14; background: #fffdf9; }

    .team-card { border: 1px solid rgba(0,0,0,.08); }
    .team-card .card-body {
  overflow-x: hidden;
}
    .team-badge { font-size: .75rem; }
    .rowline {
  display: flex;
  flex-wrap: wrap;
  gap: .5rem;
  align-items: center;
}
    @media (max-width: 576px) {
      .rowline { grid-template-columns: 1fr 1fr 80px; }
    }
    .name-cell {
  flex: 1 1 220px;
  min-width: 160px;
}
.rowline select {
  flex: 0 1 170px;
  min-width: 140px;
}
    .points-input {
  flex: 0 0 90px;
  max-width: 100%;
}
  `;
  document.head.appendChild(s);
}

function renderLoading() {
  const wrap = document.getElementById("resultate-wrap");
  if (!wrap) return;
  wrap.innerHTML = `<div class="text-center p-4"><div class="spinner-border text-primary"></div><div class="text-muted mt-2">Lade…</div></div>`;
}

function renderUI() {
  renderMemberDropdown();
  renderRounds();
  setStatus(resultateState.isDirty ? "Ungespeicherte Änderungen" : "Alles gespeichert", resultateState.isDirty);
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
  // Pool nur im UI ergänzen
  const teamsPlusPool = [...teams, POOL_LABEL];

  wrap.innerHTML = `
    ${renderRoundSection("Runde 1", "r1", "round-1", teamsPlusPool)}
    ${renderRoundSection("Runde 2", "r2", "round-2", teamsPlusPool)}
    ${renderRoundSection("Runde 3", "r3", "round-3", teamsPlusPool)}
  `;
}

function renderRoundSection(title, roundKey, roundClass, teamsPlusPool) {
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
        <span>${escapeHtml(teamName)}</span>
        <span class="badge ${isPool ? "bg-secondary" : (count > TEAM_LIMIT ? "bg-danger" : "bg-primary")} team-badge">
          ${count}${isPool ? "" : "/" + TEAM_LIMIT}
        </span>
      </div>
    `;

    const body = list.length
      ? list.map(({r, idx}) => renderShooterLine(idx, roundKey, teamsPlusPool)).join("")
      : `<div class="text-muted small">—</div>`;

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
        <h5 class="m-0">${escapeHtml(title)}</h5>
        <div class="small text-muted">Team-Limit: ${TEAM_LIMIT} (Pool unbegrenzt)</div>
      </div>
    </div>
    <div class="row g-3 mb-4">
      ${cardsHtml}
    </div>
  `;
}

function renderShooterLine(rowIndex, roundKey, teamsPlusPool) {
  const r = resultateState.rows[rowIndex];
  const teamField = `${roundKey}_team`;
  const p1Field = `${roundKey}_p1`;

  const selected = (r[teamField] || "") || POOL_LABEL;
  const invalid = (r[p1Field] === "" || isValidPoints(r[p1Field])) ? "" : "is-invalid";

  // Dropdown options (Pool darf gewählt werden, wird aber nicht ins Sheet geschrieben)
  const opts = teamsPlusPool.map(t => {
    const sel = (t === selected) ? "selected" : "";
    return `<option value="${escapeHtml(t)}" ${sel}>${escapeHtml(t)}</option>`;
  }).join("");

  return `
    <div class="rowline mb-2">
      <div class="name-cell text-truncate fw-bold">${escapeHtml(r.name)}</div>

      <select class="form-select form-select-sm"
              data-row="${rowIndex}"
              data-round="${roundKey}"
              onchange="onTeamChangeEvent(event)">
        ${opts}
      </select>

      <input class="form-control form-control-sm points-input ${invalid}"
             data-row="${rowIndex}"
             data-round="${roundKey}"
             inputmode="numeric"
             placeholder="0-100"
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
