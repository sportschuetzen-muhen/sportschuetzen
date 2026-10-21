// supabase/functions/export-results-excel/index.ts
// ==============================================================================
// Excel-Export mit Supabase und ExcelJS (2-Blatt-Architektur)
// Projekt: Vereinsportal Sportschützen Muhen
//
// Blatt 1: "Rohdaten" (Flache tabellarische Liste / Normalform)
// Blatt 2: "Auswertung" (Dashboard mit dynamischen Excel-Formeln: SUMIFS, AVERAGE, SUM)
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
import ExcelJS from "https://esm.sh/exceljs@4.4.0";

interface ExportExcelPayload {
  year?: number | string;
  contest_type?: string;
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let yearParam: string | number | undefined;
    let contestTypeParam: string | undefined;

    // Parameter aus URL (GET) oder Request-Body (POST) lesen
    if (req.method === "GET") {
      const url = new URL(req.url);
      yearParam = url.searchParams.get("year") || undefined;
      contestTypeParam = url.searchParams.get("contest_type") || undefined;
    } else {
      try {
        const body: ExportExcelPayload = await req.json();
        yearParam = body.year;
        contestTypeParam = body.contest_type;
      } catch (_) {
        const url = new URL(req.url);
        yearParam = url.searchParams.get("year") || undefined;
        contestTypeParam = url.searchParams.get("contest_type") || undefined;
      }
    }

    const currentYear = new Date().getFullYear();
    const targetYear = yearParam ? parseInt(String(yearParam), 10) : currentYear;
    const contestType = (contestTypeParam || "mannschaft").toLowerCase();

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

    // 2. Schiessresultate aus public.contest_results abrufen
    const { data: results, error: resultsErr } = await supabase
      .from("contest_results")
      .select("*")
      .eq("contest_type", contestType)
      .eq("year", targetYear)
      .order("name", { ascending: true });

    if (resultsErr) {
      throw new Error(`Fehler beim Abrufen der Resultate: ${resultsErr.message}`);
    }

    // 3. SSV-Lizenzen aus public.members abrufen
    const { data: members, error: membersErr } = await supabase
      .from("members")
      .select("person_number, address_number, first_name, last_name");

    if (membersErr) {
      console.warn("Hinweis: Mitglieder konnten nicht geladen werden:", membersErr.message);
    }

    const memberLicMap = new Map<string, string>();
    if (members && Array.isArray(members)) {
      for (const m of members) {
        if (m.person_number != null) {
          memberLicMap.set(String(m.person_number), m.address_number ? String(m.address_number) : "");
        }
      }
    }

    const shooterRows = results || [];

    // 4. ExcelJS Arbeitsmappe initialisieren
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
    // BLATT 1: "Rohdaten" (Flache Normalform)
    // =========================================================================
    const wsRohdaten = workbook.addWorksheet("Rohdaten", {
      views: [{ showGridLines: true }],
    });

    // Spaltenaufbau Blatt 1
    wsRohdaten.columns = [
      { header: "Schütze", key: "schuetze", width: 25 },
      { header: "Lizenz", key: "lizenz", width: 15 },
      { header: "Stellung", key: "stellung", width: 15 },
      { header: "Runde", key: "runde", width: 10 },
      { header: "Mannschaft", key: "mannschaft", width: 15 },
      { header: "Punkte", key: "punkte", width: 12 },
    ];

    // Header-Zeile formatieren (Dunkelblau #1F4E79, weiß, fett, zentriert, 24pt)
    const headerRow1 = wsRohdaten.getRow(1);
    headerRow1.height = 24;
    headerRow1.eachCell((cell) => {
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

    // Daten in Blatt 1 einfügen
    let rawRowCount = 0;
    const roundCount = contestType === "mannschaft" ? 7 : 3;

    for (const s of shooterRows) {
      const pn = String(s.person_number || "");
      const lizenz = memberLicMap.get(pn) || "";
      const stellungRaw = String(s.stellung || "liegend").toLowerCase();
      const stellung =
        stellungRaw === "kniend"
          ? "Kniend"
          : stellungRaw === "stehend"
          ? "Stehend"
          : "Liegend";

      for (let r = 1; r <= roundCount; r++) {
        const team = String(s[`r${r}_team`] || "").trim();
        const p1Raw = s[`r${r}_p1`];
        const hasPoints = p1Raw !== null && p1Raw !== undefined && p1Raw !== "";

        // Zeile hinzufügen, wenn Team zugeteilt ist oder Punkte geschossen wurden
        if (team || hasPoints) {
          rawRowCount++;
          const points = hasPoints ? Number(p1Raw) : 0;
          const assignedTeam = team || "Pool";

          const row = wsRohdaten.addRow({
            schuetze: s.name || "Unbekannt",
            lizenz: lizenz,
            stellung: stellung,
            runde: r,
            mannschaft: assignedTeam,
            punkte: points,
          });

          row.height = 18;
          row.getCell(1).alignment = { vertical: "middle", horizontal: "left" };
          row.getCell(2).alignment = { vertical: "middle", horizontal: "center" };
          row.getCell(3).alignment = { vertical: "middle", horizontal: "center" };
          row.getCell(4).alignment = { vertical: "middle", horizontal: "center" };
          row.getCell(5).alignment = { vertical: "middle", horizontal: "center" };

          const cellPunkte = row.getCell(6);
          cellPunkte.alignment = { vertical: "middle", horizontal: "right" };
          cellPunkte.numFmt = "#,##0";

          // Dezente Rahmen
          row.eachCell((cell) => {
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

    // Falls keine Rohdaten existieren, eine leere Musterzeile setzen
    if (rawRowCount === 0) {
      const dummyRow = wsRohdaten.addRow({
        schuetze: "Muster Schütze",
        lizenz: "100000",
        stellung: "Liegend",
        runde: 1,
        mannschaft: "Muhen 1",
        punkte: 0,
      });
      dummyRow.height = 18;
      dummyRow.getCell(6).numFmt = "#,##0";
      rawRowCount = 1;
    }

    // Excel-Autofilter setzen: 'A1:F{letzteZeile}'
    const lastRohdatenRow = wsRohdaten.rowCount;
    wsRohdaten.autoFilter = `A1:F${lastRohdatenRow}`;

    // =========================================================================
    // BLATT 2: "Auswertung" (Dashboard mit dynamischen Excel-Formeln)
    // =========================================================================
    const wsAuswertung = workbook.addWorksheet("Auswertung", {
      views: [{ showGridLines: true }],
    });

    // Spaltenbreiten Blatt 2
    // A: Schütze (25), B: Lizenz (15), C: Stellung (15), D-J: R1-R7 (10), K: Total (14), L: Schnitt (12)
    wsAuswertung.getColumn(1).width = 25; // A
    wsAuswertung.getColumn(2).width = 15; // B
    wsAuswertung.getColumn(3).width = 15; // C
    for (let col = 4; col <= 10; col++) {
      wsAuswertung.getColumn(col).width = 10; // D bis J (R1 - R7)
    }
    wsAuswertung.getColumn(11).width = 14; // K: Gesamttotal
    wsAuswertung.getColumn(12).width = 12; // L: Schnitt (Ø)

    // 1. Titelblock (Zeilen 1–3)
    const titleRow = wsAuswertung.getRow(1);
    titleRow.height = 26;
    const titleCell = titleRow.getCell(1);
    titleCell.value =
      contestType === "mannschaft"
        ? `SMM Mannschaftsmeisterschaft – Auswertung & Matrix (${targetYear})`
        : `Schiesssport Auswertung & Matrix (${targetYear})`;
    titleCell.font = {
      name: "Calibri",
      size: 14,
      bold: true,
      color: { argb: "FF1F4E79" },
    };

    const dateRow = wsAuswertung.getRow(2);
    dateRow.height = 16;
    const dateCell = dateRow.getCell(1);
    const now = new Date();
    const formattedDate = `${now.toLocaleDateString("de-CH")} ${now.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`;
    dateCell.value = `Generiert am: ${formattedDate} | Datenbasis: public.contest_results (${shooterRows.length} Schützen)`;
    dateCell.font = {
      name: "Calibri",
      size: 9,
      italic: true,
      color: { argb: "FF7F7F7F" },
    };

    // Zeile 3 bleibt als Abstandhalter leer

    // 2. Tabelle 1: Matrix pro Schütze (Header in Zeile 4)
    const t1HeaderRow = wsAuswertung.getRow(4);
    t1HeaderRow.height = 22;
    const t1Headers = [
      "Schütze",
      "Lizenz",
      "Stellung",
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "Gesamttotal",
      "Schnitt (Ø)",
    ];

    t1Headers.forEach((h, idx) => {
      const cell = t1HeaderRow.getCell(idx + 1);
      cell.value = h;
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFD9E1F2" }, // Dezent akzentuiertes Hellblau/Grau
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

    // Datenzeilen Tabelle 1 (ab Zeile 5)
    let curRowIdx = 5;
    const shooterStartRow = 5;

    for (const s of shooterRows) {
      const pn = String(s.person_number || "");
      const lizenz = memberLicMap.get(pn) || "";
      const stellungRaw = String(s.stellung || "liegend").toLowerCase();
      const stellung =
        stellungRaw === "kniend"
          ? "Kniend"
          : stellungRaw === "stehend"
          ? "Stehend"
          : "Liegend";

      const rRow = wsAuswertung.getRow(curRowIdx);
      rRow.height = 18;

      // Spalte A: Schütze
      const cellName = rRow.getCell(1);
      cellName.value = s.name || "Unbekannt";
      cellName.alignment = { vertical: "middle", horizontal: "left" };

      // Spalte B: Lizenz
      const cellLic = rRow.getCell(2);
      cellLic.value = lizenz;
      cellLic.alignment = { vertical: "middle", horizontal: "center" };

      // Spalte C: Stellung
      const cellStell = rRow.getCell(3);
      cellStell.value = stellung;
      cellStell.alignment = { vertical: "middle", horizontal: "center" };

      // Spalten D–J (R1 bis R7): Dynamische Formeln via SUMIFS aus Rohdaten
      // Formel-Syntax in ExcelJS: Englisch mit Komma-Trennung!
      for (let r = 1; r <= 7; r++) {
        const cellR = rRow.getCell(3 + r);
        cellR.value = {
          formula: `SUMIFS(Rohdaten!$F:$F, Rohdaten!$A:$A, A${curRowIdx}, Rohdaten!$D:$D, ${r})`,
        };
        cellR.numFmt = "#,##0";
        cellR.alignment = { vertical: "middle", horizontal: "right" };
      }

      // Spalte K: Gesamttotal -> =SUM(D{row}:J{row})
      const cellTotal = rRow.getCell(11);
      cellTotal.value = {
        formula: `SUM(D${curRowIdx}:J${curRowIdx})`,
      };
      cellTotal.numFmt = "#,##0";
      cellTotal.font = { bold: true };
      cellTotal.alignment = { vertical: "middle", horizontal: "right" };

      // Spalte L: Schnitt (Ø) -> =AVERAGE(D{row}:J{row})
      const cellAvg = rRow.getCell(12);
      cellAvg.value = {
        formula: `AVERAGE(D${curRowIdx}:J${curRowIdx})`,
      };
      cellAvg.numFmt = "0.0";
      cellAvg.font = { bold: true };
      cellAvg.alignment = { vertical: "middle", horizontal: "right" };

      // Rahmen für alle Datenzellen
      rRow.eachCell((cell) => {
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

    // Unterste Zeile Tabelle 1: Rundendurchschnitt
    const t1AvgRow = wsAuswertung.getRow(curRowIdx);
    t1AvgRow.height = 20;

    const lblAvg = t1AvgRow.getCell(1);
    lblAvg.value = "Rundendurchschnitt";
    lblAvg.font = { bold: true };
    lblAvg.alignment = { vertical: "middle", horizontal: "left" };

    // R1 bis R7 Durchschnitt
    for (let r = 1; r <= 7; r++) {
      const colLetter = String.fromCharCode(67 + r); // D=68, E=69, ..., J=74
      const cell = t1AvgRow.getCell(3 + r);
      cell.value = {
        formula: `AVERAGE(${colLetter}${shooterStartRow}:${colLetter}${shooterEndRow})`,
      };
      cell.numFmt = "0.0";
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }

    // Gesamttotal-Durchschnitt (Spalte K)
    const t1TotAvg = t1AvgRow.getCell(11);
    t1TotAvg.value = {
      formula: `AVERAGE(K${shooterStartRow}:K${shooterEndRow})`,
    };
    t1TotAvg.numFmt = "0.0";
    t1TotAvg.font = { bold: true };
    t1TotAvg.alignment = { vertical: "middle", horizontal: "right" };

    // Schnitt-Durchschnitt (Spalte L)
    const t1SchnittAvg = t1AvgRow.getCell(12);
    t1SchnittAvg.value = {
      formula: `AVERAGE(L${shooterStartRow}:L${shooterEndRow})`,
    };
    t1SchnittAvg.numFmt = "0.0";
    t1SchnittAvg.font = { bold: true };
    t1SchnittAvg.alignment = { vertical: "middle", horizontal: "right" };

    // Styling Summenzeile: Oben thin border, unten doppelte Rahmenlinie (double border)
    for (let col = 1; col <= 12; col++) {
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

    // =========================================================================
    // TABELLE 2: Mannschaftsauswertung (z. B. ab Zeile curRowIdx + 3)
    // =========================================================================
    const t2StartTitleRow = curRowIdx + 3;
    const t2HeaderRowIdx = t2StartTitleRow + 1;

    // Zwischentitel
    const t2TitleRow = wsAuswertung.getRow(t2StartTitleRow);
    t2TitleRow.height = 22;
    const t2TitleCell = t2TitleRow.getCell(1);
    t2TitleCell.value = "Mannschaftsauswertung (SMM Runden 1 bis 7)";
    t2TitleCell.font = {
      name: "Calibri",
      size: 12,
      bold: true,
      color: { argb: "FF1F4E79" },
    };

    // Header Tabelle 2
    const t2HeaderRow = wsAuswertung.getRow(t2HeaderRowIdx);
    t2HeaderRow.height = 22;
    const t2Headers = [
      "Mannschaft",
      "R1",
      "R2",
      "R3",
      "R4",
      "R5",
      "R6",
      "R7",
      "Gesamt",
      "Schnitt",
    ];

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

    // Ermitteln der Mannschaften (Standard: Muhen 1, Muhen 2, Muhen 3)
    const teamsSet = new Set<string>();
    shooterRows.forEach((r) => {
      for (let i = 1; i <= 7; i++) {
        const tm = String(r[`r${i}_team`] || "").trim();
        if (tm && tm.toLowerCase() !== "pool") {
          teamsSet.add(tm);
        }
      }
    });

    // Fallback falls noch keine Teams in DB vergeben sind
    if (teamsSet.size === 0) {
      teamsSet.add("Muhen 1");
      teamsSet.add("Muhen 2");
      teamsSet.add("Muhen 3");
    }

    const teamList = Array.from(teamsSet).sort((a, b) =>
      a.localeCompare(b, "de")
    );

    let t2CurRow = t2HeaderRowIdx + 1;
    const t2DataStartRow = t2CurRow;

    for (const teamName of teamList) {
      const mRow = wsAuswertung.getRow(t2CurRow);
      mRow.height = 18;

      // Spalte A: Mannschaft
      const cellMName = mRow.getCell(1);
      cellMName.value = teamName;
      cellMName.font = { bold: true };
      cellMName.alignment = { vertical: "middle", horizontal: "left" };

      // Spalten B bis H (R1 bis R7): =SUMIFS(Rohdaten!F:F, Rohdaten!E:E, A{mRow}, Rohdaten!D:D, {r})
      for (let r = 1; r <= 7; r++) {
        const cellR = mRow.getCell(1 + r);
        cellR.value = {
          formula: `SUMIFS(Rohdaten!$F:$F, Rohdaten!$E:$E, A${t2CurRow}, Rohdaten!$D:$D, ${r})`,
        };
        cellR.numFmt = "#,##0";
        cellR.alignment = { vertical: "middle", horizontal: "right" };
      }

      // Spalte I (Gesamt): =SUM(B{mRow}:H{mRow})
      const cellTot = mRow.getCell(9);
      cellTot.value = {
        formula: `SUM(B${t2CurRow}:H${t2CurRow})`,
      };
      cellTot.numFmt = "#,##0";
      cellTot.font = { bold: true };
      cellTot.alignment = { vertical: "middle", horizontal: "right" };

      // Spalte J (Schnitt): =AVERAGE(B{mRow}:H{mRow})
      const cellAvg = mRow.getCell(10);
      cellAvg.value = {
        formula: `AVERAGE(B${t2CurRow}:H${t2CurRow})`,
      };
      cellAvg.numFmt = "0.0";
      cellAvg.font = { bold: true };
      cellAvg.alignment = { vertical: "middle", horizontal: "right" };

      // Rahmen
      mRow.eachCell((cell) => {
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

    // Abschlusszeile Tabelle 2 (Mannschafts-Durchschnitt)
    const t2SummaryRow = wsAuswertung.getRow(t2CurRow);
    t2SummaryRow.height = 20;

    const lblMTotal = t2SummaryRow.getCell(1);
    lblMTotal.value = "Mannschafts-Schnitt";
    lblMTotal.font = { bold: true };
    lblMTotal.alignment = { vertical: "middle", horizontal: "left" };

    // R1 bis R7 Schnitt über alle Teams
    for (let r = 1; r <= 7; r++) {
      const colLetter = String.fromCharCode(65 + r); // B=66, C=67, ..., H=72
      const cell = t2SummaryRow.getCell(1 + r);
      cell.value = {
        formula: `AVERAGE(${colLetter}${t2DataStartRow}:${colLetter}${t2DataEndRow})`,
      };
      cell.numFmt = "0.0";
      cell.font = { bold: true };
      cell.alignment = { vertical: "middle", horizontal: "right" };
    }

    // Gesamtsumme aller Teams (Spalte I)
    const cellAllTot = t2SummaryRow.getCell(9);
    cellAllTot.value = {
      formula: `SUM(I${t2DataStartRow}:I${t2DataEndRow})`,
    };
    cellAllTot.numFmt = "#,##0";
    cellAllTot.font = { bold: true };
    cellAllTot.alignment = { vertical: "middle", horizontal: "right" };

    // Durchschnittlicher Team-Schnitt (Spalte J)
    const cellAllAvg = t2SummaryRow.getCell(10);
    cellAllAvg.value = {
      formula: `AVERAGE(J${t2DataStartRow}:J${t2DataEndRow})`,
    };
    cellAllAvg.numFmt = "0.0";
    cellAllAvg.font = { bold: true };
    cellAllAvg.alignment = { vertical: "middle", horizontal: "right" };

    // Styling Summenzeile: doppelte Linie unten
    for (let col = 1; col <= 10; col++) {
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

    // 5. Excel-Arbeitsmappe als Binär-Buffer serialisieren
    const buffer = await workbook.xlsx.writeBuffer();

    const todayIso = new Date().toISOString().split("T")[0];
    const fileName = `Sportschuetzen_Muhen_SMM_Auswertung_${targetYear}_${todayIso}.xlsx`;

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
    console.error("❌ Fehler beim Generieren des Excel-Exports:", err);
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
