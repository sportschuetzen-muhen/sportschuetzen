// ==============================================================================
// endschiessen-core.js
// Fachmodul ENDSCHIESSEN (Saisonabschluss KK 50m) - State & Backend Engine
// Sportschützen Muhen - Supabase Single Source of Truth
// ==============================================================================

const EndschiessenState = {
    currentYear: '2026',
    seasons: [],
    currentSeason: null,
    stiche: [],
    activeStichCode: 'endstich',
    scoresByStich: {},          // { [stichId]: [ scoreObj, ... ] }
    finalParticipants: [],      // [ { person_number, start_rang, serie_1..8, total, ... } ]
    kkMembersPool: [],          // Aktive Mitglieder mit Kleinkaliber/50m-Lizenz
    hasUnsavedChanges: false,
    unsavedCount: 0,
    isLoading: false,
    isSyncing: false
};
window.EndschiessenState = EndschiessenState;

/**
 * Supabase Client Helper
 */
function getEndschiessenClient() {
    if (typeof window.getSupabaseClient === 'function') {
        return window.getSupabaseClient();
    }
    if (window.supabase) {
        return window.supabase;
    }
    throw new Error("Supabase Client nicht verfügbar.");
}

/**
 * Haupt-Ladefunktion für das Endschiessen
 */
async function loadEndschiessenData(forceYear = null) {
    const client = getEndschiessenClient();
    EndschiessenState.isLoading = true;
    if (typeof showLoadingOverlay === 'function') showLoadingOverlay("Lade Endschiessen...");

    try {
        // 1. Alle verfügbaren Saisons laden
        const { data: seasons, error: seasonsErr } = await client
            .from('endschiessen_seasons')
            .select('*')
            .order('jahr', { ascending: false });

        if (seasonsErr) throw seasonsErr;
        EndschiessenState.seasons = seasons || [];

        // Ziel-Jahr bestimmen
        let selectedYear = forceYear || EndschiessenState.currentYear;
        if (!EndschiessenState.seasons.find(s => s.jahr === selectedYear)) {
            selectedYear = EndschiessenState.seasons[0]?.jahr || '2026';
        }
        EndschiessenState.currentYear = selectedYear;
        EndschiessenState.currentSeason = EndschiessenState.seasons.find(s => s.jahr === selectedYear) || null;

        // 2. Stiche der aktuellen Saison laden
        const { data: stiche, error: sticheErr } = await client
            .from('endschiessen_stiche')
            .select('*')
            .eq('jahr', selectedYear)
            .order('sort_order', { ascending: true });

        if (sticheErr) throw sticheErr;
        EndschiessenState.stiche = stiche || [];

        // 3. Resultate aller Stiche laden (inklusive Mitglieder-Stammdaten)
        const { data: scores, error: scoresErr } = await client
            .from('endschiessen_scores')
            .select(`
                *,
                member:members(person_number, first_name, last_name, birth_date)
            `)
            .eq('jahr', selectedYear);

        if (scoresErr) throw scoresErr;

        // Nach Stich gruppieren und Ränge berechnen
        EndschiessenState.scoresByStich = {};
        for (const stich of EndschiessenState.stiche) {
            const stichScores = (scores || []).filter(s => s.stich_id === stich.id);
            EndschiessenState.scoresByStich[stich.id] = recalculateStichRankings(stichScores, stich.modus);
        }

        // 4. Final-Serien laden
        const { data: finalRows, error: finalErr } = await client
            .from('endschiessen_final_series')
            .select(`
                *,
                member:members(person_number, first_name, last_name, birth_date)
            `)
            .eq('jahr', selectedYear)
            .order('start_rang', { ascending: true });

        if (finalErr) throw finalErr;
        EndschiessenState.finalParticipants = recalculateFinalRankings(finalRows || []);

        // 5. KK-Schützenpool aus members + member_licenses laden
        await loadKKShooterPool();

        // 6. UI Rendern
        if (typeof renderEndschiessenUI === 'function') {
            renderEndschiessenUI();
        }

        EndschiessenState.hasUnsavedChanges = false;
        EndschiessenState.unsavedCount = 0;
        if (typeof updateEndschiessenSaveButton === 'function') {
            updateEndschiessenSaveButton();
        } else if (window.SaveButtonKit) {
            window.SaveButtonKit.update('btn-save-endschiessen', { count: 0 });
        }

    } catch (err) {
        console.error("❌ Fehler beim Laden von Endschiessen:", err);
        if (typeof showError === 'function') {
            showError("Fehler beim Laden des Endschiessens: " + err.message);
        }
    } finally {
        EndschiessenState.isLoading = false;
        if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
    }
}
window.loadEndschiessenData = loadEndschiessenData;

/**
 * Lädt alle aktiven Mitglieder mit Kleinkaliber-/50m-Lizenz
 */
async function loadKKShooterPool() {
    try {
        const client = getEndschiessenClient();
        const { data: members, error } = await client
            .from('members')
            .select(`
                person_number,
                first_name,
                last_name,
                birth_date,
                is_active,
                member_licenses(membership_category, license_category, license_type, is_active)
            `)
            .eq('is_active', true)
            .order('last_name', { ascending: true });

        if (error) throw error;

        // Filtern nach aktiven G50m-Lizenzen
        const currentYear = new Date().getFullYear();
        const kkPool = (members || []).filter(m => {
            const lic = m.member_licenses || [];
            return lic.some(l => 
                l.is_active && 
                l.membership_category && 
                (l.membership_category.includes('50m') || l.membership_category.toLowerCase().includes('kleinkaliber'))
            );
        }).map(m => {
            const birthYear = m.birth_date ? new Date(m.birth_date).getFullYear() : 0;
            return {
                person_number: m.person_number,
                first_name: m.first_name,
                last_name: m.last_name,
                birth_year: birthYear,
                is_junior: birthYear > 0 && birthYear >= (currentYear - 20)
            };
        });

        EndschiessenState.kkMembersPool = kkPool;
    } catch (e) {
        console.warn("⚠️ Konnte KK-Schützenpool nicht laden:", e);
    }
}

/**
 * Rangierung innerhalb eines Stichs berechnen
 */
function recalculateStichRankings(scores, modus) {
    if (!scores || !scores.length) return [];

    const list = [...scores];

    if (modus === 'standard_20') {
        // Endstich 20 Schuss:
        // 1. Total Ganzpunkte absteigend
        // 2. Zehnteltotal absteigend (Tiebreaker)
        // 3. Passe 2 Ganzpunkte
        // 4. Passe 2 Zehntel
        list.sort((a, b) => {
            if ((b.total_score || 0) !== (a.total_score || 0)) {
                return (b.total_score || 0) - (a.total_score || 0);
            }
            if ((b.total_decimal || 0) !== (a.total_decimal || 0)) {
                return (b.total_decimal || 0) - (a.total_decimal || 0);
            }
            if ((b.passe_2_score || 0) !== (a.passe_2_score || 0)) {
                return (b.passe_2_score || 0) - (a.passe_2_score || 0);
            }
            return (b.passe_2_decimal || 0) - (a.passe_2_decimal || 0);
        });

        // Ränge für Total vergeben
        list.forEach((item, idx) => {
            item.rang_total = idx + 1;
        });

        // Separate Zehntel-Ränge vergeben
        const decimalSorted = [...list].sort((a, b) => (b.total_decimal || 0) - (a.total_decimal || 0));
        decimalSorted.forEach((item, idx) => {
            const original = list.find(x => x.id === item.id);
            if (original) original.rang_decimal = idx + 1;
        });

    } else if (modus === 'differenzler') {
        // Differenzler: Kleinste Abweichung gewinnt
        list.forEach(item => {
            const target = parseFloat(item.target_score) || 0;
            const actual = parseFloat(item.total_score) || 0;
            item.diff_score = Math.abs(actual - target);
        });

        list.sort((a, b) => {
            if ((a.diff_score || 0) !== (b.diff_score || 0)) {
                return (a.diff_score || 0) - (b.diff_score || 0);
            }
            return (b.total_score || 0) - (a.total_score || 0); // Bei gleicher Differenz: höheres Total gewinnt
        });

        list.forEach((item, idx) => {
            item.rang_total = idx + 1;
        });

    } else if (modus === 'tiefschuss') {
        // Gabenstich: Bester Tiefschuss/Teiler (kleinster Wert gewinnt) ODER höchstes Total
        list.sort((a, b) => {
            if (a.tiefschuss && b.tiefschuss) {
                return a.tiefschuss - b.tiefschuss;
            }
            return (b.total_score || 0) - (a.total_score || 0);
        });

        list.forEach((item, idx) => {
            item.rang_total = idx + 1;
        });

    } else {
        // Standard-Sortierung nach Total absteigend
        list.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));
        list.forEach((item, idx) => {
            item.rang_total = idx + 1;
        });
    }

    return list;
}

/**
 * Berechnet Totals, Ränge und Eliminationen für den Final (Serien 1 bis 8)
 */
function recalculateFinalRankings(participants) {
    if (!participants || !participants.length) return [];

    const list = [...participants];

    // Total für jeden Teilnehmer berechnen
    list.forEach(p => {
        p.total_score = 
            (parseFloat(p.serie_1) || 0) +
            (parseFloat(p.serie_2) || 0) +
            (parseFloat(p.serie_3) || 0) +
            (parseFloat(p.serie_4) || 0) +
            (parseFloat(p.serie_5) || 0) +
            (parseFloat(p.serie_6) || 0) +
            (parseFloat(p.serie_7) || 0) +
            (parseFloat(p.serie_8) || 0);
    });

    // Nach Total absteigend sortieren
    list.sort((a, b) => (b.total_score || 0) - (a.total_score || 0));

    // Elimination nach Schweizer Modus:
    // Nach Serie 1 & 2: Rang 8 scheidet aus
    // Nach Serie 3: Rang 7 scheidet aus
    // Nach Serie 4: Rang 6 scheidet aus
    // Nach Serie 5: Rang 5 scheidet aus
    // Nach Serie 6: Rang 4 scheidet aus (Rang 3 Bronze)
    // Nach Serie 7: Gold & Silber Duell
    list.forEach((p, idx) => {
        p.final_rang = idx + 1;
    });

    return list;
}

/**
 * Speichert alle aktuellen Änderungen atomar in Supabase
 */
async function saveEndschiessenData() {
    const client = getEndschiessenClient();
    const btn = document.getElementById('btn-save-endschiessen');
    if (window.SaveButtonKit) {
        window.SaveButtonKit.update('btn-save-endschiessen', { isSaving: true });
    } else if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Speichern...`;
    }

    try {
        const year = EndschiessenState.currentYear;

        // 0. Vor dem Speichern alle Ränge und Totals verbindlich neu berechnen
        for (const stich of EndschiessenState.stiche) {
            const rawScores = EndschiessenState.scoresByStich[stich.id] || [];
            rawScores.forEach(entry => {
                if (stich.code === 'endstich' || stich.modus === 'standard_20') {
                    entry.total_score = (parseFloat(entry.passe_1_score) || 0) + (parseFloat(entry.passe_2_score) || 0);
                    entry.total_decimal = (parseFloat(entry.passe_1_decimal) || 0) + (parseFloat(entry.passe_2_decimal) || 0);
                }
            });
            EndschiessenState.scoresByStich[stich.id] = recalculateStichRankings(rawScores, stich.modus);
        }

        // 1. Scores speichern (Trennung von Insert für neue und Upsert für bestehende Zeilen)
        const newScoresToInsert = [];
        const existingScoresToUpsert = [];

        for (const stichId in EndschiessenState.scoresByStich) {
            const scores = EndschiessenState.scoresByStich[stichId] || [];
            for (const s of scores) {
                const isTemp = !s.id || String(s.id).startsWith('temp_');
                const row = {
                    jahr: year,
                    stich_id: s.stich_id,
                    person_number: s.person_number || null,
                    guest_name: s.guest_name || null,
                    passe_1_score: parseFloat(s.passe_1_score) || 0,
                    passe_1_decimal: parseFloat(s.passe_1_decimal) || 0,
                    passe_2_score: parseFloat(s.passe_2_score) || 0,
                    passe_2_decimal: parseFloat(s.passe_2_decimal) || 0,
                    total_score: parseFloat(s.total_score) || 0,
                    total_decimal: parseFloat(s.total_decimal) || 0,
                    target_score: s.target_score ? parseFloat(s.target_score) : null,
                    diff_score: s.diff_score ? parseFloat(s.diff_score) : null,
                    tiefschuss: s.tiefschuss ? parseInt(s.tiefschuss) : null,
                    rang_total: s.rang_total || null,
                    rang_decimal: s.rang_decimal || null,
                    remark: s.remark || null,
                    updated_at: new Date().toISOString()
                };

                if (isTemp) {
                    newScoresToInsert.push(row);
                } else {
                    row.id = s.id;
                    existingScoresToUpsert.push(row);
                }
            }
        }

        if (newScoresToInsert.length > 0) {
            const { error: insErr } = await client
                .from('endschiessen_scores')
                .insert(newScoresToInsert);
            if (insErr) throw insErr;
        }

        if (existingScoresToUpsert.length > 0) {
            const { error: scoreSaveErr } = await client
                .from('endschiessen_scores')
                .upsert(existingScoresToUpsert);
            if (scoreSaveErr) throw scoreSaveErr;
        }

        // 2. Final-Serien speichern
        if (EndschiessenState.finalParticipants && EndschiessenState.finalParticipants.length > 0) {
            const newFinals = [];
            const existingFinals = [];

            for (const f of EndschiessenState.finalParticipants) {
                const isTemp = !f.id || String(f.id).startsWith('temp_');
                const row = {
                    jahr: year,
                    person_number: f.person_number,
                    start_rang: f.start_rang,
                    serie_1: parseFloat(f.serie_1) || 0,
                    serie_2: parseFloat(f.serie_2) || 0,
                    serie_3: parseFloat(f.serie_3) || 0,
                    serie_4: parseFloat(f.serie_4) || 0,
                    serie_5: parseFloat(f.serie_5) || 0,
                    serie_6: parseFloat(f.serie_6) || 0,
                    serie_7: parseFloat(f.serie_7) || 0,
                    serie_8: parseFloat(f.serie_8) || 0,
                    total_score: parseFloat(f.total_score) || 0,
                    final_rang: f.final_rang || null,
                    is_eliminated: f.is_eliminated || false,
                    eliminated_in_serie: f.eliminated_in_serie || null,
                    updated_at: new Date().toISOString()
                };

                if (isTemp) {
                    newFinals.push(row);
                } else {
                    row.id = f.id;
                    existingFinals.push(row);
                }
            }

            if (newFinals.length > 0) {
                const { error: insFErr } = await client
                    .from('endschiessen_final_series')
                    .insert(newFinals);
                if (insFErr) throw insFErr;
            }

            if (existingFinals.length > 0) {
                const { error: finalSaveErr } = await client
                    .from('endschiessen_final_series')
                    .upsert(existingFinals);
                if (finalSaveErr) throw finalSaveErr;
            }
        }

        // Erfolgs-Feedback
        EndschiessenState.hasUnsavedChanges = false;
        EndschiessenState.unsavedCount = 0;
        if (typeof updateEndschiessenSaveButton === 'function') {
            updateEndschiessenSaveButton();
        } else if (window.SaveButtonKit) {
            window.SaveButtonKit.update('btn-save-endschiessen', { count: 0 });
        }

        if (typeof showToast === 'function') {
            showToast("Resultate des Endschiessens erfolgreich gespeichert! ✓", "success");
        }

        // Daten neu laden, um frische IDs zu erhalten
        await loadEndschiessenData(year);

    } catch (err) {
        console.error("❌ Fehler beim Speichern von Endschiessen:", err);
        if (typeof showError === 'function') {
            showError("Fehler beim Speichern: " + err.message);
        }
        if (typeof updateEndschiessenSaveButton === 'function') {
            updateEndschiessenSaveButton();
        } else if (btn) {
            btn.disabled = false;
        }
    }
}
window.saveEndschiessenData = saveEndschiessenData;

/**
 * Überträgt die Endstich-Ganzpunkte direkt in die Jahresmeisterschaft (jm_seasons)
 */
async function syncEndschiessenToJM() {
    const client = getEndschiessenClient();
    const year = EndschiessenState.currentYear;
    
    // Endstich finden
    const endstich = EndschiessenState.stiche.find(s => s.code === 'endstich');
    if (!endstich) {
        throw new Error("Endstich-Konfiguration nicht gefunden.");
    }

    const scores = EndschiessenState.scoresByStich[endstich.id] || [];
    if (!scores.length) {
        throw new Error("Keine Endstich-Resultate vorhanden, die übertragen werden könnten.");
    }

    // 1. Jahresmeisterschaft Zielsaison ermitteln:
    // Priorisiere die aktive, nicht-archivierte Saison ('current'), da das Portal diese standardmässig anzeigt.
    let { data: jmSeason, error: jmErr } = await client
        .from('jm_seasons')
        .select('*')
        .eq('is_archived', false)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (!jmSeason) {
        const { data: curSeason } = await client
            .from('jm_seasons')
            .select('*')
            .eq('jahr', 'current')
            .maybeSingle();
        jmSeason = curSeason;
    }

    if (!jmSeason) {
        const { data: byYear } = await client
            .from('jm_seasons')
            .select('*')
            .eq('jahr', year)
            .maybeSingle();
        jmSeason = byYear;
    }

    if (!jmSeason || !jmSeason.raw_grid || !Array.isArray(jmSeason.raw_grid)) {
        throw new Error(`Keine Jahresmeisterschaft zum Aktualisieren gefunden.`);
    }

    const grid = JSON.parse(JSON.stringify(jmSeason.raw_grid));
    
    // Endschiessen-Spalte suchen (Zeile 3, Index 2 ist Header)
    const headerRow = grid[2] || [];
    let endschiessenColIdx = -1;
    let endschiessenColIdxPct = -1;

    for (let c = 0; c < headerRow.length; c++) {
        const title = String(headerRow[c] || '').trim().toLowerCase();
        if ((title.includes('endschiessen') || title.includes('schlussmatch')) && !title.includes('%')) {
            endschiessenColIdx = c;
        } else if ((title.includes('endschiessen') || title.includes('schlussmatch')) && title.includes('%')) {
            endschiessenColIdxPct = c;
        }
    }

    if (endschiessenColIdx === -1) {
        throw new Error("In der Jahresmeisterschaft wurde keine Spalte mit 'Endschiessen' oder 'Schlussmatch' gefunden.");
    }

    // Schützenzeilen abgleichen (ab Zeile 5, Index 4)
    // Grid: col 1 = Nachname, col 2 = Vorname, col 4 = Lizenz/Personen-Nr.
    let updatedCount = 0;
    const nameColIdx = 1;
    const vornameColIdx = 2;
    const licenseColIdx = 4;

    for (let r = 4; r < grid.length; r++) {
        const row = grid[r];
        if (!row || (!row[nameColIdx] && !row[vornameColIdx])) continue;

        const rowLast = String(row[nameColIdx] || '').trim().toLowerCase();
        const rowFirst = String(row[vornameColIdx] || '').trim().toLowerCase();
        const rowLicense = String(row[licenseColIdx] || '').trim();

        // Passenden Schützen im Endstich suchen:
        // Exakter Abgleich von Nachname UND Vorname (verhindert Fehlzuordnungen bei gleichem Nachnamen!)
        const match = scores.find(s => {
            if (s.member) {
                const mLast = String(s.member.last_name || '').trim().toLowerCase();
                const mFirst = String(s.member.first_name || '').trim().toLowerCase();
                if (rowLast === mLast && rowFirst === mFirst) return true;
                if (s.person_number && rowLicense && rowLicense === String(s.person_number).trim()) return true;
            }
            if (s.guest_name) {
                const g = s.guest_name.trim().toLowerCase();
                if (g === `${rowLast} ${rowFirst}` || g === `${rowFirst} ${rowLast}`) return true;
            }
            return false;
        });

        if (match && match.total_score > 0) {
            // Endstich Total (max 200) eintragen
            row[endschiessenColIdx] = match.total_score;
            if (endschiessenColIdxPct !== -1) {
                row[endschiessenColIdxPct] = Number(((match.total_score / 200) * 100).toFixed(2));
            }
            updatedCount++;
        }
    }

    // Optional: Gesamte Jahresmeisterschaft inklusive Streichresultat & Totals neu berechnen
    if (typeof recalculateJMRawGrid === 'function') {
        try {
            recalculateJMRawGrid(grid);
        } catch (calcErr) {
            console.warn("⚠️ recalculateJMRawGrid Warnung:", calcErr);
        }
    }

    // Grid zurückschreiben in aktive Zielsaison
    const { error: updateErr } = await client
        .from('jm_seasons')
        .update({
            raw_grid: grid,
            updated_at: new Date().toISOString()
        })
        .eq('jahr', jmSeason.jahr);

    if (updateErr) throw updateErr;

    // Falls ein separates Jahr-Archiv für das gleiche Jahr existiert (z. B. '2026'), dieses ebenfalls synchron halten
    if (jmSeason.jahr !== year) {
        try {
            await client
                .from('jm_seasons')
                .update({
                    raw_grid: grid,
                    updated_at: new Date().toISOString()
                })
                .eq('jahr', year);
        } catch (syncYearErr) {
            console.warn("⚠️ Zusätzliche Jahres-Aktualisierung übersprungen:", syncYearErr);
        }
    }

    // Strukturierte Schützenliste (public.jm_shooters) für Website und App aktualisieren
    if (typeof syncJMShootersToSupabase === 'function') {
        try {
            await syncJMShootersToSupabase(client, jmSeason.jahr, grid);
        } catch (shootersErr) {
            console.warn("⚠️ syncJMShootersToSupabase Warnung:", shootersErr);
        }
    }

    return {
        success: true,
        updatedCount: updatedCount,
        columnTitle: headerRow[endschiessenColIdx],
        targetSeason: jmSeason.jahr === 'current' ? 'Jahresmeisterschaft (aktuell)' : jmSeason.jahr
    };
}
window.syncEndschiessenToJM = syncEndschiessenToJM;
