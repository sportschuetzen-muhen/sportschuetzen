// supabase/functions/export-results-excel/index.ts
// ==============================================================================
// Konsolidierter Excel-Export für Resultate & Wettkämpfe (6-Reiter-Architektur)
// Projekt: Vereinsportal Sportschützen Muhen
//
// 1. Auswertung_Mannschaft (SMM Runden 1-7, sortiert nach Schnitt absteigend)
// 2. Auswertung_Gruppe     (SGM Runden 1-3, sortiert nach Schnitt absteigend)
// 3. Auswertung_Grenzland  (Grenzland Runden 1-3, sortiert nach Schnitt absteigend)
// 4. Rohdaten_Mannschaft  (Flache Normalform SMM)
// 5. Rohdaten_Gruppe      (Flache Normalform SGM)
// 6. Rohdaten_Grenzland   (Flache Normalform Grenzland)
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import ExcelJS from "https://esm.sh/exceljs@4.4.0";

interface ExportExcelPayload {
  year?: number | string;
}

interface ContestConfig {
  key: "mannschaft" | "gruppe" | "grenzland";
  title: string;
  auswertungSheet: string;
  rohdatenSheet: string;
  roundCount: number;
  hasPassen: boolean; // true bei Gruppe (P1 + P2)
}

const CONTESTS: ContestConfig[] = [
  {
    key: "mannschaft",
    title: "SMM Mannschaftsmeisterschaft – Auswertung & Matrix",
    auswertungSheet: "Auswertung_Mannschaft",
    rohdatenSheet: "Rohdaten_Mannschaft",
    roundCount: 7,
    hasPassen: false,
  },
  {
    key: "gruppe",
    title: "SGM Gruppenmeisterschaft – Auswertung & Matrix",
    auswertungSheet: "Auswertung_Gruppe",
    rohdatenSheet: "Rohdaten_Gruppe",
    roundCount: 3,
    hasPassen: true,
  },
  {
    key: "grenzland",
    title: "Grenzland-Cup – Auswertung & Matrix",
    auswertungSheet: "Auswertung_Grenzland",
    rohdatenSheet: "Rohdaten_Grenzland",
    roundCount: 3,
    hasPassen: false,
  },
];

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let yearParam: string | number | undefined;

    if (req.method === "GET") {
      const url = new URL(req.url);
      yearParam = url.searchParams.get("year") || undefined;
    } else {
      try {
        const body: ExportExcelPayload = await req.json();
        yearParam = body.year;
      } catch (_) {
        const url = new URL(req.url);
        yearParam = url.searchParams.get("year") || undefined;
      }
    }

    const currentYear = new Date().getFullYear();
    const targetYear = yearParam ? parseInt(String(yearParam), 10) : currentYear;

    // 1. Supabase Client initialisieren
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://supabase-muhen.danfamily.uk";
    const supabaseKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
      Deno.env.get("SUPABASE_ANON_KEY") ||
      "";

    const authHeader = req.headers.get("Authorization");
    const supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { headers: authHeader ? { Authorization: authHeader } : {} },
    });

    // 2. Daten parallel aus Supabase laden
    const [resMannschaft, resGruppe, resGrenzland, resMembers] = await Promise.all([
      supabase
        .from("contest_results")
        .select("*")
        .eq("contest_type", "mannschaft")
        .eq("year", targetYear)
        .order("name", { ascending: true }),
      supabase
        .from("contest_results")
        .select("*")
        .eq("contest_type", "gruppe")
        .eq("year", targetYear)
        .order("name", { ascending: true }),
      supabase
        .from("contest_results")
        .select("*")
        .eq("contest_type", "grenzland")
        .eq("year", targetYear)
        .order("name", { ascending: true }),
      supabase
        .from("members")
        .select("person_number, address_number, first_name, last_name"),
    ]);

    if (resMannschaft.error) throw resMannschaft.error;
    if (resGruppe.error) throw resGruppe.error;
    if (resGrenzland.error) throw resGrenzland.error;

    // Lizenz-Map (person_number -> address_number)
    const memberLicMap = new Map<string, string>();
    if (resMembers.data && Array.isArray(resMembers.data)) {
      for (const m of resMembers.data) {
        if (m.person_number != null) {
          memberLicMap.set(
            String(m.person_number),
            m.address_number ? String(m.address_number) : ""
          );
        }
      }
    }

    const contestDataMap: Record<string, any[]> = {
      mannschaft: resMannschaft.data || [],
      gruppe: resGruppe.data || [],
      grenzland: resGrenzland.data || [],
    };

    // 3. ExcelJS Arbeitsmappe initialisieren
    const WorkbookClass =
      (ExcelJS as any).Workbook ||
      (ExcelJS as any).default?.Workbook ||
      (ExcelJS as any);
    const workbook = new WorkbookClass();
    workbook.creator = "Sportschützen Muhen";
    workbook.lastModifiedBy = "Sportschützen Muhen Portal";
    workbook.created = new Date();
    workbook.modified = new Date();

    // =========================================================================
    // ERSTELLUNG DER 6 REITER:
    // Reihenfolge:
    // 1. Auswertung_Mannschaft
    // 2. Auswertung_Gruppe
    // 3. Auswertung_Grenzland
    // 4. Rohdaten_Mannschaft
    // 5. Rohdaten_Gruppe
    // 6. Rohdaten_Grenzland
    // =========================================================================

    // A. 3 Auswertungs-Sheets anlegen (damit sie als Reiter 1, 2, 3 erscheinen)
    const auswertungSheets: Record<string, any> = {};
    for (const conf of CONTESTS) {
      const ws = workbook.addWorksheet(conf.auswertungSheet, {
        views: [{ showGridLines: true }],
      });
      auswertungSheets[conf.key] = ws;
    }

    // B. 3 Rohdaten-Sheets anlegen (Reiter 4, 5, 6) und befüllen
    const rohdatenSheets: Record<string, any> = {};
    for (const conf of CONTESTS) {
      const ws = workbook.addWorksheet(conf.rohdatenSheet, {
        views: [{ showGridLines: true }],
      });
      rohdatenSheets[conf.key] = ws;

      // Spalten definieren
      if (conf.hasPassen) {
        // Gruppe: mit Passe 1 und Passe 2
        ws.columns = [
          { header: "Schütze", key: "schuetze", width: 25 },
          { header: "Lizenz", key: "lizenz", width: 15 },
          { header: "Stellung", key: "stellung", width: 15 },
          { header: "Runde", key: "runde", width: 10 },
          { header: "Mannschaft", key: "mannschaft", width: 15 },
          { header: "Punkte", key: "punkte", width: 12 }, // Total P1+P2
          { header: "Passe 1", key: "passe1", width: 10 },
          { header: "Passe 2", key: "passe2", width: 10 },
        ];
      } else {
        // Mannschaft & Grenzland
        ws.columns = [
          { header: "Schütze", key: "schuetze", width: 25 },
          { header: "Lizenz", key: "lizenz", width: 15 },
          { header: "Stellung", key: "stellung", width: 15 },
          { header: "Runde", key: "runde", width: 10 },
          { header: "Mannschaft", key: "mannschaft", width: 15 },
          { header: "Punkte", key: "punkte", width: 12 },
        ];
      }

      // Header-Zeile formatieren (Dunkelblau #1F4E79, weiß, fett, zentriert, 24pt)
      const hRow = ws.getRow(1);
      hRow.height = 24;
      hRow.eachCell((cell: any) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FF1F4E79" },
        };
        cell.font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: "FFFFFFFF" },
        };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1F4E79" } },
          bottom: { style: "thin", color: { argb: "FF1F4E79" } },
        };
      });

      // Rohdaten befüllen
      const rows = contestDataMap[conf.key] || [];
      let rowCount = 0;

      for (const s of rows) {
        const pn = String(s.person_number || "");
        const lizenz = memberLicMap.get(pn) || "";
        const stellungRaw = String(s.stellung || "liegend").toLowerCase();
        const stellung =
          stellungRaw === "kniend"
            ? "Kniend"
            : stellungRaw === "stehend"
            ? "Stehend"
            : "Liegend";

        for (let r = 1; r <= conf.roundCount; r++) {
          const team = String(s[`r${r}_team`] || "").trim();
          const p1Raw = s[`r${r}_p1`];
          const p2Raw = conf.hasPassen ? s[`r${r}_p2`] : null;

          const p1Has = p1Raw !== null && p1Raw !== undefined && p1Raw !== "";
          const p2Has = p2Raw !== null && p2Raw !== undefined && p2Raw !== "";

          if (team || p1Has || p2Has) {
            rowCount++;
            const p1 = p1Has ? Number(p1Raw) : null;
            const p2 = p2Has ? Number(p2Raw) : null;
            let totalPoints = 0;

            if (conf.hasPassen) {
              totalPoints = (p1 || 0) + (p2 || 0);
            } else {
              totalPoints = p1 !== null ? p1 : 0;
            }

            const rowData: any = {
              schuetze: s.name || "Unbekannt",
              lizenz: lizenz,
              stellung: stellung,
              runde: r,
              mannschaft: team || "Pool",
              punkte: totalPoints,
            };

            if (conf.hasPassen) {
              rowData.passe1 = p1 !== null ? p1 : "";
              rowData.passe2 = p2 !== null ? p2 : "";
            }

            const dataRow = ws.addRow(rowData);
            dataRow.height = 18;
            dataRow.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
            dataRow.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
            dataRow.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
            dataRow.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
            dataRow.getCell(5).alignment = { vertical: "middle", horizontal: "center" };

            const cellP = dataRow.getCell(6);
            cellP.alignment = { vertical: "middle", horizontal: "right" };
            cellP.numFmt = "#,##0";

            if (conf.hasPassen) {
              const cP1 = dataRow.getCell(7);
              cP1.alignment = { vertical: "middle", horizontal: "right" };
              cP1.numFmt = "#,##0";
              const cP2 = dataRow.getCell(8);
              cP2.alignment = { vertical: "middle", horizontal: "right" };
              cP2.numFmt = "#,##0";
            }

            dataRow.eachCell((cell: any) => {
              cell.border = {
                top: { style: "thin", color: { argb: "FFE2E8F0" } },
                bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
                left: { style: "thin", color: { argb: "FFE2E8F0" } },
                right: { style: "thin", color: { argb: "FFE2E8F0" } },
              };
            });
          }
        }
      }

      // Autofilter setzen
      const lastR = Math.max(1, ws.rowCount);
      const lastColLetter = conf.hasPassen ? "H" : "F";
      ws.autoFilter = `A1:${lastColLetter}${lastR}`;
    }

    // =========================================================================
    // C. AUSWERTUNGS-BLÄTTER GENERIEREN (MIT ABSTEIGENDER SORTIERUNG NACH SCHNITT)
    // =========================================================================
    for (const conf of CONTESTS) {
      const ws = auswertungSheets[conf.key];
      const rawRows = contestDataMap[conf.key] || [];

      // 1. Berechnung von Total und Schnitt jedes Schützen zur absteigenden Sortierung
      const decoratedShooters = rawRows.map((s) => {
        let shooterTotal = 0;
        let roundsCount = 0;

        for (let r = 1; r <= conf.roundCount; r++) {
          const p1Raw = s[`r${r}_p1`];
          const p2Raw = conf.hasPassen ? s[`r${r}_p2`] : null;
          const hasP1 = p1Raw !== null && p1Raw !== undefined && p1Raw !== "";
          const hasP2 = p2Raw !== null && p2Raw !== undefined && p2Raw !== "";

          if (conf.hasPassen) {
            if (hasP1 || hasP2) {
              const rSum = (hasP1 ? Number(p1Raw) : 0) + (hasP2 ? Number(p2Raw) : 0);
              shooterTotal += rSum;
              roundsCount++;
            }
          } else {
            if (hasP1) {
              shooterTotal += Number(p1Raw);
              roundsCount++;
            }
          }
        }

        const schnitt = roundsCount > 0 ? shooterTotal / roundsCount : 0;
        return {
          raw: s,
          name: s.name || "Unbekannt",
          personNumber: String(s.person_number || ""),
          stellung: s.stellung || "liegend",
          total: shooterTotal,
          roundsCount: roundsCount,
          schnitt: schnitt,
        };
      });

      // 2. Sortierung absteigend nach Schnitt (Spalte L bzw. H)!
      // Bei gleichem Schnitt: Gesamttotal absteigend, danach Name alphabetisch
      decoratedShooters.sort((a, b) => {
        if (b.schnitt !== a.schnitt) {
          return b.schnitt - a.schnitt;
        }
        if (b.total !== a.total) {
          return b.total - a.total;
        }
        return a.name.localeCompare(b.name, "de");
      });

      // 3. Spaltenbreiten einstellen
      ws.getColumn(1).width = 25; // A: Schütze
      ws.getColumn(2).width = 15; // B: Lizenz
      ws.getColumn(3).width = 15; // C: Stellung
      for (let c = 1; c <= conf.roundCount; c++) {
        ws.getColumn(3 + c).width = 10; // R1 bis Rn
      }
      const totalColIdx = 4 + conf.roundCount; // z.B. 11 bei SMM (K), 7 bei 3 Runden (G)
      const schnittColIdx = totalColIdx + 1;  // z.B. 12 bei SMM (L), 8 bei 3 Runden (H)
      ws.getColumn(totalColIdx).width = 14;
      ws.getColumn(schnittColIdx).width = 12;

      // 4. Titelblock (Zeilen 1–3)
      const r1 = ws.getRow(1);
      r1.height = 26;
      const c1 = r1.getCell(1);
      c1.value = `${conf.title} (${targetYear})`;
      c1.font = {
        name: "Calibri",
        size: 14,
        bold: true,
        color: { argb: "FF1F4E79" },
      };

      const r2 = ws.getRow(2);
      r2.height = 16;
      const c2 = r2.getCell(1);
      const now = new Date();
      const formattedDate = `${now.toLocaleDateString("de-CH")} ${now.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`;
      c2.value = `Generiert am: ${formattedDate} | Sortierung: Schnitt (Ø) absteigend | ${decoratedShooters.length} Schützen`;
      c2.font = {
        name: "Calibri",
        size: 9,
        italic: true,
        color: { argb: "FF7F7F7F" },
      };

      // 5. Tabelle 1: Header (Zeile 4)
      const t1HeaderRow = ws.getRow(4);
      t1HeaderRow.height = 22;

      const headers = ["Schütze", "Lizenz", "Stellung"];
      for (let r = 1; r <= conf.roundCount; r++) {
        headers.push(`R${r}`);
      }
      headers.push("Gesamttotal", "Schnitt (Ø)");

      headers.forEach((h, idx) => {
        const cell = t1HeaderRow.getCell(idx + 1);
        cell.value = h;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD9E1F2" },
        };
        cell.font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: "FF1F4E79" },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: idx === 0 ? "left" : "center",
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1F4E79" } },
          bottom: { style: "thin", color: { argb: "FF1F4E79" } },
        };
      });

      // 6. Datenzeilen Tabelle 1 (ab Zeile 5)
      let curRowIdx = 5;
      const shooterStartRow = 5;
      const rohdatenRef = `'${conf.rohdatenSheet}'`;

      for (const ds of decoratedShooters) {
        const lizenz = memberLicMap.get(ds.personNumber) || "";
        const stellungRaw = String(ds.stellung || "liegend").toLowerCase();
        const stellung =
          stellungRaw === "kniend"
            ? "Kniend"
            : stellungRaw === "stehend"
            ? "Stehend"
            : "Liegend";

        const rRow = ws.getRow(curRowIdx);
        rRow.height = 18;

        // A: Schütze
        const cellName = rRow.getCell(1);
        cellName.value = ds.name;
        cellName.alignment = { vertical: "middle", horizontal: "left" };

        // B: Lizenz
        const cellLic = rRow.getCell(2);
        cellLic.value = lizenz;
        cellLic.alignment = { vertical: "middle", horizontal: "center" };

        // C: Stellung
        const cellStell = rRow.getCell(3);
        cellStell.value = stellung;
        cellStell.alignment = { vertical: "middle", horizontal: "center" };

        // Runden-Spalten via native Formel SUMIFS
        for (let r = 1; r <= conf.roundCount; r++) {
          const cellR = rRow.getCell(3 + r);
          cellR.value = {
            formula: `SUMIFS(${rohdatenRef}!$F:$F, ${rohdatenRef}!$A:$A, A${curRowIdx}, ${rohdatenRef}!$D:$D, ${r})`,
          };
          cellR.numFmt = "#,##0";
          cellR.alignment = { vertical: "middle", horizontal: "right" };
        }

        const startRoundLetter = "D";
        const endRoundLetter = String.fromCharCode(67 + conf.roundCount);

        // Gesamttotal
        const cellTot = rRow.getCell(totalColIdx);
        cellTot.value = {
          formula: `SUM(${startRoundLetter}${curRowIdx}:${endRoundLetter}${curRowIdx})`,
        };
        cellTot.numFmt = "#,##0";
        cellTot.font = { bold: true };
        cellTot.alignment = { vertical: "middle", horizontal: "right" };

        // Schnitt (Ø)
        const cellAvg = rRow.getCell(schnittColIdx);
        cellAvg.value = {
          formula: `AVERAGE(${startRoundLetter}${curRowIdx}:${endRoundLetter}${curRowIdx})`,
        };
        cellAvg.numFmt = "0.0";
        cellAvg.font = { bold: true };
        cellAvg.alignment = { vertical: "middle", horizontal: "right" };

        // Rahmen
        rRow.eachCell((cell: any) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        });

        curRowIdx++;
      }

      const shooterEndRow = Math.max(shooterStartRow, curRowIdx - 1);

      // 7. Rundendurchschnitts-Zeile für Tabelle 1
      const t1AvgRow = ws.getRow(curRowIdx);
      t1AvgRow.height = 20;

      const lblAvg = t1AvgRow.getCell(1);
      lblAvg.value = "Rundendurchschnitt";
      lblAvg.font = { bold: true };
      lblAvg.alignment = { vertical: "middle", horizontal: "left" };

      for (let r = 1; r <= conf.roundCount; r++) {
        const colLetter = String.fromCharCode(67 + r);
        const cell = t1AvgRow.getCell(3 + r);
        cell.value = {
          formula: `AVERAGE(${colLetter}${shooterStartRow}:${colLetter}${shooterEndRow})`,
        };
        cell.numFmt = "0.0";
        cell.font = { bold: true };
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }

      const totColLetter = String.fromCharCode(64 + totalColIdx);
      const schnittColLetter = String.fromCharCode(64 + schnittColIdx);

      const cellTotAvg = t1AvgRow.getCell(totalColIdx);
      cellTotAvg.value = {
        formula: `AVERAGE(${totColLetter}${shooterStartRow}:${totColLetter}${shooterEndRow})`,
      };
      cellTotAvg.numFmt = "0.0";
      cellTotAvg.font = { bold: true };
      cellTotAvg.alignment = { vertical: "middle", horizontal: "right" };

      const cellSchnittAvg = t1AvgRow.getCell(schnittColIdx);
      cellSchnittAvg.value = {
        formula: `AVERAGE(${schnittColLetter}${shooterStartRow}:${schnittColLetter}${shooterEndRow})`,
      };
      cellSchnittAvg.numFmt = "0.0";
      cellSchnittAvg.font = { bold: true };
      cellSchnittAvg.alignment = { vertical: "middle", horizontal: "right" };

      // Styling Summenzeile: Oben dünn, unten doppelt
      for (let col = 1; col <= schnittColIdx; col++) {
        const cell = t1AvgRow.getCell(col);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F4F8" },
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1F4E79" } },
          bottom: { style: "double", color: { argb: "FF1F4E79" } },
        };
      }

      // =======================================================================
      // 8. TABELLE 2: Mannschaftsauswertung
      // =======================================================================
      const t2StartTitleRow = curRowIdx + 3;
      const t2HeaderRowIdx = t2StartTitleRow + 1;

      // Titel Tabelle 2
      const t2TitleRow = ws.getRow(t2StartTitleRow);
      t2TitleRow.height = 22;
      const t2TitleCell = t2TitleRow.getCell(1);
      t2TitleCell.value = `Mannschaftsauswertung (${conf.roundCount} Runden)`;
      t2TitleCell.font = {
        name: "Calibri",
        size: 12,
        bold: true,
        color: { argb: "FF1F4E79" },
      };

      // Header Tabelle 2
      const t2HeaderRow = ws.getRow(t2HeaderRowIdx);
      t2HeaderRow.height = 22;
      const t2Headers = ["Mannschaft"];
      for (let r = 1; r <= conf.roundCount; r++) {
        t2Headers.push(`R${r}`);
      }
      t2Headers.push("Gesamt", "Schnitt");

      t2Headers.forEach((h, idx) => {
        const cell = t2HeaderRow.getCell(idx + 1);
        cell.value = h;
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFD9E1F2" },
        };
        cell.font = {
          name: "Calibri",
          size: 11,
          bold: true,
          color: { argb: "FF1F4E79" },
        };
        cell.alignment = {
          vertical: "middle",
          horizontal: idx === 0 ? "left" : "center",
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1F4E79" } },
          bottom: { style: "thin", color: { argb: "FF1F4E79" } },
        };
      });

      // Teams ermitteln
      const teamsSet = new Set<string>();
      rawRows.forEach((r) => {
        for (let i = 1; i <= conf.roundCount; i++) {
          const tm = String(r[`r${i}_team`] || "").trim();
          if (tm && tm.toLowerCase() !== "pool") {
            teamsSet.add(tm);
          }
        }
      });

      if (teamsSet.size === 0) {
        teamsSet.add("Muhen 1");
        teamsSet.add("Muhen 2");
        if (conf.key !== "gruppe") teamsSet.add("Muhen 3");
      }

      const teamList = Array.from(teamsSet).sort((a, b) =>
        a.localeCompare(b, "de")
      );

      let t2CurRow = t2HeaderRowIdx + 1;
      const t2DataStartRow = t2CurRow;
      const t2TotCol = 1 + conf.roundCount + 1; // z.B. 1+7+1 = 9
      const t2AvgCol = t2TotCol + 1;           // 10

      for (const teamName of teamList) {
        const mRow = ws.getRow(t2CurRow);
        mRow.height = 18;

        // A: Mannschaft
        const cellMName = mRow.getCell(1);
        cellMName.value = teamName;
        cellMName.font = { bold: true };
        cellMName.alignment = { vertical: "middle", horizontal: "left" };

        // R1 bis Rn: =SUMIFS(Rohdaten!F:F, Rohdaten!E:E, A{mRow}, Rohdaten!D:D, r)
        for (let r = 1; r <= conf.roundCount; r++) {
          const cellR = mRow.getCell(1 + r);
          cellR.value = {
            formula: `SUMIFS(${rohdatenRef}!$F:$F, ${rohdatenRef}!$E:$E, A${t2CurRow}, ${rohdatenRef}!$D:$D, ${r})`,
          };
          cellR.numFmt = "#,##0";
          cellR.alignment = { vertical: "middle", horizontal: "right" };
        }

        const t2StartL = "B";
        const t2EndL = String.fromCharCode(65 + conf.roundCount);

        // Gesamt
        const cellTot = mRow.getCell(t2TotCol);
        cellTot.value = {
          formula: `SUM(${t2StartL}${t2CurRow}:${t2EndL}${t2CurRow})`,
        };
        cellTot.numFmt = "#,##0";
        cellTot.font = { bold: true };
        cellTot.alignment = { vertical: "middle", horizontal: "right" };

        // Schnitt
        const cellAvg = mRow.getCell(t2AvgCol);
        cellAvg.value = {
          formula: `AVERAGE(${t2StartL}${t2CurRow}:${t2EndL}${t2CurRow})`,
        };
        cellAvg.numFmt = "0.0";
        cellAvg.font = { bold: true };
        cellAvg.alignment = { vertical: "middle", horizontal: "right" };

        mRow.eachCell((cell: any) => {
          cell.border = {
            top: { style: "thin", color: { argb: "FFE2E8F0" } },
            bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
            left: { style: "thin", color: { argb: "FFE2E8F0" } },
            right: { style: "thin", color: { argb: "FFE2E8F0" } },
          };
        });

        t2CurRow++;
      }

      const t2DataEndRow = t2CurRow - 1;

      // Abschlusszeile Mannschaftsauswertung
      const t2SummaryRow = ws.getRow(t2CurRow);
      t2SummaryRow.height = 20;

      const lblMTotal = t2SummaryRow.getCell(1);
      lblMTotal.value = "Mannschafts-Schnitt";
      lblMTotal.font = { bold: true };
      lblMTotal.alignment = { vertical: "middle", horizontal: "left" };

      for (let r = 1; r <= conf.roundCount; r++) {
        const colLetter = String.fromCharCode(65 + r);
        const cell = t2SummaryRow.getCell(1 + r);
        cell.value = {
          formula: `AVERAGE(${colLetter}${t2DataStartRow}:${colLetter}${t2DataEndRow})`,
        };
        cell.numFmt = "0.0";
        cell.font = { bold: true };
        cell.alignment = { vertical: "middle", horizontal: "right" };
      }

      const t2TotLetter = String.fromCharCode(64 + t2TotCol);
      const t2AvgLetter = String.fromCharCode(64 + t2AvgCol);

      const cellAllTot = t2SummaryRow.getCell(t2TotCol);
      cellAllTot.value = {
        formula: `SUM(${t2TotLetter}${t2DataStartRow}:${t2TotLetter}${t2DataEndRow})`,
      };
      cellAllTot.numFmt = "#,##0";
      cellAllTot.font = { bold: true };
      cellAllTot.alignment = { vertical: "middle", horizontal: "right" };

      const cellAllAvg = t2SummaryRow.getCell(t2AvgCol);
      cellAllAvg.value = {
        formula: `AVERAGE(${t2AvgLetter}${t2DataStartRow}:${t2AvgLetter}${t2DataEndRow})`,
      };
      cellAllAvg.numFmt = "0.0";
      cellAllAvg.font = { bold: true };
      cellAllAvg.alignment = { vertical: "middle", horizontal: "right" };

      for (let col = 1; col <= t2AvgCol; col++) {
        const cell = t2SummaryRow.getCell(col);
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFF2F4F8" },
        };
        cell.border = {
          top: { style: "thin", color: { argb: "FF1F4E79" } },
          bottom: { style: "double", color: { argb: "FF1F4E79" } },
        };
      }
    }

    // 4. Excel-Arbeitsmappe als Binär-Buffer serialisieren
    const buffer = await workbook.xlsx.writeBuffer();
    const todayIso = new Date().toISOString().split("T")[0];
    const fileName = `Sportschuetzen_Muhen_Wettkaempfe_Gesamtauswertung_${targetYear}_${todayIso}.xlsx`;

    return new Response(buffer, {
      status: 200,
      headers: {
        ...corsHeaders,
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Cache-Control": "no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: any) {
    console.error("❌ Fehler beim Generieren des konsolidierten Excel-Exports:", err);
    return new Response(
      JSON.stringify({
        success: false,
        error: err.message || String(err),
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
