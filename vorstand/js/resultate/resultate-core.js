// =========================================================
//  RESULTATE (Grenzland) - Core / State / Utilities
// =========================================================

let resultateState = {
  rows: [],      // [{id,name,r1_team,r1_p1,r2_team,r2_p1,r3_team,r3_p1,_autoR2,_autoR3}]
  members: [],   // [{id, vorname, nachname, email}]
  teams: [],     // team strings (ohne Pool) – Pool wird UI-seitig ergänzt
  isDirty: false
};

const TEAM_LIMIT = 4;
const POOL_LABEL = "Pool";

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
