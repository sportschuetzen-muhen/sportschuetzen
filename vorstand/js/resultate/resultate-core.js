// =========================================================
//  RESULTATE (Mannschaft & G & G) - Core / State / Utilities
//  Native Supabase Architecture mit Multi-Wettbewerbs-Support
// =========================================================

window._resultateContestType = window._resultateContestType || "mannschaft";
window._resultateYear = window._resultateYear || new Date().getFullYear();
window._resultateIsSupabase = false;

let resultateState = {
  rows: [],      // [{id, name, stellung, r1_team, r1_p1, r1_p2, ..., r7_team, r7_p1, _autoR2, _autoR3}]
  members: [],   // [{id, vorname, nachname, email}]
  teams: [],     // team strings (ohne Pool) – Pool wird UI-seitig ergänzt
  isDirty: false
};

const POOL_LABEL = "Pool";

function getContestLimit(contestType) {
  const type = contestType || window._resultateContestType || "grenzland";
  if (type === "mannschaft") return 8;
  if (type === "gruppe") return 5;
  return 4; // grenzland
}

function getContestRoundCount(contestType) {
  const type = contestType || window._resultateContestType || "grenzland";
  if (type === "mannschaft") return 7;
  return 3; // gruppe & grenzland
}

// Supabase Client Access
function getResultateSupabaseClient() {
  if (typeof window.getSupabaseClient === 'function') {
    return window.getSupabaseClient();
  }
  return window.supabaseClient || null;
}
window.getResultateSupabaseClient = getResultateSupabaseClient;

// Mappings Supabase <-> Frontend
function mapContestResultFromSupabase(r) {
  const r1 = String(r.r1_team || "");
  const r2 = String(r.r2_team || "");
  const r3 = String(r.r3_team || "");
  const autoR2 = r.is_auto_r2 !== undefined ? Boolean(r.is_auto_r2) : (r2 === r1);
  const autoR3 = r.is_auto_r3 !== undefined ? Boolean(r.is_auto_r3) : (r3 === r2);

  const row = {
    id: String(r.person_number || r.id || ""),
    name: String(r.name || ""),
    stellung: String(r.stellung || "liegend"),
    _autoR2: autoR2,
    _autoR3: autoR3
  };

  for (let i = 1; i <= 7; i++) {
    row[`r${i}_team`] = String(r[`r${i}_team`] || "");
    row[`r${i}_p1`] = (r[`r${i}_p1`] !== null && r[`r${i}_p1`] !== undefined) ? String(r[`r${i}_p1`]) : "";
    if (i <= 3) {
      row[`r${i}_p2`] = (r[`r${i}_p2`] !== null && r[`r${i}_p2`] !== undefined) ? String(r[`r${i}_p2`]) : "";
    }
  }

  return row;
}

function mapContestResultToSupabase(row, contestType = "grenzland", year = null) {
  const targetYear = year || window._resultateYear || new Date().getFullYear();
  const pn = String(row.id || "").trim();
  const p = (val) => (val === "" || val == null) ? null : parseInt(String(val), 10);

  const obj = {
    id: `${contestType}_${targetYear}_${pn}`,
    contest_type: contestType,
    year: targetYear,
    person_number: pn,
    name: String(row.name || "").trim(),
    stellung: String(row.stellung || "liegend"),
    is_auto_r2: row._autoR2 !== false,
    is_auto_r3: row._autoR3 !== false,
    updated_at: new Date().toISOString()
  };

  for (let i = 1; i <= 7; i++) {
    obj[`r${i}_team`] = String(row[`r${i}_team`] || "").trim();
    obj[`r${i}_p1`] = p(row[`r${i}_p1`]);
    if (i <= 3) {
      obj[`r${i}_p2`] = p(row[`r${i}_p2`]);
    }
  }

  return obj;
}

function normalizeRow(r) {
  const r1 = String(r.r1_team || "");
  const r2 = String(r.r2_team || "");
  const r3 = String(r.r3_team || "");

  const row = {
    id: r.id != null ? String(r.id) : "",
    name: String(r.name || ""),
    stellung: String(r.stellung || "liegend"),
    _autoR2: (r2 === r1),
    _autoR3: (r3 === r2)
  };

  for (let i = 1; i <= 7; i++) {
    row[`r${i}_team`] = String(r[`r${i}_team`] || "");
    row[`r${i}_p1`] = r[`r${i}_p1`] != null ? String(r[`r${i}_p1`]) : "";
    if (i <= 3) {
      row[`r${i}_p2`] = r[`r${i}_p2`] != null ? String(r[`r${i}_p2`]) : "";
    }
  }

  return row;
}

function buildTeamsList(teamsFromBackend, rows) {
  const set = new Set();
  (teamsFromBackend || []).forEach(t => { t = String(t || "").trim(); if (t) set.add(t); });
  rows.forEach(r => {
    for (let i = 1; i <= 7; i++) {
      const t = String(r[`r${i}_team`] || "").trim();
      if (t) set.add(t);
    }
  });
  // Standard-Teams falls Set leer
  if (set.size === 0) {
    set.add("Muhen 1");
    set.add("Muhen 2");
    set.add("Muhen 3");
  }
  // Pool NICHT in teams speichern, kommt UI-seitig
  return Array.from(set).filter(t => t !== POOL_LABEL).sort((a,b) => a.localeCompare(b, "de", {numeric:true}));
}

function isValidPoints(val, contestType = null) {
  if (val === "" || val == null) return true;
  const s = String(val);
  if (!/^\d+$/.test(s)) return false;
  const n = parseInt(s, 10);
  const type = contestType || window._resultateContestType || "grenzland";
  const max = (type === "mannschaft") ? 200 : 100;
  return Number.isInteger(n) && n >= 0 && n <= max;
}
