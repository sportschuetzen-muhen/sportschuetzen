// =========================================================
//  RESULTATE (Grenzland) - Actions / Server Requests
//  Native Supabase Architecture mit Google Apps Script Dual-Write
// =========================================================

async function saveResultateData() {
  // 1. Validierung Punkte (nur 0-100 oder leer)
  for (const r of resultateState.rows) {
    if (!r.id) return alert("Es gibt eine Zeile ohne ID / Personennummer.");
    if (!isValidPoints(r.r1_p1) || !isValidPoints(r.r2_p1) || !isValidPoints(r.r3_p1)) {
      return alert("Bitte Punkte korrigieren: nur ganze Zahlen 0–100 (oder leer).");
    }
  }

  // 2. Limit-Check (Sperre) – max 4 pro Team, Pool ausgenommen
  const rounds = ["r1", "r2", "r3"];
  for (const rk of rounds) {
    const counts = new Map();
    resultateState.rows.forEach(r => {
      const t = (r[`${rk}_team`] || "").trim();
      if (!t || t === POOL_LABEL) return; // leer oder Pool
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    for (const [team, cnt] of counts.entries()) {
      if (cnt > TEAM_LIMIT) {
        const rLabel = rk === "r1" ? "Runde 1" : rk === "r2" ? "Runde 2" : "Runde 3";
        return alert(`${rLabel}: Team "${team}" hat ${cnt} Zuteilungen (max ${TEAM_LIMIT}). Bitte korrigieren (Pool ist unbegrenzt).`);
      }
    }
  }

  const btn = document.getElementById("btn-save-resultate");
  const original = btn ? btn.innerText : "Speichern";
  if (btn) { btn.disabled = true; btn.innerText = "Speichere..."; }

  const contestType = window._resultateContestType || "grenzland";
  const year = window._resultateYear || new Date().getFullYear();
  const supa = getResultateSupabaseClient();

  // Payload für GAS
  const payloadRows = resultateState.rows.map(r => ({
    id: r.id,
    r1_team: (r.r1_team === POOL_LABEL) ? "" : (r.r1_team || ""),
    r1_p1: r.r1_p1 || "",
    r2_team: (r.r2_team === POOL_LABEL) ? "" : (r.r2_team || ""),
    r2_p1: r.r2_p1 || "",
    r3_team: (r.r3_team === POOL_LABEL) ? "" : (r.r3_team || ""),
    r3_p1: r.r3_p1 || ""
  }));

  let savedSuccessfully = false;

  // 3. PRIMÄR: SUPABASE UPSERT (Single Source of Truth)
  if (supa) {
    try {
      const supaRows = resultateState.rows.map(r => mapContestResultToSupabase(r, contestType, year));
      console.log(`💾 [Supabase] Speichere ${supaRows.length} Resultate-Zeilen...`);

      const { data, error } = await supa.from('contest_results').upsert(supaRows, {
        onConflict: 'contest_type,year,person_number'
      });

      if (error) {
        console.error("❌ [Supabase] Fehler beim Speichern der Resultate:", error);
        throw error;
      }

      savedSuccessfully = true;
      window._resultateIsSupabase = true;
      if (typeof updateBackendBadge === 'function') updateBackendBadge();
      console.log("✅ [Supabase] Resultate erfolgreich gesichert.");
    } catch (supaErr) {
      alert("Fehler beim Speichern in Supabase: " + (supaErr.message || supaErr));
      if (btn) { btn.disabled = false; btn.innerText = original; }
      setStatus("Fehler beim Speichern", true);
      return;
    }
  } else {
    alert("Fehler: Kein Supabase Client verfügbar.");
    if (btn) { btn.disabled = false; btn.innerText = original; }
    setStatus("Fehler beim Speichern", true);
    return;
  }

  if (savedSuccessfully) {
    resultateState.isDirty = false;
    setStatus("✅ Gespeichert", false);

    if (btn) {
      btn.innerText = "✅ OK";
      setTimeout(() => { btn.innerText = original; btn.disabled = false; }, 1200);
    }
  }
}

async function syncSetupToResultate() {
  const btn = document.querySelector('button[onclick="syncSetupToResultate()"]');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Syncing…'; }

  const supa = getResultateSupabaseClient();
  const contestType = window._resultateContestType || "grenzland";
  const year = window._resultateYear || new Date().getFullYear();

  // 1. ZUERST IN SUPABASE PRÜFEN
  if (supa) {
    try {
      const { data: setupData, error: sErr } = await supa
        .from('contest_setups')
        .select('*')
        .eq('contest_type', contestType)
        .eq('year', year);

      if (!sErr && setupData && setupData.length > 0) {
        const existingIds = new Set(resultateState.rows.map(r => String(r.id)));
        const missing = setupData.filter(s => !existingIds.has(String(s.person_number)));

        if (missing.length > 0) {
          const newSupaRows = missing.map(s => {
            const team = (s.team || "").trim();
            return {
              id: `${contestType}_${year}_${s.person_number}`,
              contest_type: contestType,
              year: year,
              person_number: String(s.person_number),
              name: s.name,
              stellung: s.stellung || "liegend",
              r1_team: team,
              r1_p1: null,
              r2_team: team,
              r2_p1: null,
              r3_team: team,
              r3_p1: null,
              is_auto_r2: true,
              is_auto_r3: true
            };
          });

          const { error: insErr } = await supa.from('contest_results').upsert(newSupaRows, {
            onConflict: 'contest_type,year,person_number'
          });

          if (!insErr) {
            alert(`✅ ${missing.length} Schütze${missing.length === 1 ? '' : 'n'} aus Setup übernommen (Supabase).`);
            await loadResultateData(true);
            return;
          }
        } else {
          alert('Alle Setup-Schützen sind bereits in Resultate vorhanden – nichts hinzugefügt.');
          return;
        }
      }
    } catch (err) {
      console.warn("Supabase Setup-Sync:", err);
      alert("Fehler beim Synchronisieren des Setups: " + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    }
  }
}

async function pushOneSignalGrenzland() {
  alert("ℹ️ Push-Mitteilungen: Das Google Apps Script Backend ist entkoppelt. Mobile Push Notifications werden künftig über native Supabase Edge Functions verwaltet.");
}
