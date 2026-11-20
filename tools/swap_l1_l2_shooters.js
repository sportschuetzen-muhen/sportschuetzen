/**
 * tools/swap_l1_l2_shooters.js
 * Korrigiert die Ligenzuordnung zwischen Liga 1 und Liga 2 für Saison 2026:
 * - Erich Hunziker (bisher fälschlicherweise Zeile 11 / Liga 1) -> Zeile 15 (Liga 2)
 * - Jürg Luginbühl (bisher fälschlicherweise Zeile 15 / Liga 2) -> Zeile 11 (Liga 1)
 * Anschliessend Neuberechnung der Ränge und Synchronisation nach Supabase.
 */

const fs = require('fs');
const path = require('path');

const SUPABASE_URL = "https://supabase-muhen.danfamily.uk/rest/v1";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

const HEADERS = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": "return=representation"
};

// Berechnungsfunktionen direkt einbinden (identisch zu jahresmeisterschaft-import.js)
function updateTopMannschaft(grid) {
    if (!grid || grid.length < 6) return;

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }
    const rawStart = hasStatusCol ? 34 : 33;
    const rawCols = [rawStart, rawStart + 1, rawStart + 2, rawStart + 3, rawStart + 4, rawStart + 5, rawStart + 6];

    if (grid[3]) {
        rawCols.forEach((c) => {
            if (!grid[3][c] || grid[3][c] === '') {
                grid[3][c] = 200;
            }
        });
    }

    const targetCols = [
        hasStatusCol ? 10 : 9,
        hasStatusCol ? 11 : 10,
        hasStatusCol ? 12 : 11,
        hasStatusCol ? 13 : 12
    ];
    const pctCols = [
        hasStatusCol ? 23 : 22,
        hasStatusCol ? 24 : 23,
        hasStatusCol ? 25 : 24,
        hasStatusCol ? 26 : 25
    ];

    const maxPoints = parseFloat(grid[3][targetCols[0]]) || 200;

    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;

        const scores = [];
        rawCols.forEach(colIdx => {
            const val = grid[r][colIdx];
            if (val !== undefined && val !== null && val !== '') {
                const num = parseFloat(String(val).replace(',', '.'));
                if (!isNaN(num) && num > 0) {
                    scores.push(num);
                }
            }
        });

        scores.sort((a, b) => b - a);

        for (let i = 0; i < 4; i++) {
            const targetCol = targetCols[i];
            const pctCol = pctCols[i];
            if (scores[i] !== undefined && scores[i] > 0) {
                grid[r][targetCol] = scores[i];
                if (pctCol !== undefined) {
                    grid[r][pctCol] = Math.round(((scores[i] / maxPoints) * 100) * 100) / 100;
                }
            } else {
                grid[r][targetCol] = '';
                if (pctCol !== undefined) {
                    grid[r][pctCol] = '';
                }
            }
        }
    }
}

function updateTopAuswaertige(grid) {
    if (!grid || grid.length < 6) return;
    const compRow = grid[2] || [];

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }

    const colAusw1 = hasStatusCol ? 15 : 14;
    const colAusw2 = hasStatusCol ? 16 : 15;
    const colAusw1Pct = hasStatusCol ? 28 : 27;
    const colAusw2Pct = hasStatusCol ? 29 : 28;

    const startDynamic = hasStatusCol ? 42 : 41;
    const maxCols = compRow.length;

    const isChecked1 = ['ja', 'j', 'x', '1', 'true', true, 'yes', '✓', '✔', '☑'].includes(
        typeof grid[0][colAusw1] === 'string' ? grid[0][colAusw1].trim().toLowerCase() : grid[0][colAusw1]
    );
    const isChecked2 = ['ja', 'j', 'x', '1', 'true', true, 'yes', '✓', '✔', '☑'].includes(
        typeof grid[0][colAusw2] === 'string' ? grid[0][colAusw2].trim().toLowerCase() : grid[0][colAusw2]
    );

    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;

        const results = [];
        for (let c = startDynamic; c < maxCols; c++) {
            const title = String(compRow[c] || '').trim();
            if (!title || title.toLowerCase().includes('%') || title.toLowerCase().startsWith('spalte')) continue;

            const rawVal = grid[r][c];
            if (rawVal !== undefined && rawVal !== null && rawVal !== '') {
                const pts = parseFloat(String(rawVal).replace(',', '.'));
                const maxVal = parseFloat(grid[3][c]) || 100;
                if (!isNaN(pts) && pts > 0 && maxVal > 0) {
                    const pct = (pts / maxVal) * 100;
                    results.push({ pts, pct, max: maxVal, col: c });
                }
            }
        }

        results.sort((a, b) => b.pct - a.pct);

        if (isChecked1 && results.length > 0) {
            grid[r][colAusw1] = results[0].pts;
            grid[r][colAusw1Pct] = Math.round(results[0].pct * 100) / 100;
        } else {
            grid[r][colAusw1] = '';
            grid[r][colAusw1Pct] = '';
        }

        if (isChecked2 && results.length > 1) {
            grid[r][colAusw2] = results[1].pts;
            grid[r][colAusw2Pct] = Math.round(results[1].pct * 100) / 100;
        } else {
            grid[r][colAusw2] = '';
            grid[r][colAusw2Pct] = '';
        }
    }
}

function recalculateJMRawGrid(grid) {
    if (!grid || grid.length < 6) return 1000;

    updateTopMannschaft(grid);
    updateTopAuswaertige(grid);

    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }

    const colTotal = hasStatusCol ? 19 : 18;
    const colStreich = hasStatusCol ? 32 : 31;
    const firstCompCol = hasStatusCol ? 7 : 6;
    const colAusw1 = hasStatusCol ? 15 : 14;
    const colAusw2 = hasStatusCol ? 16 : 15;

    let activeCount = 0;
    const activeCompCols = [];

    for (let c = firstCompCol; c < colTotal; c++) {
        const title = String(grid[2][c] || '').trim();
        if (!title || title.toLowerCase() === 'leer') continue;

        const checkVal = grid[0][c];
        const isChecked = ['ja', 'j', 'x', '1', 'true', true, 'yes', '✓', '✔', '☑'].includes(
            typeof checkVal === 'string' ? checkVal.trim().toLowerCase() : checkVal
        );
        if (isChecked) {
            activeCount++;
            activeCompCols.push(c);
        }
    }

    const maxPercent = activeCount > 1 ? (activeCount - 1) * 100 : activeCount * 100;
    grid[3][colTotal] = `MAX. = ${maxPercent} %`;

    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;

        let shooterTotalPct = 0;
        const validPercentages = [];

        activeCompCols.forEach(compCol => {
            const compTitle = String(grid[2][compCol] || '').trim();
            const pctCol = grid[2].findIndex((t, idx) => idx > colTotal && String(t || '').trim().toLowerCase() === (compTitle.toLowerCase() + ' %'));

            let pctVal = 0;
            const isAuswSlot = (compCol === colAusw1 || compCol === colAusw2);
            if (isAuswSlot) {
                if (pctCol !== -1 && grid[r][pctCol] !== undefined && grid[r][pctCol] !== '') {
                    pctVal = parseFloat(String(grid[r][pctCol]).replace(',', '.')) || 0;
                }
            } else {
                const ptsRaw = grid[r][compCol];
                const maxPts = parseFloat(grid[3][compCol]) || 100;

                if (ptsRaw !== undefined && ptsRaw !== null && ptsRaw !== '') {
                    const pts = parseFloat(String(ptsRaw).replace(',', '.')) || 0;
                    if (pts > 0 && maxPts > 0) {
                        pctVal = (pts / maxPts) * 100;
                        if (pctCol !== -1) {
                            grid[r][pctCol] = Math.round(pctVal * 100) / 100;
                        }
                    } else if (pctCol !== -1) {
                        grid[r][pctCol] = 0;
                    }
                } else if (pctCol !== -1 && grid[r][pctCol] !== undefined && grid[r][pctCol] !== '') {
                    pctVal = parseFloat(String(grid[r][pctCol]).replace(',', '.')) || 0;
                }
            }

            if (pctVal > 0) {
                validPercentages.push(pctVal);
            }
            shooterTotalPct += pctVal;
        });

        let streich = 0;
        if (activeCount > 1 && validPercentages.length >= activeCount) {
            streich = Math.min(...validPercentages);
        }

        if (grid[r][colStreich] !== undefined) {
            grid[r][colStreich] = streich > 0 ? (Math.round(streich * 100) / 100) : 0;
        }

        const finalTotal = Math.max(0, shooterTotalPct - streich);
        grid[r][colTotal] = Math.round(finalTotal * 100) / 100;
    }

    return maxPercent;
}

function updateRanksInGrid(grid) {
    let hasStatusCol = false;
    if (grid[4]) {
        hasStatusCol = grid[4].some(val => String(val || '').trim().toLowerCase() === 'status');
    }
    const colTotal = hasStatusCol ? 19 : 18;

    // Liga 1: Zeilen 5 bis 12
    const l1 = [];
    for (let r = 5; r <= 12; r++) {
        if (!grid[r]) continue;
        const total = parseFloat(String(grid[r][colTotal] || '').replace(/%/g, '').trim()) || 0;
        l1.push({ r, total });
    }
    l1.sort((a, b) => b.total - a.total);
    l1.forEach((item, idx) => {
        grid[item.r][0] = String(idx + 1);
    });

    // Liga 2: Zeilen 15 bis Ende
    const l2 = [];
    for (let r = 15; r < grid.length; r++) {
        if (!grid[r]) continue;
        const nachname = String(grid[r][1] || '').trim();
        if (!nachname) continue;
        const total = parseFloat(String(grid[r][colTotal] || '').replace(/%/g, '').trim()) || 0;
        l2.push({ r, total });
    }
    l2.sort((a, b) => b.total - a.total);
    l2.forEach((item, idx) => {
        grid[item.r][0] = String(idx + 1);
    });
}

function buildShootersList(jahr, grid, maxPercent) {
    const compRow = grid[2] || [];
    const headerRow = grid[4] || [];

    const colRang = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'rang');
    const colNachname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'nachname');
    const colVorname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'vorname');
    const colLizenz = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('lizenz'));
    const colJahrgang = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('jahrgang'));
    const colStatus = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'status');
    const colTotal = compRow.findIndex(t => String(t || '').toLowerCase().includes('total'));
    const colStreich = compRow.findIndex(t => String(t || '').toLowerCase().includes('streich'));

    const firstCompCol = (colStatus !== -1 ? colStatus : headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('kombination'))) + 1;
    const competitions = [];
    for (let c = firstCompCol; c < colTotal; c++) {
        const name = String(compRow[c] || '').trim();
        if (name && name.toLowerCase() !== 'leer') {
            const pctCol = compRow.findIndex((t, idx) => idx > colTotal && String(t || '').trim().toLowerCase() === (name.toLowerCase() + ' %'));
            competitions.push({ col: c, name, pctCol });
        }
    }

    const mannschaftCols = [];
    for (let c = colStreich + 1; c < compRow.length; c++) {
        const name = String(compRow[c] || '').trim();
        if (name.toLowerCase().startsWith('mannschaft #')) {
            mannschaftCols.push({ col: c, name });
        }
    }

    const lastMannschaftCol = mannschaftCols.length > 0 ? mannschaftCols[mannschaftCols.length - 1].col : colStreich;
    const auswaertsCols = [];
    for (let c = lastMannschaftCol + 1; c < compRow.length; c++) {
        const name = String(compRow[c] || '').trim();
        if (name && name.toLowerCase() !== 'leer') {
            auswaertsCols.push({ col: c, name });
        }
    }

    const shooters = [];

    // Liga 1: 5 bis 12
    for (let r = 5; r <= 12; r++) {
        if (!grid[r]) continue;
        const nachname = String(grid[r][colNachname] || '').trim();
        const vorname = String(grid[r][colVorname] || '').trim();
        if (!nachname) continue;

        const fullName = `${nachname} ${vorname}`.trim();
        const lizenz = String(grid[r][colLizenz] || '').trim();
        const rangVal = parseInt(grid[r][colRang]) || (r - 4);
        const total = colTotal !== -1 ? (parseFloat(grid[r][colTotal]) || 0) : 0;
        const streich = colStreich !== -1 ? (parseFloat(grid[r][colStreich]) || 0) : 0;
        const jg = parseInt(grid[r][colJahrgang]) || null;
        const isJunior = jg ? (new Date().getFullYear() - jg <= 20) : false;

        const schiessen = competitions.map(comp => ({
            name: comp.name,
            punkte: parseFloat(grid[r][comp.col]) || 0,
            prozent: comp.pctCol !== -1 ? (parseFloat(grid[r][comp.pctCol]) || 0) : 0
        }));

        const mannschaft = mannschaftCols.map(m => ({
            name: m.name,
            punkte: parseFloat(grid[r][m.col]) || 0
        }));

        const auswaerts = auswaertsCols.map(a => ({
            name: a.name,
            punkte: parseFloat(grid[r][a.col]) || 0
        })).filter(a => a.punkte > 0);

        shooters.push({
            id: `${jahr}_L1_${r}_${lizenz || fullName.replace(/\s+/g, '_')}`,
            jahr,
            person_number: lizenz,
            name: fullName,
            jahrgang: jg,
            liga: 1,
            rang: rangVal,
            total,
            streichresultat_prz: streich,
            status: (rangVal >= 7) ? 'abstieg' : 'neutral',
            is_junior: isJunior,
            details: { schiessen, mannschaft, auswaerts, max_total_prz: maxPercent },
            updated_at: new Date().toISOString()
        });
    }

    // Liga 2: 15 bis Ende
    for (let r = 15; r < grid.length; r++) {
        if (!grid[r]) continue;
        const nachname = String(grid[r][colNachname] || '').trim();
        const vorname = String(grid[r][colVorname] || '').trim();
        if (!nachname) continue;

        const fullName = `${nachname} ${vorname}`.trim();
        const lizenz = String(grid[r][colLizenz] || '').trim();
        const rangVal = parseInt(grid[r][colRang]) || (r - 14);
        const total = colTotal !== -1 ? (parseFloat(grid[r][colTotal]) || 0) : 0;
        const streich = colStreich !== -1 ? (parseFloat(grid[r][colStreich]) || 0) : 0;
        const jg = parseInt(grid[r][colJahrgang]) || null;
        const isJunior = jg ? (new Date().getFullYear() - jg <= 20) : false;

        const schiessen = competitions.map(comp => ({
            name: comp.name,
            punkte: parseFloat(grid[r][comp.col]) || 0,
            prozent: comp.pctCol !== -1 ? (parseFloat(grid[r][comp.pctCol]) || 0) : 0
        }));

        const mannschaft = mannschaftCols.map(m => ({
            name: m.name,
            punkte: parseFloat(grid[r][m.col]) || 0
        }));

        const auswaerts = auswaertsCols.map(a => ({
            name: a.name,
            punkte: parseFloat(grid[r][a.col]) || 0
        })).filter(a => a.punkte > 0);

        shooters.push({
            id: `${jahr}_L2_${r}_${lizenz || fullName.replace(/\s+/g, '_')}`,
            jahr,
            person_number: lizenz,
            name: fullName,
            jahrgang: jg,
            liga: 2,
            rang: rangVal,
            total,
            streichresultat_prz: streich,
            status: (rangVal <= 2) ? 'aufstieg' : 'neutral',
            is_junior: isJunior,
            details: { schiessen, mannschaft, auswaerts, max_total_prz: maxPercent },
            updated_at: new Date().toISOString()
        });
    }

    const l1 = shooters.filter(s => s.liga === 1).sort((a, b) => b.total - a.total);
    l1.forEach((s, idx) => {
        s.rang = idx + 1;
        s.status = (s.rang >= 7) ? 'abstieg' : 'neutral';
    });
    const l2 = shooters.filter(s => s.liga === 2).sort((a, b) => b.total - a.total);
    l2.forEach((s, idx) => {
        s.rang = idx + 1;
        s.status = (s.rang <= 2) ? 'aufstieg' : 'neutral';
    });

    return [...l1, ...l2];
}

async function processSeason(jahr) {
    console.log(`\n=== Verarbeite Saison: ${jahr} ===`);
    
    // 1. Grid abrufen
    const res = await fetch(`${SUPABASE_URL}/jm_seasons?jahr=eq.${jahr}&select=raw_grid,title,junior_exclusions`, { headers: HEADERS });
    const data = await res.json();
    if (!data || data.length === 0) {
        console.log(`⚠️ Keine Daten für Saison ${jahr} gefunden.`);
        return;
    }

    const season = data[0];
    const grid = season.raw_grid;

    console.log(`Aktuelle Zeile 11: ${grid[11][1]} ${grid[11][2]} (Lizenz: ${grid[11][4]})`);
    console.log(`Aktuelle Zeile 15: ${grid[15][1]} ${grid[15][2]} (Lizenz: ${grid[15][4]})`);

    if (String(grid[11][1]).includes('Hunziker') && String(grid[15][1]).includes('Luginbühl')) {
        console.log("➡️ Tausche Zeile 11 (Erich Hunziker) mit Zeile 15 (Jürg Luginbühl)...");
        const temp = grid[11];
        grid[11] = grid[15];
        grid[15] = temp;
    } else if (String(grid[11][1]).includes('Luginbühl') && String(grid[15][1]).includes('Hunziker')) {
        console.log("ℹ️ Zeile 11 ist bereits Jürg Luginbühl und Zeile 15 Erich Hunziker.");
    } else {
        console.warn("⚠️ Unerwartete Schützen in Zeilen 11 und 15. Bitte manuell prüfen!");
        return;
    }

    // 2. Grid neu berechnen
    const maxPercent = recalculateJMRawGrid(grid);
    updateRanksInGrid(grid);

    console.log(`Neuberechnung abgeschlossen. Max-Prozent: ${maxPercent}%`);
    console.log(`Neue Zeile 11 (Liga 1): Rang ${grid[11][0]}, ${grid[11][1]} ${grid[11][2]}, Total: ${grid[11][18]}%`);
    console.log(`Neue Zeile 15 (Liga 2): Rang ${grid[15][0]}, ${grid[15][1]} ${grid[15][2]}, Total: ${grid[15][18]}%`);

    // 3. jm_seasons aktualisieren
    const patchRes = await fetch(`${SUPABASE_URL}/jm_seasons?jahr=eq.${jahr}`, {
        method: 'PATCH',
        headers: HEADERS,
        body: JSON.stringify({
            raw_grid: grid,
            updated_at: new Date().toISOString()
        })
    });
    if (!patchRes.ok) {
        throw new Error(`Fehler beim Speichern von jm_seasons (${jahr}): ${await patchRes.text()}`);
    }
    console.log(`✅ jm_seasons für ${jahr} erfolgreich aktualisiert.`);

    // 4. jm_shooters synchronisieren
    const shooters = buildShootersList(jahr, grid, maxPercent);
    console.log(`Synchronisiere ${shooters.length} Schützen in jm_shooters...`);

    const delRes = await fetch(`${SUPABASE_URL}/jm_shooters?jahr=eq.${jahr}`, {
        method: 'DELETE',
        headers: HEADERS
    });
    if (!delRes.ok) {
        console.warn(`Warnung beim Löschen alter jm_shooters: ${await delRes.text()}`);
    }

    const insRes = await fetch(`${SUPABASE_URL}/jm_shooters`, {
        method: 'POST',
        headers: HEADERS,
        body: JSON.stringify(shooters)
    });
    if (!insRes.ok) {
        throw new Error(`Fehler beim Einfügen in jm_shooters: ${await insRes.text()}`);
    }
    console.log(`✅ jm_shooters für ${jahr} erfolgreich synchronisiert.`);
}

async function main() {
    try {
        await processSeason('current');
        await processSeason('2026');
        console.log("\n🎉 Erfolgreich abgeschlossen!");
    } catch (err) {
        console.error("❌ Fehler:", err);
        process.exit(1);
    }
}

main();
