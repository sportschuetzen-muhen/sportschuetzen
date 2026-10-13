// =========================================================
//  RESULTATE (Mannschaft & G & G) - Actions / Server Requests
//  Native Supabase Architecture mit Multi-Wettbewerbs-Support
// =========================================================

async function saveResultateData() {
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('resultate')) {
    alert("Keine Schreibberechtigung für das Modul Resultate.");
    return;
  }

  const contestType = window._resultateContestType || "grenzland";
  const year = window._resultateYear || new Date().getFullYear();
  const supa = getResultateSupabaseClient();
  const limit = getContestLimit(contestType);
  const roundCount = getContestRoundCount(contestType);
  const maxPts = (contestType === "mannschaft") ? 200 : 100;

  // 1. Validierung Punkte
  for (const r of resultateState.rows) {
    if (!r.id) return alert("Es gibt eine Zeile ohne ID / Personennummer.");
    for (let i = 1; i <= roundCount; i++) {
      if (!isValidPoints(r[`r${i}_p1`], contestType)) {
        return alert(`Bitte Punkte korrigieren bei ${r.name}: Runde ${i} muss zwischen 0 und ${maxPts} liegen.`);
      }
      if (contestType === "gruppe" && i <= 3) {
        if (!isValidPoints(r[`r${i}_p2`], contestType)) {
          return alert(`Bitte Punkte korrigieren bei ${r.name}: Runde ${i} (Passe 2) muss zwischen 0 und 100 liegen.`);
        }
      }
    }
  }

  // 2. Limit-Check (Sperre) – max X pro Team, Pool ausgenommen
  for (let i = 1; i <= roundCount; i++) {
    const rk = `r${i}`;
    const counts = new Map();
    resultateState.rows.forEach(r => {
      const t = (r[`${rk}_team`] || "").trim();
      if (!t || t === POOL_LABEL) return; // leer oder Pool
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    for (const [team, cnt] of counts.entries()) {
      if (cnt > limit) {
        return alert(`Runde ${i}: Team "${team}" hat ${cnt} Zuteilungen (max ${limit}). Bitte korrigieren (Pool ist unbegrenzt).`);
      }
    }
  }

  const btn = document.getElementById("btn-save-resultate");
  if (typeof updateResultateSaveButtonState === 'function') {
    updateResultateSaveButtonState(true);
  } else if (btn) {
    btn.disabled = true;
    btn.innerText = "Speichere...";
  }

  // 3. PRIMÄR: SUPABASE UPSERT (Single Source of Truth)
  if (supa) {
    try {
      const supaRows = resultateState.rows.map(r => mapContestResultToSupabase(r, contestType, year));
      console.log(`💾 [Supabase] Speichere ${supaRows.length} Resultate-Zeilen für ${contestType} (${year})...`);

      const { data, error } = await supa.from('contest_results').upsert(supaRows, {
        onConflict: 'contest_type,year,person_number'
      });

      if (error) {
        console.error("❌ [Supabase] Fehler beim Speichern der Resultate:", error);
        throw error;
      }

      window._resultateIsSupabase = true;
      if (typeof updateBackendBadge === 'function') updateBackendBadge();
      console.log("✅ [Supabase] Resultate erfolgreich gesichert.");

      resultateState.isDirty = false;
      window._resultateOriginalRows = JSON.parse(JSON.stringify(resultateState.rows));
      setStatus("✅ Gespeichert", false);
      if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState(false);
    } catch (supaErr) {
      alert("Fehler beim Speichern in Supabase: " + (supaErr.message || supaErr));
      if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState(false);
      setStatus("Fehler beim Speichern", true);
    }
  } else {
    alert("Fehler: Kein Supabase Client verfügbar.");
    if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState(false);
    setStatus("Fehler beim Speichern", true);
  }
}

async function syncSetupToResultate() {
  const btn = document.querySelector('button[onclick="syncSetupToResultate()"]');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Syncing…'; }

  const supa = getResultateSupabaseClient();
  const contestType = window._resultateContestType || "grenzland";
  const year = window._resultateYear || new Date().getFullYear();

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
            const row = {
              id: `${contestType}_${year}_${s.person_number}`,
              contest_type: contestType,
              year: year,
              person_number: String(s.person_number),
              name: s.name,
              stellung: s.stellung || "liegend",
              is_auto_r2: true,
              is_auto_r3: true
            };
            for (let i = 1; i <= 7; i++) {
              row[`r${i}_team`] = team;
              row[`r${i}_p1`] = null;
              if (i <= 3) row[`r${i}_p2`] = null;
            }
            return row;
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
      } else {
        alert(`Keine Schützen im Setup für ${contestType} (${year}) gefunden.`);
      }
    } catch (err) {
      console.warn("Supabase Setup-Sync:", err);
      alert("Fehler beim Synchronisieren des Setups: " + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    }
  }
}

async function syncJmToContestMannschaftAction() {
  const supa = getResultateSupabaseClient();
  if (!supa) return alert("Kein Supabase-Client verfügbar.");
  const year = window._resultateYear || new Date().getFullYear();
  const confirmed = confirm(`Möchtest du die Resultate der Runden 1–7 für die Mannschaftsmeisterschaft aus der Jahresmeisterschaft (${year}) synchronisieren?`);
  if (!confirmed) return;

  try {
    setStatus("Synchronisiere aus Jahresmeisterschaft…", false);
    const { data, error } = await supa.rpc('sync_jm_to_contest_mannschaft', { p_year: year });
    if (error) throw error;
    alert(`✅ Synchronisation erfolgreich! ${data?.updated_count || 0} Schützen-Ergebnisse wurden aktualisiert.`);
    await loadResultateData(true);
  } catch (err) {
    console.error("Fehler bei JM-Synchronisation:", err);
    alert("Fehler bei der Synchronisation: " + (err.message || err));
    setStatus("Fehler", true);
  }
}
window.syncJmToContestMannschaftAction = syncJmToContestMannschaftAction;

async function pushOneSignalGrenzland() {
  alert("ℹ️ Push-Mitteilungen: Das Google Apps Script Backend ist entkoppelt. Mobile Push Notifications werden über native Supabase Edge Functions verwaltet.");
}
