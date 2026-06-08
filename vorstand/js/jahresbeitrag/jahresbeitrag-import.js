// vorstand/js/jahresbeitrag/jahresbeitrag-import.js
// ============================================================
// TAB 3: EXCEL IMPORT TAB RENDER
// ============================================================
function renderExcelImportTab() {
  return `
    <div class="card border-0 shadow-sm p-4 bg-white">
      <h4 class="mb-3 text-primary"><i class="fas fa-file-excel me-2"></i>Excel Turnier-Import</h4>
      <p class="text-muted small">
        Hier können Sie die rohen Resultatsblätter aus dem <strong>Vereinswettschiessen</strong>, 
        <strong>Verbandsschiessen</strong> oder <strong>Dez-Import</strong> direkt hochladen. 
        Das System liest die Lizenzen aus und trägt die Teilnahmen vollautomatisch ein.
      </p>

      <div class="row g-4 mt-2">
        <div class="col-md-4">
          <div class="card p-3 border-dashed text-center h-100 bg-light" style="border: 2px dashed #ccc; cursor: pointer;" 
               onclick="document.getElementById('importFileVerein').click()">
            <input type="file" id="importFileVerein" class="d-none" accept=".xlsx,.xlsm,.xls,.csv" 
                   onchange="jbHandleExcelUpload(this.files[0], 'verein')">
            <i class="fas fa-trophy fa-2x mb-2 text-success"></i>
            <h6>1. Vereinswettschiessen</h6>
            <span class="text-muted small" style="font-size: 11px;">(Vereinswettschiessen.xlsx / .csv)</span>
            <div class="btn btn-sm btn-outline-success mt-3">Datei wählen</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card p-3 border-dashed text-center h-100 bg-light" style="border: 2px dashed #ccc; cursor: pointer;" 
               onclick="document.getElementById('importFileVerband').click()">
            <input type="file" id="importFileVerband" class="d-none" accept=".xlsx,.xlsm,.xls,.csv" 
                   onchange="jbHandleExcelUpload(this.files[0], 'verband')">
            <i class="fas fa-medal fa-2x mb-2 text-primary"></i>
            <h6>2. Verbandsschiessen</h6>
            <span class="text-muted small" style="font-size: 11px;">(Verband.xlsx / .csv)</span>
            <div class="btn btn-sm btn-outline-primary mt-3">Datei wählen</div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card p-3 border-dashed text-center h-100 bg-light" style="border: 2px dashed #ccc;" 
               onclick="document.getElementById('importFileDez').click()" id="jbDezCard">
            <input type="file" id="importFileDez" class="d-none" accept=".xlsx,.xlsm,.xls,.csv"
                   multiple
                   onchange="jbHandleExcelUploadMulti(this.files, 'dez')">
            <i class="fas fa-chart-line fa-2x mb-2 text-warning"></i>
            <h6>3. Dez-Import (Dezember)</h6>
            <span class="text-muted small" style="font-size: 11px;">
              Mehrere Dateien möglich (Ctrl+Klick)<br>
              (Resultatblatt_1.xlsx, _2.xlsx / .csv)
            </span>
            <div id="jbDezFileCount" class="mt-2 d-none">
              <span class="badge bg-warning text-dark" id="jbDezFileBadge"></span>
            </div>
            <div class="btn btn-sm btn-outline-warning mt-2" style="cursor:pointer;">Datei(en) wählen</div>
          </div>
        </div>
      </div>

      <!-- Preview-Bereich für gelesene Excel-Daten -->
      <div id="jbImportPreviewContainer" class="mt-4 d-none">
        <hr>
        <h5 class="mb-3 d-flex justify-content-between align-items-center">
          <span>👀 Vorschau für importierte Daten:</span>
          <button class="btn btn-sm btn-success" onclick="jbSubmitExcelImport()">
            <i class="fas fa-cloud-upload-alt me-1"></i> Import in Google Sheets starten
          </button>
        </h5>
        <div class="table-responsive border rounded bg-light" style="max-height: 400px; overflow-y: auto;">
          <table class="table table-hover table-sm mb-0">
            <thead class="table-dark sticky-top">
              <tr>
                <th>Lizenznummer</th>
                <th>Name (erkannt)</th>
                <th>Turnier / Event</th>
                <th>Status / Wert</th>
              </tr>
            </thead>
            <tbody id="jbImportPreviewBody"></tbody>
          </table>
        </div>
      </div>

    </div>
  `;
}

// ============================================================
// CLIENT-SEITIGER DATEI-IMPORTPARSER (Excel & CSV)
// ============================================================
function jbHandleExcelUpload(file, type) {
  if (!file) return;

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();

  if (isCsv) {
    reader.onload = function(e) {
      try {
        const text = e.target.result;
        const parsedRows = jbParseCSV(text);
        jbProcessExcelRows(parsedRows, type);
      } catch(err) {
        alert("Fehler beim Lesen der CSV-Datei: " + err.message);
      }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.onload = function(e) {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array' });

        console.log('📂 Sheets in der Datei:', workbook.SheetNames);

        let bestSheet = workbook.SheetNames[0];
        let bestScore = -1;

        const foundResultatblatt = workbook.SheetNames.find(s => s.toLowerCase().trim() === 'resultatblatt');
        if (foundResultatblatt) {
          bestSheet = foundResultatblatt;
          console.log('🎯 Prio 1: Sheet "Resultatblatt" direkt gewählt:', bestSheet);
        } else {
          const SCORE_KEYWORDS = [
            'lizenz', 'ausweis', 'liz', 'total', 'resultat', 'ergebnis',
            'punkte', 'passe', 'stich', 'name', 'vorname', 'jahrgang'
          ];

          workbook.SheetNames.forEach(sheetName => {
            const ws = workbook.Sheets[sheetName];
            const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            let score = 0;
            for (let r = 0; r < Math.min(rows.length, 40); r++) {
              const row = rows[r] || [];
              for (let c = 0; c < row.length; c++) {
                const val = String(row[c] || '').toLowerCase().trim();
                if (SCORE_KEYWORDS.some(k => val.includes(k))) score++;
              }
            }
            console.log('  Sheet "' + sheetName + '": Score ' + score);
            if (score > bestScore) {
              bestScore = score;
              bestSheet = sheetName;
            }
          });
        }

        console.log('✅ Verwende Sheet:', bestSheet, '(Score ' + bestScore + ')');

        const worksheet = workbook.Sheets[bestSheet];
        const jsonRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        jbProcessExcelRows(jsonRows, type);
      } catch(err) {
        alert("Fehler beim Lesen der Excel-Datei: " + err.message);
      }
    };
    reader.readAsArrayBuffer(file);
  }
}

async function jbHandleExcelUploadMulti(files, type) {
  if (!files || files.length === 0) return;

  _jbImportData = [];
  const previewBody = document.getElementById('jbImportPreviewBody');
  const previewContainer = document.getElementById('jbImportPreviewContainer');
  previewBody.innerHTML = '';
  previewContainer.classList.add('d-none');

  const badge = document.getElementById('jbDezFileBadge');
  const badgeContainer = document.getElementById('jbDezFileCount');
  if (badge && badgeContainer) {
    badge.textContent = files.length + ' Datei' + (files.length > 1 ? 'en ausgewählt' : ' ausgewählt');
    badgeContainer.classList.remove('d-none');
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const isAppend = i > 0;
    await new Promise((resolve) => {
      const isCsv = file.name.toLowerCase().endsWith('.csv');
      const reader = new FileReader();
      if (isCsv) {
        reader.onload = function(e) {
          try {
            const parsedRows = jbParseCSV(e.target.result);
            jbProcessExcelRows(parsedRows, type, isAppend);
          } catch(err) {
            alert('Fehler in Datei ' + file.name + ': ' + err.message);
          }
          resolve();
        };
        reader.readAsText(file, 'UTF-8');
      } else {
        reader.onload = function(e) {
          try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            let bestSheet = workbook.SheetNames[0];
            let bestScore = -1;

            const foundResultatblatt = workbook.SheetNames.find(s => s.toLowerCase().trim() === 'resultatblatt');
            if (foundResultatblatt) {
              bestSheet = foundResultatblatt;
              console.log('🎯 Prio 1 (Multi): Sheet "Resultatblatt" direkt gewählt:', bestSheet);
            } else {
              const SCORE_KW = ['lizenz','name','vorname','jahrgang','kat','ssv','agsv'];
              workbook.SheetNames.forEach(sheetName => {
                const ws = workbook.Sheets[sheetName];
                const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
                let score = 0;
                for (let r = 0; r < Math.min(rows.length, 15); r++) {
                  (rows[r] || []).forEach(cell => {
                    const v = String(cell || '').toLowerCase();
                    if (SCORE_KW.some(k => v.includes(k))) score++;
                  });
                }
                if (score > bestScore) { bestScore = score; bestSheet = sheetName; }
              });
            }
            const ws = workbook.Sheets[bestSheet];
            const jsonRows = XLSX.utils.sheet_to_json(ws, { header: 1 });
            jbProcessExcelRows(jsonRows, type, isAppend);
          } catch(err) {
            alert('Fehler in Datei ' + file.name + ': ' + err.message);
          }
          resolve();
        };
        reader.readAsArrayBuffer(file);
      }
    });
  }
}

function jbParseCSV(text) {
  const lines = text.split(/\r?\n/);
  return lines.map(line => {
    let parts = line.split(';');
    if (parts.length <= 1) {
      parts = line.split(',');
    }
    if (parts.length <= 1) {
      parts = line.split('\t');
    }
    return parts.map(p => {
      p = p.trim();
      if (p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1);
      return p;
    });
  });
}

function jbProcessExcelRows(rows, type, appendMode) {
  if (!rows || rows.length < 5) {
    alert("Die Import-Datei enthält keine brauchbaren Zeilen oder ist leer.");
    return;
  }

  if (!appendMode) {
    _jbImportData = [];
    const previewBody = document.getElementById('jbImportPreviewBody');
    const previewContainer = document.getElementById('jbImportPreviewContainer');
    previewBody.innerHTML = '';
    previewContainer.classList.add('d-none');
  }

  const previewBody = document.getElementById('jbImportPreviewBody');
  const previewContainer = document.getElementById('jbImportPreviewContainer');

  let detectedCount = 0;

  console.group('🔍 DEBUG Excel-Import – Typ: ' + type);
  console.log('Anzahl Zeilen gesamt:', rows.length);
  console.log('Erste 30 Rohdaten-Zeilen:');
  rows.slice(0, 30).forEach((row, i) => {
    console.log(`  Zeile ${i}:`, row);
  });
  console.groupEnd();

  let debugHtml = `
    <div id="jbDebugPanel" style="
      background: #1e1e2e; color: #cdd6f4; font-family: monospace; font-size: 11px;
      padding: 12px; border-radius: 8px; margin-top: 16px; max-height: 350px;
      overflow-y: auto; border: 2px solid #89b4fa;">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
        <strong style="color:#89dceb">🔍 DEBUG: Rohdaten Excel-Import (Typ: <span style="color:#a6e3a1">${type}</span>)</strong>
        <button onclick="document.getElementById('jbDebugPanel').remove()" 
                style="background:#f38ba8; color:#1e1e2e; border:none; border-radius:4px; padding:2px 8px; cursor:pointer; font-size:10px;">✕ Schliessen</button>
      </div>
      <div style="color:#f9e2af; margin-bottom:6px">Gesamtzeilen: <strong>${rows.length}</strong> | Erste 30 Zeilen angezeigt:</div>
      <table style="width:100%; border-collapse:collapse; font-size:10px;">
        <thead><tr style="background:#313244; color:#89b4fa; position:sticky; top:0;">
          <th style="padding:3px 6px; text-align:left; border-bottom:1px solid #45475a">Zeile #</th>
          <th style="padding:3px 6px; text-align:left; border-bottom:1px solid #45475a">Zellen-Inhalt (alle Spalten)</th>
        </tr></thead>
        <tbody>
  `;
  rows.slice(0, 30).forEach((row, i) => {
    const cellsHtml = (row || []).map((cell, ci) => {
      const v = String(cell ?? '');
      const highlight = v.length > 0 ? 'color:#a6e3a1;' : 'color:#6c7086;';
      return `<span style="${highlight}" title="Spalte ${ci}">[${ci}]:${v || '–'}</span>`;
    }).join(' &nbsp; ');
    const rowBg = i % 2 === 0 ? 'background:#1e1e2e' : 'background:#181825';
    debugHtml += `<tr style="${rowBg}">
      <td style="padding:2px 6px; color:#cba6f7; white-space:nowrap">${i}</td>
      <td style="padding:2px 6px; white-space:pre-wrap; word-break:break-all">${cellsHtml || '<span style="color:#6c7086">–leer–</span>'}</td>
    </tr>`;
  });
  debugHtml += `</tbody></table></div>`;

  const existingDebug = document.getElementById('jbDebugPanel');
  if (existingDebug) existingDebug.remove();
  previewContainer.insertAdjacentHTML('beforebegin', debugHtml);

  // DYNAMISCHE SPALTENERKENNUNG (Erweiterte Keywords)
  let colLizenzIdx = 1;
  let colPruefIdx = 8;
  let startRowIdx = 18;

  const LIZENZ_KEYWORDS  = ['lizenznr', 'lizenz-nr', 'lizenz nr', 'ausweisnr', 'ausweis-nr',
                             'lizenznummer', 'ausweisnummer', 'liz.nr', 'lznr', 'liz nr',
                             'adressnr', 'adress-nr', 'adressnummer',
                             'mitglied-nr', 'mitgliedernr', 'mitgliedsnr',
                             'person-nr', 'personennr', 'person nr'];
  const LIZENZ_FUZZY     = ['lizenz', 'ausweis', 'adress'];
  const PRUEF_KEYWORDS   = ['total', 'resultat', 'ergebnis', 'punkte', 'score',
                             'prüfwert', 'pruefwert', '1. passe', 'passe', 'stich',
                             'wert', 'ring'];

  let bestHeaderRow = -1;
  let bestHeaderScore = 0;

  for (let r = 0; r < Math.min(rows.length, 40); r++) {
    const row = rows[r];
    if (!row) continue;
    let score = 0;
    for (let c = 0; c < row.length; c++) {
      const val = String(row[c] || '').toLowerCase().trim();
      if (LIZENZ_KEYWORDS.some(k => val === k || val.startsWith(k)))  score += 3;
      if (PRUEF_KEYWORDS.some(k  => val === k || val.startsWith(k)))  score += 2;
      if (LIZENZ_FUZZY.some(k => val.includes(k)))                    score += 1;
      if (/^[a-zäöüA-ZÄÖÜ\s\-.]{2,20}$/.test(val) && val.length < 20) score += 0.5;
    }
    if (score > bestHeaderScore) {
      bestHeaderScore = score;
      bestHeaderRow = r;
    }
  }

  if (bestHeaderRow >= 0) {
    startRowIdx = bestHeaderRow + 1;
    const headerRow = rows[bestHeaderRow];

    let lizenzFound = false;
    let pruefFound  = false;
    for (let c = 0; c < headerRow.length; c++) {
      const val = String(headerRow[c] || '').toLowerCase().trim();
      if (!lizenzFound) {
        if (LIZENZ_KEYWORDS.some(k => val === k || val.startsWith(k)) ||
            LIZENZ_FUZZY.some(k => val.includes(k))) {
          colLizenzIdx = c;
          lizenzFound = true;
        }
      }
      if (!pruefFound) {
        if (PRUEF_KEYWORDS.some(k => val === k || val.startsWith(k))) {
          colPruefIdx = c;
          pruefFound = true;
        }
      }
    }

    if (!pruefFound && startRowIdx < rows.length) {
      for (let c = 0; c < (rows[startRowIdx] || []).length; c++) {
        if (c === colLizenzIdx) continue;
        const sampleVals = [];
        for (let sr = startRowIdx; sr < Math.min(startRowIdx + 5, rows.length); sr++) {
          const v = Number(String((rows[sr] || [])[c] || '').replace(',', '.'));
          if (!isNaN(v) && v > 0) sampleVals.push(v);
        }
        if (sampleVals.length >= 2) { colPruefIdx = c; pruefFound = true; break; }
      }
    }

    console.log('📋 Beste Kopfzeile (Zeile ' + bestHeaderRow + ', Score ' + bestHeaderScore.toFixed(1) + '):', headerRow);
  } else {
    console.warn('⚠️ Keine Kopfzeile erkannt – verwende Standardwerte');
  }

  console.log('🔎 Erkannte Spalten:', { colLizenzIdx, colPruefIdx, startRowIdx, type });
  const detectedInfo = document.getElementById('jbDebugPanel');
  if (detectedInfo) {
    detectedInfo.insertAdjacentHTML('beforeend', `
      <div style="margin-top:8px; padding:6px 8px; background:#313244; border-radius:6px; color:#f9e2af; font-size:11px;">
        <strong>🎯 Erkannte Parameter:</strong>
        &nbsp; Lizenz-Spalte: <span style="color:#a6e3a1"><strong>[${colLizenzIdx}]</strong></span>
        &nbsp; Prüf-Spalte: <span style="color:#fab387"><strong>[${colPruefIdx}]</strong></span>
        &nbsp; Daten ab Zeile: <span style="color:#89dceb"><strong>${startRowIdx}</strong></span>
        &nbsp; Typ: <span style="color:#cba6f7"><strong>${type}</strong></span>
      </div>
    `);
  }

  if (type === 'verein' || type === 'verband') {
    const eventKey = type === 'verein' ? EVENT_KEYS.kk_verein : EVENT_KEYS.kk_verband;
    const eventName = type === 'verein' ? '50m Vereinsschiessen' : '50m Verbandsschiessen';

    for (let i = startRowIdx; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length <= colLizenzIdx) continue;

      const rawLizenz = String(row[colLizenzIdx] || '').trim();
      const cleanedLizenz = rawLizenz.replace(/\D/g, '');
      const normLizenz = cleanedLizenz.padStart(6, '0');

      let rawPruef = 0;
      if (row[colPruefIdx] !== undefined) {
        rawPruef = Number(String(row[colPruefIdx] || '0').replace(',', '.'));
      } else {
        for (let c = 0; c < row.length; c++) {
          if (c === colLizenzIdx) continue;
          const val = Number(String(row[c] || '0').replace(',', '.'));
          if (!isNaN(val) && val > 0) {
            rawPruef = val;
            break;
          }
        }
      }

      if (cleanedLizenz.length >= 4 && !isNaN(rawPruef) && rawPruef > 0) {
        const m = _jbMembers.find(x => String(x.AddressNumber || '').replace(/\D/g, '').padStart(6, '0') === normLizenz);
        
        let memberName = '';
        if (m) {
          memberName = `${m.FirstName} ${m.LastName}`;
        } else {
          const excelLastName = String(row[colLizenzIdx + 1] || '').trim();
          const excelFirstName = String(row[colLizenzIdx + 2] || '').trim();
          const excelFullName = (excelFirstName + ' ' + excelLastName).trim();
          memberName = `⚠️ Unbekanntes Mitglied${excelFullName ? ` (${excelFullName})` : ''}`;
        }
        const memberPN = m ? m.PersonNumber : '';

        _jbImportData.push({
          pn: m ? m.PersonNumber : null,
          year: _jbYear,
          eventkey: eventKey,
          teilgenommen: 1,
          quelle: 'excel-import'
        });

        previewBody.innerHTML += `
          <tr>
            <td>${cleanedLizenz}</td>
            <td class="${m ? '' : 'text-danger fw-bold'}">${memberName}${memberPN ? `<br><small class="text-muted">${memberPN}</small>` : ''}</td>
            <td>${eventName}</td>
            <td><span class="badge bg-${m ? 'success' : 'danger'}">${m ? 'Erkannt' : 'Kein Match'}</span></td>
          </tr>
        `;
        detectedCount++;
      }
    }
  } else if (type === 'dez') {
    let dezStartRow = 4;
    for (let r = 0; r < Math.min(rows.length, 10); r++) {
      const val = String((rows[r] || [])[0] || '').toLowerCase().trim();
      if (val === 'lizenz') {
        dezStartRow = r + 2;
        break;
      }
    }

    for (let i = dezStartRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length < 2) continue;

      const rawLizenz = String(row[0] || '').trim();
      const cleanedLizenz = rawLizenz.replace(/\D/g, '');
      if (cleanedLizenz.length < 4) continue;

      const normLizenz = cleanedLizenz.padStart(6, '0');

      const m = _jbMembers.find(x =>
        String(x.AddressNumber || '').replace(/\D/g, '').padStart(6, '0') === normLizenz
      );

      const ageClass = String(row[8] || '').trim().toUpperCase();
      const isJunior = ageClass === 'U17' || ageClass === 'U21';

      const valueL = Number(String(row[11] || '0').replace(',', '.')) || 0;
      const valueN = Number(String(row[13] || '0').replace(',', '.')) || 0;
      const valueO = Number(String(row[14] || '0').replace(',', '.')) || 0;
      const valueQ = Number(String(row[16] || '0').replace(',', '.')) || 0;
      const valueR = Number(String(row[17] || '0').replace(',', '.')) || 0;

      const colJ = String(row[9]  || '').trim();
      const colK = String(row[10] || '').trim();

      let matchedEvents = [];

      if (isJunior) {
        if (colJ !== '' && colJ !== '-') {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend, name: '50m CH DEZ (Junior)' });
        } else if (colK !== '' && colK !== '-') {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend, name: '50m AG DEZ 1D (Junior)' });
        } else {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_sv, name: '50m AG DEZ SV (Junior)' });
        }
      } else {
        if (colJ !== '' && colJ !== '-') {
          if (valueL > 200 || valueQ > 200 || valueR > 200) {
            matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend, name: '50m CH DEZ' });
          }
        }

        if (colK !== '' && colK !== '-') {
          if (valueL > 200) matchedEvents.push({ key: EVENT_KEYS.ssv_dez_liegend,   name: '50m AG DEZ 1D' });
          if (valueQ > 200) matchedEvents.push({ key: EVENT_KEYS.ssv_dez_2stellung, name: '50m AG DEZ 2D' });
          if (valueR > 200) matchedEvents.push({ key: EVENT_KEYS.ssv_dez_3stellung, name: '50m AG DEZ 3D' });
        }

        if ((colJ === '' || colJ === '-') && (valueN > 200 || valueO > 200)) {
          matchedEvents.push({ key: EVENT_KEYS.ssv_dez_sv, name: '50m AG DEZ SV' });
        }
      }

      matchedEvents.forEach(evt => {
        _jbImportData.push({
          pn: m ? m.PersonNumber : null,
          year: _jbYear,
          eventkey: evt.key,
          teilgenommen: 1,
          quelle: 'excel-import-dez'
        });

        let memberName = '';
        if (m) {
          memberName = `${m.FirstName} ${m.LastName}`;
        } else {
          const excelLastName = String(row[1] || '').trim();
          const excelFirstName = String(row[2] || '').trim();
          const excelFullName = (excelFirstName + ' ' + excelLastName).trim();
          memberName = `⚠️ Unbekanntes Mitglied${excelFullName ? ` (${excelFullName})` : ''}`;
        }
        const memberPN = m ? m.PersonNumber : '';

        previewBody.innerHTML += `
          <tr>
            <td>${cleanedLizenz}</td>
            <td class="${m ? '' : 'text-danger fw-bold'}">${memberName}${memberPN ? `<br><small class="text-muted">${memberPN}</small>` : ''}</td>
            <td>${evt.name} <span class="badge bg-secondary ms-1" style="font-size:9px">${ageClass||'E'}</span></td>
            <td><span class="badge bg-${m ? 'success' : 'danger'}">${m ? 'Erkannt' : 'Kein Match'}</span></td>
          </tr>
        `;
        detectedCount++;
      });
    }
  }

  if (detectedCount > 0) {
    previewContainer.classList.remove('d-none');
    showToast(`✅ ${detectedCount} Turnierteilnahmen erfolgreich analysiert!`);
  } else {
    const debugMsg = `Es wurden keine gültigen Einträge gefunden.\n\n` +
      `Erkannte Parameter:\n` +
      `  • Lizenz-Spalte: [${colLizenzIdx}]\n` +
      `  • Prüfwert-Spalte: [${colPruefIdx}]\n` +
      `  • Daten ab Zeile: ${startRowIdx}\n` +
      `  • Gesamtzeilen: ${rows.length}\n\n` +
      `Bitte Debug-Panel prüfen: Ist die Lizenznummer in Spalte [${colLizenzIdx}]? ` +
      `Hat Spalte [${colPruefIdx}] Zahlenwerte > 0?`;
    alert(debugMsg);
  }
}

async function jbSubmitExcelImport() {
  if (!_jbImportData || !_jbImportData.length) return;

  const btn = document.querySelector('button[onclick="jbSubmitExcelImport()"]');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span> Übertrage…';

  try {
    const validList = _jbImportData.filter(x => x.pn !== null && x.pn !== '');
    const skippedCount = _jbImportData.length - validList.length;
    if (skippedCount > 0) {
      console.warn(`⚠️ ${skippedCount} Einträge ohne Mitglieder-Match (AddressNumber nicht gefunden) werden übersprungen.`);
    }
    if (!validList.length) {
      alert('Keine gültigen Einträge zum Importieren (kein Mitglied via AddressNumber gefunden).');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> Import in Google Sheets starten';
      return;
    }

    const res = await apiFetch('jahresbeitrag', '', {
      method: 'POST',
      body: JSON.stringify({
        action: 'saveParticipationsBulk',
        list: validList,
        user: window.currentUser || 'frontend'
      })
    });
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    const uniquePns = [...new Set(validList.map(x => String(x.pn).trim()))];
    const resCalc = await apiFetch('jahresbeitrag', `action=berechnen&year=${_jbYear}&pn=${uniquePns.join(',')}`);
    const calcJson = await resCalc.json();
    if (!calcJson.success) throw new Error(calcJson.error);

    showToast(`🎉 ${json.message}`);
    document.getElementById('jbImportPreviewContainer').classList.add('d-none');
    _jbImportData = null;

    // Reload Jahresbeitrag details from spreadsheet
    await loadJahresbeitragData(true);

    // Sync invoices with Rechnungen module
    for (const pn of uniquePns) {
      const cleanPn = pn.trim();
      const updatedHeader = _jbData.find(x => String(x.PersonNumber).trim() === cleanPn);
      if (updatedHeader && updatedHeader.invoiceId) {
        const updatedM = _jbMemberMap[cleanPn] || {};
        const updatedName = updatedM.FirstName ? `${updatedM.FirstName} ${updatedM.LastName}` : cleanPn;
        try {
          console.log(`🤖 Synchronisiere Rechnung für ${cleanPn} nach Excel-Import...`);
          if (typeof ensureInvoiceCreatedRemote === 'function') {
            await ensureInvoiceCreatedRemote(updatedHeader, updatedM, updatedName);
          }
        } catch (err) {
          console.error(`⚠️ Fehler bei automatischer Rechnungs-Aktualisierung für ${cleanPn}:`, err);
        }
      }
    }

    // Trigger reload of invoices in the background
    if (typeof loadRechnungenData === 'function') {
      loadRechnungenData(true, true);
    }
  } catch(e) {
    alert("Fehler beim Hochladen der Daten: " + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-cloud-upload-alt me-1"></i> Import in Google Sheets starten';
  }
}
