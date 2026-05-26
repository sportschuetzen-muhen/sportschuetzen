// =========================================================
//  RESULTATE (Grenzland) - Card UI je Runde/Team
//  Sheet: aktuell_Grenzland (A-H)
//   A Name
//   B R1 Team
//   C R1 Pkt P1
//   D R2 Team (default = R1)
//   E R2 Pkt P1
//   F R3 Team (default = R2)
//   G R3 Pkt P1
//   H ID (Key, intern)
//  Regeln:
//   - Teams: Dropdown, aus bestehenden Teamnamen (mind. aus R1) + Pool (nur Anzeige)
//   - Team-Vererbung: wenn R2 leer -> R1, wenn R3 leer -> R2
//   - Pro Runde max 4 pro Team, Pool ausgenommen (keine Sperre)
//   - Punkte: Integer 0-100 oder leer
//   - Neue Schützen nur aus Mitglieder, bereits verwendete ausblenden
// =========================================================

let resultateState = {
  rows: [],      // [{id,name,r1_team,r1_p1,r2_team,r2_p1,r3_team,r3_p1,_autoR2,_autoR3}]
  members: [],   // [{id, vorname, nachname, email}]
  teams: [],     // team strings (ohne Pool) – Pool wird UI-seitig ergänzt
  isDirty: false
};

const TEAM_LIMIT = 4;
const POOL_LABEL = "Pool";

function loadResultateData() {
  ensureResultateShell();
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
          <button class="btn btn-outline-secondary btn-sm" onclick="loadResultateData()">🔄 Laden</button>
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

// ---------- Events (ohne Full-Render pro Keypress) ----------

function onPointsInputEvent(e) {
  const el = e.target;
  const rowIndex = parseInt(el.dataset.row, 10);
  const roundKey = el.dataset.round;
  const r = resultateState.rows[rowIndex];
  const p1Field = `${roundKey}_p1`;

  // Nur Ziffern, aber cursor/focus behalten: wir ändern value nur wenn nötig
  const raw = String(el.value || "");
  const cleaned = raw.replace(/[^\d]/g, "");
  if (cleaned !== raw) el.value = cleaned;

  r[p1Field] = cleaned;
  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen", true);

  // nur dieses Feld validieren
  if (cleaned === "" || isValidPoints(cleaned)) el.classList.remove("is-invalid");
  else el.classList.add("is-invalid");
}

function onTeamChangeEvent(e) {
  const el = e.target;
  const rowIndex = parseInt(el.dataset.row, 10);
  const roundKey = el.dataset.round;
  const newTeam = String(el.value || "");

  const r = resultateState.rows[rowIndex];
  const teamField = `${roundKey}_team`;

  const prevTeam = (r[teamField] || "") || POOL_LABEL;

  // Pool immer erlaubt (und wird beim Save zu "")
  // Limit: >4 sperren, Pool ausgenommen
  if (newTeam !== POOL_LABEL) {
    const count = countTeamAssignments(roundKey, newTeam, rowIndex);
    if (count >= TEAM_LIMIT) {
      alert(`Team "${newTeam}" hat in ${roundLabel(roundKey)} bereits ${TEAM_LIMIT} Zuteilungen. Bitte Pool oder anderes Team wählen.`);
      // revert
      el.value = prevTeam;
      return;
    }
  }

  // set
  r[teamField] = (newTeam === POOL_LABEL) ? "" : newTeam;

  // auto-flags
  if (roundKey === "r2") r._autoR2 = false;
  if (roundKey === "r3") r._autoR3 = false;

  // Vererbung bei Änderungen (nur wenn auto)
  if (roundKey === "r1") {
    if (r._autoR2) {
      if (r.r1_team !== "" && countTeamAssignments("r2", r.r1_team, rowIndex) >= TEAM_LIMIT) {
        r._autoR2 = false; // Ziel voll, breche R2-Vererbung ab
      } else {
        r.r2_team = r.r1_team;
        if (r._autoR3) {
          if (r.r2_team !== "" && countTeamAssignments("r3", r.r2_team, rowIndex) >= TEAM_LIMIT) {
            r._autoR3 = false; // Ziel voll, breche R3-Vererbung ab
          } else {
            r.r3_team = r.r2_team;
          }
        }
      }
    }
  }
  if (roundKey === "r2") {
    if (r._autoR3) {
      if (r.r2_team !== "" && countTeamAssignments("r3", r.r2_team, rowIndex) >= TEAM_LIMIT) {
        r._autoR3 = false; // Ziel voll, breche R3-Vererbung ab
      } else {
        r.r3_team = r.r2_team;
      }
    }
  }

  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen", true);

  // Weil Cards nach Team gruppieren: nach Team-Wechsel müssen wir neu rendern (aber nur nach Dropdown, nicht bei Punkte)
  renderRounds();
}

function countTeamAssignments(roundKey, teamName, excludeRowIndex) {
  let c = 0;
  const field = `${roundKey}_team`;
  for (let i = 0; i < resultateState.rows.length; i++) {
    if (i === excludeRowIndex) continue;
    const t = (resultateState.rows[i][field] || "") || "";
    if (t === teamName) c++;
  }
  return c;
}

function roundLabel(roundKey) {
  if (roundKey === "r1") return "Runde 1";
  if (roundKey === "r2") return "Runde 2";
  return "Runde 3";
}

// ---------- Add member (dropdown) ----------

function confirmAddSelectedMember() {
  const sel = document.getElementById("new-member-select");
  const roundSel = document.getElementById("new-start-round");
  const teamSel = document.getElementById("new-start-team");

  const memberId = sel ? String(sel.value || "") : "";
  const startRound = roundSel ? String(roundSel.value || "r1") : "r1";
  const startTeamUi = teamSel ? String(teamSel.value || "") : "";

  if (!memberId) return alert("Bitte zuerst ein Mitglied wählen.");
  if (!startTeamUi) return alert("Bitte Start-Team wählen.");

  const member = resultateState.members.find(m => String(m.id) === memberId);
  if (!member) return alert("Mitglied nicht gefunden.");

  const name = `${member.nachname} ${member.vorname}`.trim();
  const teamValue = (startTeamUi === POOL_LABEL) ? "" : startTeamUi;

  const newRow = normalizeRow({ id: memberId, name });

  // Alles vor Start-Runde = Pool (leer)
  newRow.r1_team = "";
  newRow.r2_team = "";
  newRow.r3_team = "";

  // Setze Start-Runde Team explizit
  if (startRound === "r1") {
    newRow.r1_team = teamValue;
    newRow.r2_team = teamValue;
    newRow.r3_team = teamValue;
    newRow._autoR2 = true;
    newRow._autoR3 = true;
  }

  if (startRound === "r2") {
    newRow.r2_team = teamValue;
    newRow.r3_team = teamValue;
    newRow._autoR2 = false; // manuell gesetzt
    newRow._autoR3 = true;  // r3 darf erben
  }

  if (startRound === "r3") {
    newRow.r3_team = teamValue;
    newRow._autoR2 = false;
    newRow._autoR3 = false;
  }

  // Limit-Check für die gewählte Runde/Team (Pool ausgenommen)
  if (teamValue) {
    const cnt = countTeamAssignments(startRound, teamValue, -1);
    if (cnt >= TEAM_LIMIT) {
      return alert(`Team "${teamValue}" hat in ${roundLabel(startRound)} bereits ${TEAM_LIMIT} Zuteilungen. Bitte Pool oder anderes Team wählen.`);
    }
  }

  resultateState.rows.push(newRow);
  resultateState.isDirty = true;

  renderUI();
  sel.value = "";
}


// ---------- Save / Push ----------

async function saveResultateData() {
  // Validierung Punkte
  for (const r of resultateState.rows) {
    if (!r.id) return alert("Es gibt eine Zeile ohne ID.");
    if (!isValidPoints(r.r1_p1) || !isValidPoints(r.r2_p1) || !isValidPoints(r.r3_p1)) {
      return alert("Bitte Punkte korrigieren: nur ganze Zahlen 0–100 (oder leer).");
    }
  }

  // Limit-Check (Sperre) – Pool ausgenommen
  const rounds = ["r1","r2","r3"];
  for (const rk of rounds) {
    const counts = new Map();
    resultateState.rows.forEach(r => {
      const t = (r[`${rk}_team`] || "") || "";
      if (!t) return; // leer == Pool
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    for (const [team, cnt] of counts.entries()) {
      if (cnt > TEAM_LIMIT) {
        return alert(`${roundLabel(rk)}: Team "${team}" hat ${cnt} Zuteilungen (max ${TEAM_LIMIT}). Bitte korrigieren (Pool ist unbegrenzt).`);
      }
    }
  }

  const btn = document.getElementById("btn-save-resultate");
  const original = btn ? btn.innerText : "Speichern";
  if (btn) { btn.disabled = true; btn.innerText = "Speichere..."; }

  // Payload: Pool wird als "" gesendet (weil wir intern "" speichern, sobald Pool gewählt ist)
  const payloadRows = resultateState.rows.map(r => ({
    id: r.id,
    r1_team: r.r1_team || "",
    r1_p1: r.r1_p1 || "",
    r2_team: r.r2_team || "",
    r2_p1: r.r2_p1 || "",
    r3_team: r.r3_team || "",
    r3_p1: r.r3_p1 || ""
  }));

  try {
    const res = await apiFetch("manager", "action=saveResultateData", {
      method: "POST",
      body: JSON.stringify({ sheetName: "aktuell_Grenzland", rows: payloadRows })
    });
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch { throw new Error("Speichern: Backend-Antwort ist kein JSON"); }
    if (data.error) throw new Error(data.error);

    resultateState.isDirty = false;
    setStatus("✅ Gespeichert", false);

    if (btn) {
      btn.innerText = "✅ OK";
      setTimeout(() => { btn.innerText = original; btn.disabled = false; }, 1200);
    }
  } catch (e) {
    alert("Fehler beim Speichern: " + e.message);
    if (btn) { btn.disabled = false; btn.innerText = original; }
    setStatus("Fehler beim Speichern", true);
  }
}

// ---------- Sync: Setup_Grenzland → aktuell_Grenzland ----------

async function syncSetupToResultate() {
  const btn = document.querySelector('button[onclick="syncSetupToResultate()"]');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Syncing…'; }

  try {
    const res = await apiFetch(
      'manager',
      'action=syncSetupToResultate&setupSheetName=Setup_Grenzland&resultateSheetName=aktuell_Grenzland'
    );
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch { throw new Error('Backend-Antwort ist kein JSON'); }
    if (data.error) throw new Error(data.error);

    const added = data.added || 0;
    if (added === 0) {
      alert('Alle Setup-Schützen sind bereits in Resultate vorhanden – nichts hinzugefügt.');
    } else {
      alert(`✅ ${added} Schütze${added === 1 ? '' : 'n'} aus Setup_Grenzland übernommen.`);
      await loadResultateData(); // Neu laden damit UI aktuell ist
      return; // loadResultateData setzt Status selbst
    }
  } catch (e) {
    alert('Fehler beim Sync: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origText; }
  }
}

async function pushOneSignalGrenzland() {
  try {
    const res = await apiFetch("manager", "action=push_onesignal_grenzland");
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    if (data.error) throw new Error(data.error);

    alert("Push OK" + (data.message ? (": " + data.message) : ""));
  } catch (e) {
    alert("Push Fehler: " + e.message);
  }
}

// ---------- Helpers ----------

function normalizeRow(r) {
  const r1 = String(r.r1_team || "");
  const r2 = String(r.r2_team || "");
  const r3 = String(r.r3_team || "");
  return {
    id: r.id != null ? String(r.id) : "",
    name: String(r.name || ""),
    r1_team: r1,
    r1_p1: r.r1_p1 != null ? String(r.r1_p1) : "",
    r2_team: r2,
    r2_p1: r.r2_p1 != null ? String(r.r2_p1) : "",
    r3_team: r3,
    r3_p1: r.r3_p1 != null ? String(r.r3_p1) : "",
    _autoR2: (r2 === r1),
    _autoR3: (r3 === r2)
  };
}

function buildTeamsList(teamsFromBackend, rows) {
  const set = new Set();
  (teamsFromBackend || []).forEach(t => { t = String(t || "").trim(); if (t) set.add(t); });
  rows.forEach(r => {
    [r.r1_team, r.r2_team, r.r3_team].forEach(t => {
      t = String(t || "").trim();
      if (t) set.add(t);
    });
  });
  // Pool NICHT in teams speichern, kommt UI-seitig
  return Array.from(set).filter(t => t !== POOL_LABEL).sort((a,b) => a.localeCompare(b, "de", {numeric:true}));
}

function isValidPoints(val) {
  if (val === "" || val == null) return true;
  const s = String(val);
  if (!/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  return Number.isInteger(n) && n >= 0 && n <= 100;
}

function setStatus(text, dirty) {
  const el = document.getElementById("resultate-status");
  if (!el) return;
  el.innerText = text;
  el.classList.toggle("text-danger", !!dirty);
  el.classList.toggle("text-muted", !dirty);
}

// escapeHtml ist zentral in main.js definiert
