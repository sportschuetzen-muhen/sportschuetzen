// === SUB-MODUL: JAHRESMEISTERSCHAFT - EXPORT AUSWÄRTSSCHIESSEN (PDF & EXCEL) ===
// Liest ausschliesslich aus dem geladenen jmRawGrid (Supabase jm_seasons.raw_grid).
// Rangierung: Summe der prozentual besten Auswärtsresultate (Slots «Auswärtiges 1/2», max. 200 %),
// analog zu updateTopAuswaertige() in jahresmeisterschaft-import.js.

const JM_EXPORT_TRUE_VALUES = ['ja', 'j', 'x', '1', 'true', 'yes', '✓', '✔', '☑'];

function jmExportIsChecked(val) {
    if (val === true) return true;
    return JM_EXPORT_TRUE_VALUES.includes(String(val === undefined || val === null ? '' : val).trim().toLowerCase());
}

function jmExportParseNum(val) {
    const n = parseFloat(String(val === undefined || val === null ? '' : val).replace(',', '.'));
    return isNaN(n) ? null : n;
}

function jmExportRound2(n) {
    return Math.round(n * 100) / 100;
}

function jmExportFmtPct(n) {
    return n === null || n === undefined ? '' : jmExportRound2(n).toFixed(2) + ' %';
}

function jmExportLocalIso() {
    const d = new Date();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${mm}-${dd}`;
}

/**
 * Baut die Auswertung der Auswärtsschiessen aus dem aktuell geladenen Grid.
 * @returns {{seasonLabel:string, maxSum:number, slots:number, cols:Array, rows:Array}|null}
 */
function jmBuildAuswaertigData() {
    const grid = (typeof jmRawGrid !== 'undefined') ? jmRawGrid : null;
    if (!grid || grid.length < 6 || !grid[2]) return null;

    const hasStatusCol = Boolean(grid[4] && grid[4].some(v => String(v || '').trim().toLowerCase() === 'status'));
    const limitIndex = hasStatusCol ? 42 : 41;
    const colAusw1 = hasStatusCol ? 15 : 14;
    const colAusw2 = hasStatusCol ? 16 : 15;

    // Anzahl zählender Auswärtsresultate gemäss Checkboxen «Auswärtiges 1/2» (Zeile 0)
    const slots = [colAusw1, colAusw2].filter(c => jmExportIsChecked(grid[0] && grid[0][c])).length;

    // Auswärtsschiessen-Spalten (nur mit Titel, ohne %-Hilfsspalten)
    const candidateCols = [];
    for (let c = limitIndex; c < grid[2].length; c++) {
        const title = String(grid[2][c] || '').trim();
        if (!title || title.toLowerCase().includes('%') || title.toLowerCase() === 'leer' || title.toLowerCase().startsWith('spalte')) continue;
        const max = jmExportParseNum(grid[3] && grid[3][c]);
        candidateCols.push({ col: c, title, max: (max && max > 0) ? max : 100 });
    }

    const rows = [];
    for (let r = 5; r < grid.length; r++) {
        if (!grid[r] || r === 13 || r === 14) continue;
        const nachname = String(grid[r][1] || '').trim();
        const vorname = String(grid[r][2] || '').trim();
        if (!nachname && !vorname) continue;

        const results = [];
        candidateCols.forEach(cc => {
            const pts = jmExportParseNum(grid[r][cc.col]);
            if (pts !== null && pts > 0) {
                results.push({ col: cc.col, title: cc.title, pts, max: cc.max, pct: (pts / cc.max) * 100 });
            }
        });
        if (results.length === 0) continue;

        const sorted = [...results].sort((a, b) => b.pct - a.pct);
        const counted = sorted.slice(0, slots);
        const sum = counted.reduce((acc, x) => acc + x.pct, 0);

        const byCol = {};
        results.forEach(x => { byCol[x.col] = x; });

        rows.push({
            name: `${vorname} ${nachname}`.trim(),
            nachname,
            liga: (r <= 12) ? 1 : 2,
            byCol,
            countedCols: new Set(counted.map(x => x.col)),
            counted,
            sum
        });
    }

    // Nur Anlässe mit mindestens einem Resultat ausgeben
    const cols = candidateCols.filter(cc => rows.some(row => row.byCol[cc.col]));

    // Sortierung: Summe absteigend, danach bestes Einzelresultat, danach Name
    rows.sort((a, b) => {
        if (b.sum !== a.sum) return b.sum - a.sum;
        const ba = a.counted[0] ? a.counted[0].pct : 0;
        const bb = b.counted[0] ? b.counted[0].pct : 0;
        if (bb !== ba) return bb - ba;
        return a.nachname.localeCompare(b.nachname, 'de');
    });

    // Rang (gleiche Summe = gleicher Rang)
    rows.forEach((row, idx) => {
        row.rang = (idx > 0 && Math.abs(rows[idx - 1].sum - row.sum) < 0.005) ? rows[idx - 1].rang : idx + 1;
    });

    const seasonLabel = (typeof jmCurrentJahr !== 'undefined' && jmCurrentJahr && jmCurrentJahr !== 'current')
        ? String(jmCurrentJahr)
        : `${new Date().getFullYear()} (aktuell)`;

    return { seasonLabel, maxSum: slots * 100, slots, cols, rows };
}

function jmExportShowNoData(message) {
    if (window.UIConfirmKit) {
        window.UIConfirmKit.alert({ title: 'Kein Export möglich', message, type: 'warning' });
    } else if (typeof showError === 'function') {
        showError(message);
    }
}

function jmExportFileBase(data) {
    const yearPart = data.seasonLabel.replace(/\s*\(aktuell\)/, '').trim();
    return `Sportschuetzen_Muhen_Auswaertsschiessen_${yearPart}`;
}

// === EXCEL ===
async function jmExportAuswaertigExcel() {
    await UIButtonKit.withLoading('#btn-jm-export-auswaertig', async () => {
        const data = jmBuildAuswaertigData();
        if (!data) {
            jmExportShowNoData('Die Jahresmeisterschaft ist noch nicht geladen. Bitte warte kurz und versuche es nochmals.');
            return;
        }
        if (data.rows.length === 0) {
            jmExportShowNoData('Es sind noch keine Auswärtsresultate erfasst. Trage zuerst Resultate ein oder importiere sie.');
            return;
        }

        const headers = { rang: 'Rang', name: 'Schütze', liga: 'Liga' };
        data.cols.forEach(cc => { headers['c' + cc.col] = `${cc.title} (max. ${cc.max})`; });
        headers.z1 = 'Zählt 1: Anlass';
        headers.z1p = 'Zählt 1: %';
        headers.z2 = 'Zählt 2: Anlass';
        headers.z2p = 'Zählt 2: %';
        headers.sum = `Wertung % (max. ${data.maxSum})`;

        const excelRows = data.rows.map(row => {
            const o = { rang: row.rang, name: row.name, liga: row.liga };
            data.cols.forEach(cc => {
                o['c' + cc.col] = row.byCol[cc.col] ? row.byCol[cc.col].pts : '';
            });
            const [c1, c2] = row.counted;
            o.z1 = c1 ? c1.title : '';
            o.z1p = c1 ? jmExportRound2(c1.pct) : '';
            o.z2 = c2 ? c2.title : '';
            o.z2p = c2 ? jmExportRound2(c2.pct) : '';
            o.sum = jmExportRound2(row.sum);
            return o;
        });

        const widths = [7, 26, 7, ...data.cols.map(cc => Math.max(14, Math.min(28, cc.title.length + 10))), 22, 11, 22, 11, 20];

        UIExportKit.dataToExcel(excelRows, {
            headers,
            columnWidths: widths,
            sheetName: 'Auswärtsschiessen',
            filename: jmExportFileBase(data)
        });
    });
}
window.jmExportAuswaertigExcel = jmExportAuswaertigExcel;

// === PDF ===
async function jmExportAuswaertigPdf() {
    await UIButtonKit.withLoading('#btn-jm-export-auswaertig', async () => {
        const data = jmBuildAuswaertigData();
        if (!data) {
            jmExportShowNoData('Die Jahresmeisterschaft ist noch nicht geladen. Bitte warte kurz und versuche es nochmals.');
            return;
        }
        if (data.rows.length === 0) {
            jmExportShowNoData('Es sind noch keine Auswärtsresultate erfasst. Trage zuerst Resultate ein oder importiere sie.');
            return;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            window.UIConfirmKit.alert({ title: 'Export-Fehler', message: 'Die PDF-Bibliothek (jsPDF) ist nicht geladen. Lade die Seite neu und versuche es nochmals.', type: 'danger' });
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        if (typeof doc.autoTable !== 'function') {
            window.UIConfirmKit.alert({ title: 'Export-Fehler', message: 'Die PDF-Tabellen-Erweiterung (jspdf-autotable) ist nicht geladen. Lade die Seite neu und versuche es nochmals.', type: 'danger' });
            return;
        }

        const pageW = doc.internal.pageSize.getWidth();
        const todayIso = jmExportLocalIso();
        const todayStr = (window.UIFormatKit && UIFormatKit.formatDate) ? UIFormatKit.formatDate(todayIso) : todayIso;

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(15);
        doc.text('Sportschützen Muhen – Jahresmeisterschaft KK', 14, 14);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        doc.text(`Auswärtsschiessen · Saison ${data.seasonLabel} · Stand: ${todayStr}`, 14, 20);

        const head = [[
            'Rang', 'Schütze', 'Liga',
            ...data.cols.map(cc => `${cc.title}\n(max. ${cc.max})`),
            'Zählt 1\n(%)', 'Zählt 2\n(%)', `Wertung\n(max. ${data.maxSum} %)`
        ]];

        const body = data.rows.map(row => {
            const [c1, c2] = row.counted;
            return [
                String(row.rang),
                row.name,
                String(row.liga),
                ...data.cols.map(cc => row.byCol[cc.col] ? String(row.byCol[cc.col].pts) : ''),
                c1 ? jmExportFmtPct(c1.pct) : '',
                c2 ? jmExportFmtPct(c2.pct) : '',
                jmExportFmtPct(row.sum)
            ];
        });

        const firstAuswCol = 3;
        const lastAuswCol = 3 + data.cols.length - 1;

        doc.autoTable({
            head,
            body,
            startY: 25,
            margin: { left: 14, right: 14, bottom: 16 },
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 1.6, halign: 'center', valign: 'middle', lineColor: [200, 205, 212], lineWidth: 0.1 },
            headStyles: { fillColor: [30, 64, 120], textColor: 255, fontStyle: 'bold', fontSize: 8 },
            columnStyles: { 1: { halign: 'left', cellWidth: 42 } },
            didParseCell: (hook) => {
                if (hook.section === 'body') {
                    const colIdx = hook.column.index;
                    const row = data.rows[hook.row.index];
                    if (colIdx >= firstAuswCol && colIdx <= lastAuswCol) {
                        const cc = data.cols[colIdx - firstAuswCol];
                        if (row && row.countedCols.has(cc.col)) {
                            hook.cell.styles.fillColor = [255, 243, 205];
                            hook.cell.styles.fontStyle = 'bold';
                        }
                    }
                    if (colIdx === 1) hook.cell.styles.fontStyle = 'bold';
                    if (colIdx === head[0].length - 1) {
                        hook.cell.styles.fontStyle = 'bold';
                        hook.cell.styles.fillColor = [226, 240, 233];
                    }
                }
            },
            didDrawPage: () => {
                const pageH = doc.internal.pageSize.getHeight();
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(8);
                doc.setTextColor(110);
                doc.text('Gelb hinterlegt = zählendes Resultat (die prozentual besten Auswärtsschiessen). Wertung = Summe der zählenden Prozentwerte.', 14, pageH - 8);
                doc.text(`Seite ${doc.internal.getNumberOfPages()}`, pageW - 14, pageH - 8, { align: 'right' });
                doc.setTextColor(0);
            }
        });

        doc.save(`${jmExportFileBase(data)}_${todayIso}.pdf`);
    });
}
window.jmExportAuswaertigPdf = jmExportAuswaertigPdf;
