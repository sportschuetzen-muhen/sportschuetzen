// =========================================================
//  MODULE: MANAGER - PDF
//  - jsPDF Dokumentgenerierung, Spaltenlayout & Massenexport
// =========================================================

function toSafeFilename(str) {
    return String(str || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/gi, "_")
        .replace(/^_+|_+$/g, "");
}

function getDateStr() {
    return new Date().toLocaleDateString('de-CH', {
        day: '2-digit', month: '2-digit', year: 'numeric'
    });
}

function truncateToWidth(doc, text, maxWidth) {
    const s = String(text || "");
    if (doc.getTextWidth(s) <= maxWidth) return s;
    let out = s;
    while (out.length > 0 && doc.getTextWidth(out + "...") > maxWidth) {
        out = out.slice(0, -1);
    }
    return out.length ? (out + "...") : "";
}

function showToast(message, type = 'success') {
    const existing = document.getElementById('manager-toast');
    if (existing) existing.remove();
    const bg = type === 'success' ? '#198754' : '#dc3545';
    const toast = document.createElement('div');
    toast.id = 'manager-toast';
    toast.style.cssText = `
        position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
        background: ${bg}; color: white; padding: 10px 20px; border-radius: 8px;
        font-weight: bold; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        font-size: 15px; pointer-events: none;
        animation: fadeInUp 0.2s ease;
    `;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2500);
}

function estimateTeamHeight(team, config) {
    const headerH = 14;
    const lineH = 7;
    let lines = 0;
    config.zones.forEach(z => {
        const shooters = team.shooters.filter(s =>
            config.zones.length === 1 ? true : s.zone === z.key
        );
        lines += shooters.length;
        if (config.zones.length > 1) lines += 1;
    });
    return headerH + (Math.max(lines, 1) * lineH) + 6;
}

function renderContestToPdf(doc, config, opts = {}) {
    const pdfTitle  = config.pdfTitle || config.title;
    const dateStr   = opts.dateStr || getDateStr();
    const twoCol    = opts.twoCol !== false;
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin    = 15;

    const currentYear = new Date().getFullYear();

    const drawFooter = () => {
        const y = pageHeight - 8;
        doc.setDrawColor(210, 210, 210);
        doc.line(margin, y - 4, pageWidth - margin, y - 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(160, 160, 160);
        doc.text(`Generiert am ${dateStr}`, margin, y);
        doc.text(
            `Seite ${doc.internal.getCurrentPageInfo().pageNumber}`,
            pageWidth - margin, y, { align: 'right' }
        );
    };

    // HEADER: Logo links oben
    doc.addImage(LOGO_BASE64, 'PNG', margin, 6, 22, 22);

    // "Saison YYYY" zentriert
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(13, 110, 253);
    doc.text(`Saison ${currentYear}`, pageWidth / 2, 20, { align: 'center' });

    // Trennlinie
    doc.setDrawColor(210, 210, 210);
    doc.line(margin, 31, pageWidth - margin, 31);

    // Titel unter Linie
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(13, 110, 253);
    const titleLines = doc.splitTextToSize(String(pdfTitle), pageWidth - margin * 2);
    doc.text(titleLines, margin, 40);

    let yPos = titleLines.length * 7 + 44;

    drawFooter();

    // TEAMS
    const gap  = 10;
    const colW = twoCol ? (pageWidth - margin * 2 - gap) / 2 : (pageWidth - margin * 2);
    let col    = 0;
    let rowMaxH = 0;

    const drawTeam = (team, x, y, w) => {
        doc.setFillColor(240, 242, 245);
        doc.rect(x, y, w, 8, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(0);
        doc.text(truncateToWidth(doc, team.name, w - 6), x + 2, y + 6);

        let yy = y + 14;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        let any = false;

        if (!team.shooters || team.shooters.length === 0) {
            doc.setTextColor(150);
            doc.text('- Keine Schützen -', x + 2, yy);
            yy += 7;
            any = true;
        } else {
            config.zones.forEach(zone => {
                const shooters = team.shooters.filter(s =>
                    config.zones.length === 1 ? true : s.zone === zone.key
                );
                if (config.zones.length > 1) {
                    doc.setTextColor(80);
                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(9);
                    doc.text(zone.label, x + 2, yy);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(10);
                    yy += 6;
                }
                shooters.forEach(s => {
                    doc.setTextColor(0);
                    doc.text(truncateToWidth(doc, `- ${String(s.name)}`, w - 6), x + 2, yy);
                    yy += 7;
                    any = true;
                });
            });
        }

        if (!any) {
            doc.setTextColor(150);
            doc.text('- Keine Daten -', x + 2, yy);
            yy += 7;
        }

        return yy - y;
    };

    const teams = appState.teams;
    for (let i = 0; i < teams.length; i++) {
        const team   = teams[i];
        const needed = estimateTeamHeight(team, config);
        const x      = twoCol
            ? (col === 1 ? margin + colW + gap : margin)
            : margin;

        if (yPos + needed > pageHeight - margin - 12) {
            drawFooter();
            doc.addPage();
            yPos = 20;
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(11);
            doc.setTextColor(13, 110, 253);
            doc.text(String(pdfTitle), margin, yPos);
            yPos += 8;
            col = 0;
            rowMaxH = 0;
            drawFooter();
        }

        const usedH = drawTeam(team, x, yPos, colW);
        rowMaxH = Math.max(rowMaxH, usedH);

        if (twoCol) {
            if (col === 0) {
                col = 1;
            } else {
                col = 0;
                yPos += rowMaxH + 6;
                rowMaxH = 0;
            }
        } else {
            yPos += usedH + 6;
        }
    }

    if (twoCol && col === 1) {
        yPos += rowMaxH + 6;
    }

    return { doc, dateStr, title: pdfTitle };
}

function buildPdfDoc(moduleKey) {
    if (!window.jspdf?.jsPDF) throw new Error("jsPDF nicht geladen.");
    const { jsPDF } = window.jspdf;

    const key = moduleKey || appState.activeModule;
    const config = CONTEST_CONFIG[key];
    const doc = new jsPDF();

    // Temporär Teams aus Cache laden falls anderes Modul
    const originalTeams = appState.teams;
    const originalModule = appState.activeModule;
    if (moduleKey && mailWizard.cachedModules[moduleKey]) {
        appState.teams = mailWizard.cachedModules[moduleKey].teams;
        appState.activeModule = moduleKey;
    }

    const result = renderContestToPdf(doc, config, { twoCol: true });

    // Wiederherstellen
    appState.teams = originalTeams;
    appState.activeModule = originalModule;

    return result;
}

async function exportPDF() {
    try {
        const config = CONTEST_CONFIG[appState.activeModule];
        const { doc, dateStr } = buildPdfDoc();
        const base = config.fileBase || toSafeFilename(config.pdfTitle || config.title);
        doc.save(`${base}_${dateStr}.pdf`);
    } catch (error) {
        alert(error.message);
        console.error(error);
    }
}

async function exportAllPDF() {
    try {
        const { doc, dateStr } = await buildAllPdfDoc();
        doc.save(`Alle_Module_${dateStr}.pdf`);
    } catch (error) {
        alert(error.message);
        console.error(error);
    }
}

async function fetchContestDataForPdf(moduleKey) {
    const config = CONTEST_CONFIG[moduleKey];
    const params = `action=getManagerData&sheetName=${encodeURIComponent(config.sheetName)}`;
    const res = await apiFetch('manager', params);

    if (!res.ok) {
        const errTxt = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status} (${moduleKey}): ${errTxt.slice(0, 200)}`);
    }

    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); }
    catch { throw new Error(`Kein JSON (${moduleKey}): ${txt.slice(0, 200)}`); }

    if (data.error) throw new Error(`${moduleKey}: ${data.error}`);

    appState.activeModule = moduleKey;
    processContestData(data, config);
    return config;
}

async function buildAllPdfDoc() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error("jsPDF nicht geladen.");
    }

    const prevState = (typeof structuredClone === "function")
        ? structuredClone(appState)
        : JSON.parse(JSON.stringify(appState));

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    const dateStr = getDateStr();
    const modules = ["grenzland", "mannschaft", "gruppe"];

    for (let i = 0; i < modules.length; i++) {
        if (i > 0) doc.addPage();
        const config = await fetchContestDataForPdf(modules[i]);
        renderContestToPdf(doc, config, { twoCol: true, dateStr });
    }

    appState = prevState;

    const managerView = document.getElementById('view-manager');
    if (managerView && managerView.classList.contains('active')) {
        ensureManagerShell();
        renderContestUI();
    }

    return { doc, dateStr };
}
