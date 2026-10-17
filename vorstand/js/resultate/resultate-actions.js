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

      // 4. Automatische Synchronisation der Team-Zuteilungen in contest_setups (Team Manager)
      if (supaRows.length > 0) {
        const setupRows = resultateState.rows.map(r => {
          const team = (r.r1_team || r.r2_team || r.r3_team || "").trim();
          return {
            id: `setup_${contestType}_${year}_${r.id}`,
            contest_type: contestType,
            year: year,
            person_number: String(r.id),
            name: r.name,
            team: team === POOL_LABEL ? "" : team,
            stellung: r.stellung || "liegend"
          };
        });
        const { error: sErr } = await supa.from('contest_setups').upsert(setupRows, {
          onConflict: 'contest_type,year,person_number'
        });
        if (sErr) {
          console.warn("⚠️ [Supabase] Hinweis bei contest_setups Sync:", sErr);
        } else {
          console.log(`✅ [Supabase] ${setupRows.length} Schützen automatisch in Team Manager (contest_setups) synchronisiert.`);
        }
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
  const contestTitle = contestType === 'grenzland' ? 'Grenzland-Cup' : (contestType === 'mannschaft' ? 'Mannschaft' : 'Gruppe (SGM)');

  if (supa) {
    try {
      // 1. Setups aus contest_setups abfragen
      const { data: setupData, error: sErr } = await supa
        .from('contest_setups')
        .select('*')
        .eq('contest_type', contestType)
        .eq('year', year);

      if (sErr) throw sErr;

      if (!setupData || setupData.length === 0) {
        // Keine Schützen im Setup erfasst -> Intelligenter Dialog mit Optionen
        await openEmptySetupModal(contestType, year);
        return;
      }

      // 2. Bestehende Resultate für diesen Contest & Jahr laden
      const { data: existingRows, error: rErr } = await supa
        .from('contest_results')
        .select('*')
        .eq('contest_type', contestType)
        .eq('year', year);

      if (rErr) throw rErr;

      const setupShooterMap = new Map(setupData.map(s => [String(s.person_number), s]));
      const existingShooterMap = new Map((existingRows || []).map(r => [String(r.person_number), r]));

      // Sicherheitsbestätigung vor dem Ersetzen der Teams
      const proceed = confirm(
        `Möchtest du die Teams für ${contestTitle} (${year}) aus dem Team-Setup übernehmen?\n\n` +
        `Die Teams werden durch die ${setupData.length} Schützen aus dem Team Manager ersetzt.\n` +
        `• Schützen im Setup werden ihren Teams und Stellungen zugewiesen.\n` +
        `• Bestehende Schützen mit Punkten, die nicht mehr im Team sind, werden in den Pool verschoben.\n` +
        `• Bisherige Schützen ohne Punkte, die nicht im Setup sind, werden entfernt.`
      );
      if (!proceed) return;

      setStatus(`Synchronisiere Team-Setup für ${contestTitle} (${year})…`, false);

      const toUpsert = [];
      const toDeletePersonNumbers = [];

      // 3. Alle Schützen aus dem Setup übernehmen
      for (const s of setupData) {
        const pNum = String(s.person_number);
        const team = (s.team || "").trim();
        const stellung = s.stellung || "liegend";
        const existing = existingShooterMap.get(pNum);

        if (existing) {
          // Bestehender Schütze: Team und Stellung aktualisieren, geschossene Punkte behalten
          const updated = { ...existing };
          updated.name = s.name || existing.name;
          updated.stellung = stellung;
          for (let i = 1; i <= 7; i++) {
            updated[`r${i}_team`] = team;
          }
          toUpsert.push(updated);
        } else {
          // Neuer Schütze: In contest_results anlegen mit Team & Stellung, Punkte null
          const newRow = {
            id: `${contestType}_${year}_${pNum}`,
            contest_type: contestType,
            year: year,
            person_number: pNum,
            name: s.name,
            stellung: stellung,
            is_auto_r2: true,
            is_auto_r3: true
          };
          for (let i = 1; i <= 7; i++) {
            newRow[`r${i}_team`] = team;
            newRow[`r${i}_p1`] = null;
            if (i <= 3) newRow[`r${i}_p2`] = null;
          }
          toUpsert.push(newRow);
        }
      }

      // 4. Bestehende Schützen prüfen, die NICHT im Team-Setup sind
      let movedToPoolCount = 0;
      for (const [pNum, existing] of existingShooterMap.entries()) {
        if (!setupShooterMap.has(pNum)) {
          // Hat dieser Schütze geschossene Punkte?
          const hasPoints = [1, 2, 3, 4, 5, 6, 7].some(i => {
            const p1 = existing[`r${i}_p1`];
            const p2 = existing[`r${i}_p2`];
            return (p1 !== null && p1 !== "" && p1 !== undefined) || (p2 !== null && p2 !== "" && p2 !== undefined);
          });

          if (hasPoints) {
            // Hat Punkte: In den Pool verschieben (team = ""), damit keine Resultate verloren gehen, aber Teams sauber bleiben!
            const inPool = { ...existing };
            for (let i = 1; i <= 7; i++) {
              inPool[`r${i}_team`] = "";
            }
            toUpsert.push(inPool);
            movedToPoolCount++;
          } else {
            // Hat KEINE Punkte und ist nicht im Setup: Aus Resultaten entfernen (ersetzt)
            toDeletePersonNumbers.push(pNum);
          }
        }
      }

      // 5. In Supabase ausführen
      if (toDeletePersonNumbers.length > 0) {
        const { error: delErr } = await supa
          .from('contest_results')
          .delete()
          .eq('contest_type', contestType)
          .eq('year', year)
          .in('person_number', toDeletePersonNumbers);
        if (delErr) throw delErr;
      }

      if (toUpsert.length > 0) {
        const { error: upsErr } = await supa
          .from('contest_results')
          .upsert(toUpsert, { onConflict: 'contest_type,year,person_number' });
        if (upsErr) throw upsErr;
      }

      let infoMsg = `✅ Erfolgreich: Teams für ${contestTitle} (${year}) wurden aus dem Team-Setup übernommen.\n\n` +
        `• ${setupData.length} Schützen im Team-Setup synchronisiert.`;
      if (movedToPoolCount > 0) {
        infoMsg += `\n• ${movedToPoolCount} Schütze(n) mit Punkten in den Pool verschoben.`;
      }
      if (toDeletePersonNumbers.length > 0) {
        infoMsg += `\n• ${toDeletePersonNumbers.length} ersetzte(r) Schütze(n) ohne Punkte entfernt.`;
      }

      alert(infoMsg);
      await loadResultateData(true);
    } catch (err) {
      console.warn("Supabase Setup-Sync:", err);
      alert("Fehler beim Synchronisieren des Setups: " + (err.message || err));
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = origText; }
    }
  } else {
    alert("Fehler: Kein Supabase-Client verfügbar.");
    if (btn) { btn.disabled = false; btn.innerHTML = origText; }
  }
}

/**
 * Öffnet einen Auswahldialog wenn im Team Manager (contest_setups) für diesen Wettbewerb
 * noch keine Schützen erfasst sind (z. B. bei Grenzland vor dem ersten PDF-Import).
 */
async function openEmptySetupModal(contestType, year) {
  const supa = getResultateSupabaseClient();
  const prevYear = year - 1;
  let prevCount = 0;
  let currentResCount = 0;

  if (supa) {
    try {
      const [prevSetupsRes, prevResultsRes, curResultsRes] = await Promise.allSettled([
        supa.from('contest_setups').select('person_number', { count: 'exact', head: true }).eq('contest_type', contestType).eq('year', prevYear),
        supa.from('contest_results').select('person_number', { count: 'exact', head: true }).eq('contest_type', contestType).eq('year', prevYear),
        supa.from('contest_results').select('person_number', { count: 'exact', head: true }).eq('contest_type', contestType).eq('year', year)
      ]);
      const prevSetupsCnt = (prevSetupsRes.status === 'fulfilled' && prevSetupsRes.value.count) || 0;
      const prevResCnt = (prevResultsRes.status === 'fulfilled' && prevResultsRes.value.count) || 0;
      prevCount = prevSetupsCnt || prevResCnt;
      currentResCount = (curResultsRes.status === 'fulfilled' && curResultsRes.value.count) || 0;
    } catch (e) {
      console.warn("Konnte Vorjahres-Zähler nicht ermitteln:", e);
    }
  }

  let modalEl = document.getElementById('modal-empty-setup-dialog');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'modal-empty-setup-dialog';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    document.body.appendChild(modalEl);
  }

  const contestTitle = contestType === 'grenzland' ? 'Grenzland-Cup' : (contestType === 'mannschaft' ? 'Mannschaft' : 'Gruppe (SGM)');

  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered modal-lg">
      <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
        <div class="modal-header bg-dark text-white border-0 py-3">
          <h5 class="modal-title fw-bold">
            <i class="fas fa-users-cog text-info me-2"></i>Team-Setup für ${escapeHtml(contestTitle)} (${year})
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <div class="alert alert-warning border-0 rounded-3 d-flex align-items-center mb-4">
            <i class="fas fa-exclamation-circle fa-2x text-warning me-3"></i>
            <div>
              <div class="fw-bold">Keine Schützen im Team Manager erfasst</div>
              <div class="small text-muted">
                In <code>public.contest_setups</code> wurden für <strong>${escapeHtml(contestTitle)} (${year})</strong> bisher keine Schützen-Zuteilungen hinterlegt.
              </div>
            </div>
          </div>

          <p class="text-muted mb-3">Wie möchtest du das Team-Setup initialisieren?</p>

          <div class="row g-3">
            ${currentResCount > 0 ? `
              <div class="col-12">
                <div class="card border rounded-3 p-3 h-100 bg-light border-primary-subtle shadow-sm">
                  <div class="d-flex justify-content-between align-items-center flex-wrap gap-2">
                    <div>
                      <div class="fw-bold text-dark"><i class="fas fa-database text-primary me-2"></i>Aus bestehenden Resultaten (${currentResCount} Schützen)</div>
                      <div class="small text-muted">Für ${year} sind bereits Schützen in den Resultaten vorhanden. Diese jetzt ins Team-Setup (Team Manager) übernehmen.</div>
                    </div>
                    <button class="btn btn-primary fw-bold btn-sm px-3" onclick="syncResultsToSetupAction('${escapeHtml(contestType)}', ${year})">
                      <i class="fas fa-sync-alt me-1"></i>Jetzt übernehmen
                    </button>
                  </div>
                </div>
              </div>
            ` : ''}

            <div class="col-12 col-md-6">
              <div class="card border rounded-3 p-3 h-100 bg-light d-flex flex-column justify-content-between shadow-sm">
                <div>
                  <div class="fw-bold text-dark mb-1"><i class="fas fa-history text-info me-2"></i>Aus Vorjahr (${prevYear}) übernehmen</div>
                  <div class="small text-muted mb-3">
                    Übernimmt die Schützen und Team-Zuteilungen aus der Saison ${prevYear} (ohne Punkte).
                    ${prevCount > 0 ? `<br><span class="badge bg-info-subtle text-info border border-info-subtle mt-1">${prevCount} Schützen verfügbar</span>` : ''}
                  </div>
                </div>
                <button class="btn btn-outline-primary btn-sm fw-bold w-100 mt-2" onclick="importSetupFromPreviousYearAction('${escapeHtml(contestType)}', ${year}, ${prevYear})">
                  <i class="fas fa-arrow-alt-circle-down me-1"></i>Aus Vorjahr (${prevYear}) laden
                </button>
              </div>
            </div>

            <div class="col-12 col-md-6">
              <div class="card border rounded-3 p-3 h-100 bg-light d-flex flex-column justify-content-between shadow-sm">
                <div>
                  <div class="fw-bold text-dark mb-1"><i class="fas fa-file-pdf text-success me-2"></i>Teams leer lassen</div>
                  <div class="small text-muted mb-3">
                    Empfohlen bei Grenzland: Die Teams bleiben vorerst leer. Vorhandene Schützen-Einträge für diese Saison werden entfernt. Sobald die erste offizielle PDF-Rangliste vorliegt, werden die Teams und Schützen beim Ranglisten-Import vollautomatisch gebildet.
                  </div>
                </div>
                <button class="btn btn-outline-success btn-sm fw-bold w-100 mt-2" onclick="leaveTeamsEmptyForPdfAction('${escapeHtml(contestType)}', ${year})">
                  <i class="fas fa-check me-1"></i>Teams leer lassen & auf PDF warten
                </button>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-footer border-0 bg-light p-3">
          <button type="button" class="btn btn-secondary btn-sm px-3" data-bs-dismiss="modal">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}
window.openEmptySetupModal = openEmptySetupModal;

/**
 * Synchronisiert bestehende contest_results ins contest_setups (Team Manager).
 */
async function syncResultsToSetupAction(contestType, year) {
  const supa = getResultateSupabaseClient();
  if (!supa) return alert("Kein Supabase Client verfügbar.");

  try {
    const { data: resRows, error: rErr } = await supa
      .from('contest_results')
      .select('*')
      .eq('contest_type', contestType)
      .eq('year', year);

    if (rErr) throw rErr;
    if (!resRows || resRows.length === 0) {
      alert(`Keine Resultate für ${contestType} (${year}) gefunden.`);
      return;
    }

    const setupRows = resRows.map(r => {
      const team = (r.r1_team || r.r2_team || r.r3_team || "").trim();
      return {
        id: `setup_${contestType}_${year}_${r.person_number}`,
        contest_type: contestType,
        year: year,
        person_number: String(r.person_number),
        name: r.name,
        team: team === POOL_LABEL ? "" : team,
        stellung: r.stellung || "liegend"
      };
    });

    // Zuerst bestehende Setups für diesen Contest & Jahr löschen (verhindert alte Verwaiste)
    await supa.from('contest_setups').delete().eq('contest_type', contestType).eq('year', year);

    const { error: sErr } = await supa.from('contest_setups').upsert(setupRows, {
      onConflict: 'contest_type,year,person_number'
    });
    if (sErr) throw sErr;

    const modalEl = document.getElementById('modal-empty-setup-dialog');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    alert(`✅ Erfolgreich: ${setupRows.length} Schützen aus den Resultaten ins Team-Setup (Team Manager) übernommen.`);
    await loadResultateData(true);
  } catch (err) {
    console.error("Fehler beim Synchronisieren der Resultate ins Setup:", err);
    alert("Fehler bei der Synchronisation: " + (err.message || err));
  }
}
window.syncResultsToSetupAction = syncResultsToSetupAction;

/**
 * Übernimmt Schützen und Team-Zuweisungen aus dem Vorjahr (Punkte null).
 */
async function importSetupFromPreviousYearAction(contestType, year, prevYear) {
  const supa = getResultateSupabaseClient();
  if (!supa) return alert("Kein Supabase Client verfügbar.");

  try {
    let sourceShooters = [];
    const { data: prevSetups, error: sErr } = await supa
      .from('contest_setups')
      .select('*')
      .eq('contest_type', contestType)
      .eq('year', prevYear);

    if (!sErr && prevSetups && prevSetups.length > 0) {
      sourceShooters = prevSetups.map(s => ({
        person_number: String(s.person_number),
        name: s.name,
        team: (s.team || "").trim(),
        stellung: s.stellung || "liegend"
      }));
    } else {
      const { data: prevResults, error: rErr } = await supa
        .from('contest_results')
        .select('*')
        .eq('contest_type', contestType)
        .eq('year', prevYear);

      if (!rErr && prevResults && prevResults.length > 0) {
        sourceShooters = prevResults.map(r => ({
          person_number: String(r.person_number),
          name: r.name,
          team: (r.r1_team || r.r2_team || r.r3_team || "").trim(),
          stellung: r.stellung || "liegend"
        }));
      }
    }

    if (sourceShooters.length === 0) {
      alert(`ℹ️ Im Vorjahr (${prevYear}) wurden für ${contestType} keine Schützen im Setup oder in den Resultaten gefunden.`);
      return;
    }

    const newSetups = sourceShooters.map(s => ({
      id: `setup_${contestType}_${year}_${s.person_number}`,
      contest_type: contestType,
      year: year,
      person_number: s.person_number,
      name: s.name,
      team: s.team === POOL_LABEL ? "" : s.team,
      stellung: s.stellung || "liegend"
    }));

    const newResults = sourceShooters.map(s => {
      const row = {
        id: `${contestType}_${year}_${s.person_number}`,
        contest_type: contestType,
        year: year,
        person_number: s.person_number,
        name: s.name,
        stellung: s.stellung || "liegend",
        is_auto_r2: true,
        is_auto_r3: true
      };
      for (let i = 1; i <= 7; i++) {
        row[`r${i}_team`] = s.team;
        row[`r${i}_p1`] = null;
        if (i <= 3) row[`r${i}_p2`] = null;
      }
      return row;
    });

    // Sauberes Ersetzen für das neue Jahr (kein Überfüllen durch Altbestände)
    await Promise.all([
      supa.from('contest_setups').delete().eq('contest_type', contestType).eq('year', year),
      supa.from('contest_results').delete().eq('contest_type', contestType).eq('year', year)
    ]);

    const [insSetupsRes, insResultsRes] = await Promise.all([
      supa.from('contest_setups').upsert(newSetups, { onConflict: 'contest_type,year,person_number' }),
      supa.from('contest_results').upsert(newResults, { onConflict: 'contest_type,year,person_number' })
    ]);

    if (insSetupsRes.error) throw insSetupsRes.error;
    if (insResultsRes.error) throw insResultsRes.error;

    const modalEl = document.getElementById('modal-empty-setup-dialog');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    alert(`✅ Erfolgreich: ${sourceShooters.length} Schützen aus der Saison ${prevYear} für ${year} übernommen.`);
    await loadResultateData(true);
  } catch (err) {
    console.error("Fehler beim Vorjahres-Import:", err);
    alert("Fehler bei der Vorjahres-Übernahme: " + (err.message || err));
  }
}
window.importSetupFromPreviousYearAction = importSetupFromPreviousYearAction;

/**
 * Belässt Teams leer, damit diese beim ersten PDF-Ranglisten-Import gebildet werden.
 * Bereinigt bestehende Daten in contest_results und contest_setups für diese Saison.
 */
async function leaveTeamsEmptyForPdfAction(contestType, year) {
  const supa = getResultateSupabaseClient();
  const contestTitle = contestType === 'grenzland' ? 'Grenzland-Cup' : (contestType === 'mannschaft' ? 'Mannschaft' : 'Gruppe (SGM)');
  const currentCount = (resultateState.rows && resultateState.rows.length) || 0;

  if (currentCount > 0) {
    const proceed = confirm(
      `Möchtest du alle bestehenden Einträge (${currentCount} Schützen) für ${contestTitle} (${year}) wirklich entfernen?\n\n` +
      `Die Einträge werden gelöscht, damit du mit leeren Teams auf den offiziellen PDF-Ranglisten-Import warten kannst.`
    );
    if (!proceed) return;
  }

  const modalEl = document.getElementById('modal-empty-setup-dialog');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  if (supa) {
    try {
      setStatus(`Bereinige Daten für ${contestTitle} (${year})…`, false);

      // 1. contest_results für diese Saison löschen
      const { error: delResErr } = await supa
        .from('contest_results')
        .delete()
        .eq('contest_type', contestType)
        .eq('year', year);
      if (delResErr) throw delResErr;

      // 2. contest_setups für diese Saison bereinigen
      const { error: delSetupErr } = await supa
        .from('contest_setups')
        .delete()
        .eq('contest_type', contestType)
        .eq('year', year);
      if (delSetupErr) console.warn("Hinweis beim Löschen von contest_setups:", delSetupErr);

      // 3. Lokalen State leeren
      resultateState.rows = [];
      resultateState.isDirty = false;
      window._resultateOriginalRows = [];

      // 4. UI neu laden & synchronisieren
      await loadResultateData(true);

      setStatus(`Teams für ${contestTitle} geleert (bereit für PDF-Ranglisten-Import)`, false);
      alert(`✅ Die bestehenden Daten für ${contestTitle} (${year}) wurden entfernt.\n\nDie Teams sind nun leer. Sobald die erste offizielle Rangliste (PDF) vorliegt, wähle im Menü «⚡ Aktionen -> Grenzland Rangliste importieren (PDF)». Die Teams und Schützen werden dabei vollautomatisch gebildet.`);
    } catch (err) {
      console.error("Fehler beim Bereinigen der Teams:", err);
      alert("Fehler beim Entfernen der bestehenden Daten: " + (err.message || err));
      setStatus("Fehler beim Bereinigen", true);
    }
  } else {
    resultateState.rows = [];
    resultateState.isDirty = false;
    window._resultateOriginalRows = [];
    renderUI();
    setStatus(`Teams für ${contestTitle} lokal geleert`, false);
  }
}
window.leaveTeamsEmptyForPdfAction = leaveTeamsEmptyForPdfAction;

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

async function executeArchiveSeasonAction() {
  const supa = getResultateSupabaseClient();
  if (!supa) return alert("Kein Supabase-Client verfügbar.");

  const contestType = window._resultateContestType || "gruppe";
  const sourceYear = window._resultateYear || new Date().getFullYear();

  const targetInput = document.getElementById("archive-target-year");
  const targetYear = parseInt(targetInput ? targetInput.value : "", 10);

  if (isNaN(targetYear) || targetYear < 2000 || targetYear > 2100) {
    alert("Bitte gib ein gültiges Zieljahr zwischen 2000 und 2100 ein.");
    if (targetInput) targetInput.focus();
    return;
  }

  if (targetYear === sourceYear) {
    alert(`Das Zieljahr (${targetYear}) darf nicht identisch mit dem bisherigen Archivjahr (${sourceYear}) sein.`);
    if (targetInput) targetInput.focus();
    return;
  }

  const btnConfirm = document.getElementById("btn-confirm-archive-season");
  const origBtnHtml = btnConfirm ? btnConfirm.innerHTML : '';
  if (btnConfirm) {
    btnConfirm.disabled = true;
    btnConfirm.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Initialisiere...';
  }

  try {
    // 1. Duplikat-/Kollisionsprüfung in Supabase
    const { data: existingData, error: checkErr } = await supa
      .from('contest_results')
      .select('person_number')
      .eq('contest_type', contestType)
      .eq('year', targetYear);

    if (checkErr) {
      console.warn("Fehler bei Kollisionsprüfung:", checkErr);
    } else if (existingData && existingData.length > 0) {
      const proceed = confirm(
        `Achtung: Für die Saison ${targetYear} (${contestType.toUpperCase()}) existieren bereits ${existingData.length} Schützen-Einträge in der Datenbank.\n\n` +
        `Möchtest du fortfahren? Vorhandene Schützen-Einträge für ${targetYear} werden aktualisiert.`
      );
      if (!proceed) {
        if (btnConfirm) { btnConfirm.disabled = false; btnConfirm.innerHTML = origBtnHtml; }
        return;
      }
    }

    setStatus(`Initialisiere Saison ${targetYear}…`, false);

    // 2. Daten für neues Zieljahr mappen
    if (resultateState.rows && resultateState.rows.length > 0) {
      const newRows = resultateState.rows.map(r => {
        const row = {
          id: `${contestType}_${targetYear}_${r.id}`,
          contest_type: contestType,
          year: targetYear,
          person_number: String(r.id),
          name: r.name,
          stellung: r.stellung || "liegend",
          is_auto_r2: true,
          is_auto_r3: true,
          r1_team: r.r1_team || "",
          r2_team: r.r2_team || r.r1_team || "",
          r3_team: r.r3_team || r.r2_team || "",
          r1_p1: null,
          r1_p2: null,
          r2_p1: null,
          r2_p2: null,
          r3_p1: null,
          r3_p2: null
        };
        for (let i = 4; i <= 7; i++) {
          row[`r${i}_team`] = r[`r${i}_team`] || "";
          row[`r${i}_p1`] = null;
        }
        return row;
      });

      const { error: insErr } = await supa.from('contest_results').upsert(newRows, {
        onConflict: 'contest_type,year,person_number'
      });
      if (insErr) throw insErr;
    }

    // Modal schliessen
    const modalEl = document.getElementById('modal-archive-resultate-season');
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }

    // Verfügbare Jahre aktualisieren & zur neuen Saison wechseln
    if (!resultateState.availableYears.includes(targetYear)) {
      resultateState.availableYears.push(targetYear);
      resultateState.availableYears.sort((a, b) => b - a);
    }

    alert(`✅ Saison ${targetYear} wurde erfolgreich initialisiert! Wechsle zur neuen Saison.`);
    window._resultateYear = targetYear;
    await loadResultateData(true);
  } catch (err) {
    console.error("Fehler beim Archivieren/Initialisieren:", err);
    alert("Fehler: " + (err.message || err));
    setStatus("Fehler beim Archivieren", true);
  } finally {
    if (btnConfirm) {
      btnConfirm.disabled = false;
      btnConfirm.innerHTML = origBtnHtml;
    }
  }
}
window.executeArchiveSeasonAction = executeArchiveSeasonAction;

function archiveCurrentContestSeasonAction() {
  if (typeof openArchiveSeasonModal === 'function') {
    openArchiveSeasonModal();
  }
}
window.archiveCurrentContestSeasonAction = archiveCurrentContestSeasonAction;

