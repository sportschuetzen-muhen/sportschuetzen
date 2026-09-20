// =========================================================
//  RESULTATE (Grenzland) - Core / State / Utilities
//  Native Supabase Architecture mit Google Apps Script Fallback
// =========================================================

window._resultateContestType = window._resultateContestType || "grenzland";
window._resultateYear = window._resultateYear || new Date().getFullYear();
window._resultateIsSupabase = false;

let resultateState = {
  rows: [],      // [{id,name,r1_team,r1_p1,r2_team,r2_p1,r3_team,r3_p1,_autoR2,_autoR3}]
  members: [],   // [{id, vorname, nachname, email}]
  teams: [],     // team strings (ohne Pool) – Pool wird UI-seitig ergänzt
  isDirty: false
};

const TEAM_LIMIT = 4;
const POOL_LABEL = "Pool";

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

  return {
    id: String(r.person_number || r.id || ""),
    name: String(r.name || ""),
    r1_team: r1,
    r1_p1: (r.r1_p1 !== null && r.r1_p1 !== undefined) ? String(r.r1_p1) : "",
    r2_team: r2,
    r2_p1: (r.r2_p1 !== null && r.r2_p1 !== undefined) ? String(r.r2_p1) : "",
    r3_team: r3,
    r3_p1: (r.r3_p1 !== null && r.r3_p1 !== undefined) ? String(r.r3_p1) : "",
    _autoR2: autoR2,
    _autoR3: autoR3
  };
}

function mapContestResultToSupabase(row, contestType = "grenzland", year = null) {
  const targetYear = year || window._resultateYear || new Date().getFullYear();
  const pn = String(row.id || "").trim();
  const p1 = (val) => (val === "" || val == null) ? null : parseInt(String(val), 10);

  return {
    id: `${contestType}_${targetYear}_${pn}`,
    contest_type: contestType,
    year: targetYear,
    person_number: pn,
    name: String(row.name || "").trim(),
    r1_team: String(row.r1_team || "").trim(),
    r1_p1: p1(row.r1_p1),
    r2_team: String(row.r2_team || "").trim(),
    r2_p1: p1(row.r2_p1),
    r3_team: String(row.r3_team || "").trim(),
    r3_p1: p1(row.r3_p1),
    is_auto_r2: row._autoR2 !== false,
    is_auto_r3: row._autoR3 !== false,
    updated_at: new Date().toISOString()
  };
}

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
  // Standard-Grenzland-Teams falls Set leer
  if (set.size === 0) {
    set.add("Muhen 1");
    set.add("Muhen 2");
    set.add("Muhen 3");
  }
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
