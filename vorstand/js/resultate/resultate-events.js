// =========================================================
//  RESULTATE (Grenzland) - Events & Input Handlers
// =========================================================

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
