// vorstand/js/resultate/resultate-import.js
// =========================================================
//  RESULTATE - Client-seitiger SGM Gruppenmeisterschaft Import (Excel)
//  Liest das offizielle SSV-Standblatt (Blatt 'Start') aus
//  mit automatischem Schützenabgleich (Lizenz/address_number & Name)
// =========================================================

let _sgmImportState = {
  fileName: '',
  groupTeam: 'Muhen 1',
  year: new Date().getFullYear(),
  parsedShooters: [],   // [{ name, lic, stellung, personNumber, memberName, isNew, rounds: {1: {p1, p2}, ...} }]
  selectedMap: {}       // key -> boolean
};

/**
 * Triggert die Dateiauswahl für das offizielle SGM Standblatt (Excel).
 */
function triggerSgmExcelImport() {
  let input = document.getElementById('sgm-excel-file-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'sgm-excel-file-input';
    input.accept = '.xlsx,.xlsm,.xls';
    input.className = 'd-none';
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleSgmExcelUpload(file);
      e.target.value = '';
    };
    document.body.appendChild(input);
  }
  input.click();
}
window.triggerSgmExcelImport = triggerSgmExcelImport;

/**
 * Verarbeitet die hochgeladene Excel-Datei clientseitig via SheetJS.
 */
async function handleSgmExcelUpload(file) {
  if (!file) return;
  if (typeof XLSX === 'undefined') {
    alert("Fehler: Excel-Bibliothek (SheetJS) ist nicht geladen.");
    return;
  }

  const contestType = window._resultateContestType || 'gruppe';
  if (contestType !== 'gruppe') {
    const confirmSwitch = confirm(`Du befindest dich aktuell im Modus "${contestType}". Möchtest du zur Gruppenmeisterschaft (SGM) wechseln, um dieses Standblatt einzulesen?`);
    if (confirmSwitch) {
      window.switchResultateContest('gruppe');
    } else {
      return;
    }
  }

  setStatus("Lese Excel-Standblatt...", false);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const data = new Uint8Array(arrayBuffer);
    const workbook = XLSX.read(data, { type: 'array' });

    // 1. Blatt 'Start' suchen (Standard beim SSV Standblatt)
    let startSheetName = workbook.SheetNames.find(s => s.toLowerCase().trim() === 'start');
    if (!startSheetName) {
      startSheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('start')) || workbook.SheetNames[0];
    }

    const worksheet = workbook.Sheets[startSheetName];
    if (!worksheet) {
      throw new Error(`Das Tabellenblatt "Start" wurde in der Datei "${file.name}" nicht gefunden.`);
    }

    // 2. Gruppen-Nummer ermitteln (z.B. E21 = '2' -> 'Muhen 2')
    let rawGroupNr = getCellString(worksheet, 'E21') || getCellString(worksheet, 'E20');
    if (!rawGroupNr) {
      // Fallback: Aus Dateinamen (z.B. "gruppe 2")
      const fnMatch = file.name.match(/gruppe\s*(\d+)/i);
      if (fnMatch) rawGroupNr = fnMatch[1];
    }
    rawGroupNr = (rawGroupNr || '1').trim();
    let detectedTeam = rawGroupNr.toLowerCase().startsWith('muhen') ? rawGroupNr : `Muhen ${rawGroupNr}`;

    // 3. Zeilen 13 bis 17 für die 3 Runden auslesen
    //    Runde 1: Name C, Lizenz D, P1 E, P2 F
    //    Runde 2: Name H, Lizenz I, P1 K, P2 L
    //    Runde 3: Name N, Lizenz O, P1 Q, P2 R
    //    Zeilen 13-15: Liegend, Zeilen 16-17: Kniend
    const roundDefs = [
      { round: 1, nameCol: 'C', licCol: 'D', p1Col: 'E', p2Col: 'F' },
      { round: 2, nameCol: 'H', licCol: 'I', p1Col: 'K', p2Col: 'L' },
      { round: 3, nameCol: 'N', licCol: 'O', p1Col: 'Q', p2Col: 'R' }
    ];

    const shootersMap = new Map(); // key -> shooterObj

    roundDefs.forEach(rDef => {
      const rnd = rDef.round;
      for (let rowIdx = 13; rowIdx <= 17; rowIdx++) {
        const stellung = rowIdx <= 15 ? 'liegend' : 'kniend';
        const name = getCellString(worksheet, `${rDef.nameCol}${rowIdx}`);
        const lic = getCellString(worksheet, `${rDef.licCol}${rowIdx}`);
        const p1Val = getCellInt(worksheet, `${rDef.p1Col}${rowIdx}`);
        const p2Val = getCellInt(worksheet, `${rDef.p2Col}${rowIdx}`);

        if (!name && !lic) continue;

        // Eindeutiger Identifikator (bevorzugt bereinigte Lizenznummer, sonst normalisierter Name)
        const cleanLic = (lic || '').replace(/\D/g, '');
        const normName = normalizeShooterName(name);
        const shooterKey = cleanLic || normName;

        if (!shootersMap.has(shooterKey)) {
          shootersMap.set(shooterKey, {
            key: shooterKey,
            rawName: name,
            rawLic: lic,
            stellung: stellung,
            team: detectedTeam,
            rounds: {}
          });
        }

        const entry = shootersMap.get(shooterKey);
        // Falls in späteren Runden der Name besser formatiert ist:
        if (name && !entry.rawName) entry.rawName = name;
        if (lic && !entry.rawLic) entry.rawLic = lic;

        entry.rounds[rnd] = {
          p1: p1Val,
          p2: p2Val,
          total: (p1Val != null && p2Val != null) ? (p1Val + p2Val) : (p1Val != null ? p1Val : null)
        };
      }
    });

    if (shootersMap.size === 0) {
      throw new Error("Es konnten keine Schützenzeilen auf Blatt 'Start' (Zeilen 13–17) gefunden werden.");
    }

    // 4. Schützen mit Vereinsmitgliedern abgleichen
    const parsedShooters = [];
    shootersMap.forEach(s => {
      const matched = matchShooterWithMembers(s.rawName, s.rawLic);
      const personNumber = matched ? matched.id : '';
      const memberName = matched ? `${matched.nachname} ${matched.vorname}` : s.rawName;
      
      // Prüfen ob bereits im aktuellen Resultate-State vorhanden
      const existsInRows = resultateState.rows.some(r => String(r.id) === String(personNumber) || normalizeShooterName(r.name) === normalizeShooterName(s.rawName));

      parsedShooters.push({
        key: s.key,
        name: memberName,
        rawName: s.rawName,
        lic: s.rawLic,
        stellung: s.stellung,
        team: s.team,
        personNumber: personNumber,
        isMatched: Boolean(matched),
        existsInRows: existsInRows,
        rounds: s.rounds
      });
    });

    _sgmImportState = {
      fileName: file.name,
      groupTeam: detectedTeam,
      year: window._resultateYear || new Date().getFullYear(),
      parsedShooters: parsedShooters,
      selectedMap: {}
    };

    // Standardmässig alle vorauswählen
    parsedShooters.forEach(s => {
      _sgmImportState.selectedMap[s.key] = true;
    });

    renderSgmImportModal();
    setStatus("Excel eingelesen – Vorschau prüfen", false);

  } catch (err) {
    console.error("❌ Fehler beim SGM Excel-Import:", err);
    alert(`Fehler beim Einlesen des Standblatts:\n${err.message || err}`);
    setStatus("Fehler beim Excel-Import", true);
  }
}
window.handleSgmExcelUpload = handleSgmExcelUpload;

/**
 * Gleicht einen Schützen über Lizenz oder Namen mit resultateState.members ab.
 */
function matchShooterWithMembers(rawName, rawLic) {
  if (!resultateState.members || resultateState.members.length === 0) return null;

  const cleanLic = (rawLic || '').replace(/\D/g, '');
  const cleanLicInt = cleanLic ? parseInt(cleanLic, 10) : null;

  // 1. Exakter Abgleich über Lizenz / address_number
  if (cleanLicInt != null) {
    const byLic = resultateState.members.find(m => {
      const mLic = String(m.address_number || '').replace(/\D/g, '');
      const mLicInt = mLic ? parseInt(mLic, 10) : null;
      return mLicInt === cleanLicInt || String(m.id) === cleanLic;
    });
    if (byLic) return byLic;
  }

  // 2. Namensabgleich (Nachname Vorname oder Vorname Nachname)
  const normRaw = normalizeShooterName(rawName);
  const byName = resultateState.members.find(m => {
    const fn1 = normalizeShooterName(`${m.nachname} ${m.vorname}`);
    const fn2 = normalizeShooterName(`${m.vorname} ${m.nachname}`);
    return normRaw === fn1 || normRaw === fn2;
  });
  if (byName) return byName;

  // 3. Unscharfer Abgleich (Nachname stimmt überein)
  const parts = normRaw.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const fuzzy = resultateState.members.find(m => {
      const l = normalizeShooterName(m.nachname);
      const f = normalizeShooterName(m.vorname);
      return parts.includes(l) && parts.some(p => p.startsWith(f.substring(0, 3)));
    });
    if (fuzzy) return fuzzy;
  }

  return null;
}

function normalizeShooterName(str) {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function getCellString(ws, cellRef) {
  const cell = ws[cellRef];
  if (!cell || cell.v == null) return '';
  return String(cell.v).trim();
}

function getCellInt(ws, cellRef) {
  const cell = ws[cellRef];
  if (!cell || cell.v == null || cell.v === '') return null;
  const num = parseInt(String(cell.v), 10);
  return isNaN(num) ? null : num;
}

/**
 * Rendert das Vorschau-Modal für den SGM Excel-Import.
 */
function renderSgmImportModal() {
  let modalEl = document.getElementById('modal-sgm-import-preview');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'modal-sgm-import-preview';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-centered">
        <div class="modal-content border-0 rounded-4 shadow">
          <div class="modal-header bg-success text-white border-0 py-3 rounded-top-4">
            <h5 class="modal-title fw-bold">
              <i class="fas fa-file-excel me-2"></i>SGM Gruppenmeisterschaft Standblatt-Import
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4">
            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <span class="text-muted small">Datei:</span> <strong id="sgm-import-filename"></strong>
                <span class="badge bg-primary ms-2" id="sgm-import-group-badge"></span>
                <span class="badge bg-secondary ms-1">Saison ${escapeHtml(String(_sgmImportState.year))}</span>
              </div>
              <div class="d-flex align-items-center gap-2">
                <label class="small text-muted mb-0 fw-semibold">Ziel-Team:</label>
                <select id="sgm-target-team-select" class="form-select form-select-sm" style="width: auto;" onchange="onSgmTargetTeamChange(this.value)">
                </select>
              </div>
            </div>

            <div class="alert alert-info py-2 px-3 small rounded-3 mb-3">
              <i class="fas fa-info-circle me-1"></i>
              Geprüft: Schützen wurden mit den SSV-Mitgliedern abgeglichen. Wähle die zu übernehmenden Schützen per Checkbox aus.
            </div>

            <div class="table-responsive rounded-3 border">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light">
                  <tr>
                    <th style="width: 36px;" class="text-center">
                      <input type="checkbox" id="sgm-select-all" class="form-check-input" checked onchange="toggleAllSgmShooters(this.checked)">
                    </th>
                    <th>Schütze (Mitglied)</th>
                    <th>Stellung</th>
                    <th class="text-center" style="width: 85px;">Runde 1</th>
                    <th class="text-center" style="width: 85px;">Runde 2</th>
                    <th class="text-center" style="width: 85px;">Runde 3</th>
                    <th style="width: 90px;">Status</th>
                  </tr>
                </thead>
                <tbody id="sgm-import-tbody">
                </tbody>
              </table>
            </div>
          </div>
          <div class="modal-footer border-0 p-3 bg-light rounded-bottom-4 d-flex justify-content-between">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
            <button type="button" class="btn btn-success fw-bold px-4" onclick="applySgmImportData()">
              <i class="fas fa-check me-1"></i>Ergebnisse in Cockpit übernehmen
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  // Header Details
  document.getElementById('sgm-import-filename').innerText = _sgmImportState.fileName;
  document.getElementById('sgm-import-group-badge').innerText = _sgmImportState.groupTeam;

  // Team Select initialisieren
  const teamSel = document.getElementById('sgm-target-team-select');
  const allTeams = [...new Set([...(resultateState.teams || []), _sgmImportState.groupTeam, 'Muhen 1', 'Muhen 2', 'Muhen 3'])].sort();
  teamSel.innerHTML = allTeams.map(t => `<option value="${escapeHtml(t)}" ${t === _sgmImportState.groupTeam ? 'selected' : ''}>${escapeHtml(t)}</option>`).join('');

  // Tabelle befüllen
  const tbody = document.getElementById('sgm-import-tbody');
  tbody.innerHTML = _sgmImportState.parsedShooters.map((s, idx) => {
    const isChecked = _sgmImportState.selectedMap[s.key] !== false;
    const stellungBadge = s.stellung === 'kniend'
      ? '<span class="badge bg-warning text-dark border">Kniend</span>'
      : '<span class="badge bg-info text-dark border">Liegend</span>';

    const fmtR = (rnd) => {
      const r = s.rounds[rnd];
      if (!r || (r.p1 == null && r.p2 == null)) return '<span class="text-muted">–</span>';
      return `<div class="fw-bold">${r.total ?? '–'}</div><div style="font-size: 10px;" class="text-muted">${r.p1 || 0}+${r.p2 || 0}</div>`;
    };

    const statusBadge = s.existsInRows
      ? '<span class="badge bg-primary-subtle text-primary border">Update</span>'
      : '<span class="badge bg-success-subtle text-success border">Neu</span>';

    const warningIcon = !s.isMatched
      ? `<span class="text-danger ms-1" title="Schütze nicht eindeutig in Mitgliederliste gefunden!"><i class="fas fa-exclamation-triangle"></i></span>`
      : '';

    return `
      <tr>
        <td class="text-center">
          <input type="checkbox" class="form-check-input" ${isChecked ? 'checked' : ''} onchange="toggleSgmShooter('${escapeHtml(s.key)}', this.checked)">
        </td>
        <td>
          <div class="fw-bold">${escapeHtml(s.name)}${warningIcon}</div>
          <div class="small text-muted" style="font-size: 11px;">
            Lizenz: ${escapeHtml(s.lic || '–')} | ID: ${escapeHtml(s.personNumber || 'Manuell')}
          </div>
        </td>
        <td>${stellungBadge}</td>
        <td class="text-center">${fmtR(1)}</td>
        <td class="text-center">${fmtR(2)}</td>
        <td class="text-center">${fmtR(3)}</td>
        <td>${statusBadge}</td>
      </tr>
    `;
  }).join('');

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function onSgmTargetTeamChange(val) {
  _sgmImportState.groupTeam = val;
  const badge = document.getElementById('sgm-import-group-badge');
  if (badge) badge.innerText = val;
}
window.onSgmTargetTeamChange = onSgmTargetTeamChange;

function toggleSgmShooter(key, checked) {
  _sgmImportState.selectedMap[key] = checked;
}
window.toggleSgmShooter = toggleSgmShooter;

function toggleAllSgmShooters(checked) {
  _sgmImportState.parsedShooters.forEach(s => {
    _sgmImportState.selectedMap[s.key] = checked;
  });
  const inputs = document.querySelectorAll('#sgm-import-tbody input[type="checkbox"]');
  inputs.forEach(inp => inp.checked = checked);
}
window.toggleAllSgmShooters = toggleAllSgmShooters;

/**
 * Übernimmt die geprüften Schützen in resultateState.rows.
 */
function applySgmImportData() {
  const selected = _sgmImportState.parsedShooters.filter(s => _sgmImportState.selectedMap[s.key] !== false);
  if (selected.length === 0) {
    alert("Bitte mindestens einen Schützen für den Import auswählen.");
    return;
  }

  const teamName = _sgmImportState.groupTeam;
  let importedCount = 0;

  selected.forEach(s => {
    // Schütze im State finden oder anlegen
    let row = resultateState.rows.find(r => 
      (s.personNumber && String(r.id) === String(s.personNumber)) || 
      normalizeShooterName(r.name) === normalizeShooterName(s.name)
    );

    if (!row) {
      // Neu anlegen
      row = {
        id: s.personNumber || `import_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: s.name,
        stellung: s.stellung || 'liegend',
        _autoR2: false,
        _autoR3: false
      };
      for (let i = 1; i <= 7; i++) {
        row[`r${i}_team`] = '';
        row[`r${i}_p1`] = '';
        if (i <= 3) row[`r${i}_p2`] = '';
      }
      resultateState.rows.push(row);
    }

    // Stellung aktualisieren
    row.stellung = s.stellung || row.stellung;

    // Rundenwerte übernehmen
    for (let r = 1; r <= 3; r++) {
      const rData = s.rounds[r];
      if (rData && (rData.p1 != null || rData.p2 != null)) {
        row[`r${r}_team`] = teamName;
        if (rData.p1 != null) row[`r${r}_p1`] = String(rData.p1);
        if (rData.p2 != null) row[`r${r}_p2`] = String(rData.p2);
      }
    }

    importedCount++;
  });

  // Teams-Liste ergänzen falls neu
  if (!resultateState.teams.includes(teamName) && teamName !== POOL_LABEL) {
    resultateState.teams.push(teamName);
    resultateState.teams.sort((a,b) => a.localeCompare(b, "de", {numeric:true}));
  }

  // State dirty setzen
  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen (SGM Import)", true);
  if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState();

  // Modal schliessen
  const modalEl = document.getElementById('modal-sgm-import-preview');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  // UI aktualisieren
  if (typeof renderUI === 'function') renderUI();

  alert(`✅ Erfolgreich: ${importedCount} Schütze${importedCount === 1 ? '' : 'n'} für Team "${teamName}" übernommen.\n\nBitte prüfe die Resultate und klicke auf "Speichern", um die Änderungen nach Supabase zu übertragen.`);
}
window.applySgmImportData = applySgmImportData;

// =========================================================
//  GRENZLAND-CUP - Client-seitiger PDF Ranglisten-Import (IKSV)
// =========================================================

let _grenzlandImportState = {
  fileName: '',
  year: new Date().getFullYear(),
  round: 1,
  groups: [],
  selectedMap: {}
};

/**
 * Triggert die Dateiauswahl für die offizielle Grenzland-Cup Rangliste (PDF).
 */
function triggerGrenzlandPdfImport() {
  let input = document.getElementById('grenzland-pdf-file-input');
  if (!input) {
    input = document.createElement('input');
    input.type = 'file';
    input.id = 'grenzland-pdf-file-input';
    input.accept = '.pdf,application/pdf';
    input.className = 'd-none';
    input.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      if (file) handleGrenzlandPdfUpload(file);
      e.target.value = '';
    };
    document.body.appendChild(input);
  }
  input.click();
}
window.triggerGrenzlandPdfImport = triggerGrenzlandPdfImport;

/**
 * Extrahiert Textzeilen aus einer PDF-Seite über koordinatengenaue Gruppierung (y-Achse).
 */
function extractLinesFromPdfTextContent(textContent) {
  const items = (textContent.items || []).filter(it => it.str && it.str.trim().length > 0);
  if (items.length === 0) return [];

  // Sortiere nach y absteigend (oben nach unten), danach nach x aufsteigend (links nach rechts)
  items.sort((a, b) => {
    const yA = a.transform ? a.transform[5] : 0;
    const yB = b.transform ? b.transform[5] : 0;
    if (Math.abs(yB - yA) > 3.5) {
      return yB - yA;
    }
    const xA = a.transform ? a.transform[4] : 0;
    const xB = b.transform ? b.transform[4] : 0;
    return xA - xB;
  });

  const lines = [];
  let currentLine = [];
  let currentY = null;

  for (const it of items) {
    const y = it.transform ? it.transform[5] : 0;
    if (currentY === null || Math.abs(currentY - y) <= 3.5) {
      currentLine.push(it);
      currentY = y;
    } else {
      currentLine.sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));
      lines.push(currentLine.map(i => i.str.trim()).join(' '));
      currentLine = [it];
      currentY = y;
    }
  }
  if (currentLine.length > 0) {
    currentLine.sort((a, b) => (a.transform ? a.transform[4] : 0) - (b.transform ? b.transform[4] : 0));
    lines.push(currentLine.map(i => i.str.trim()).join(' '));
  }
  return lines;
}

/**
 * Verarbeitet die hochgeladene Grenzland PDF-Rangliste clientseitig via pdfjsLib.
 */
async function handleGrenzlandPdfUpload(file) {
  if (!file) return;
  if (typeof pdfjsLib === 'undefined') {
    alert("Fehler: PDF-Bibliothek (pdf.js) ist nicht geladen.");
    return;
  }
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const contestType = window._resultateContestType || 'grenzland';
  if (contestType !== 'grenzland') {
    const confirmSwitch = confirm(`Du befindest dich aktuell im Modus "${contestType}". Möchtest du zum Grenzland-Cup wechseln, um diese Rangliste einzulesen?`);
    if (confirmSwitch) {
      window.switchResultateContest('grenzland');
    } else {
      return;
    }
  }

  setStatus("Lese Grenzland PDF-Rangliste...", false);

  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    const allLines = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageLines = extractLinesFromPdfTextContent(textContent);
      allLines.push(...pageLines);
    }

    if (allLines.length === 0) {
      throw new Error("Das PDF enthält keinen lesbaren Text (möglicherweise ein reiner Bildscan).");
    }

    // 1. Automatische Erkennung von Runde und Jahr
    const fullText = allLines.join("\n");
    let detectedRound = 1;
    const rndMatch = fullText.match(/runde\s*([1-3])/i) || file.name.match(/(?:runde|r)[\s_-]?([1-3])/i);
    if (rndMatch) detectedRound = parseInt(rndMatch[1], 10);

    let detectedYear = window._resultateYear || new Date().getFullYear();
    const yrMatch = fullText.match(/grenzland[- ]?cup\s*(\d{4})/i) || fullText.match(/\b(20\d{2})\b/);
    if (yrMatch) detectedYear = parseInt(yrMatch[1], 10);

    // 2. Extraktion der Muhen-Gruppen
    const parsedGroups = [];
    for (let i = 0; i < allLines.length; i++) {
      const line = allLines[i];
      if (/sportschützen\s+muhen/i.test(line) || /muhen\s+ringe\s+gesamt/i.test(line)) {
        let groupNr = '1';
        let offset = 1;

        // Prüfe ob Gruppe-Nummer in der nächsten Zeile steht
        if (i + offset < allLines.length && /gruppe\s*(\d+)/i.test(allLines[i + offset])) {
          groupNr = allLines[i + offset].match(/gruppe\s*(\d+)/i)[1];
          offset++;
        } else {
          const directGrp = line.match(/gruppe\s*(\d+)/i);
          if (directGrp) groupNr = directGrp[1];
        }

        const teamName = `Muhen ${groupNr}`;
        const shooters = [];

        // Lese bis zu 4 Schützenzeilen
        while (i + offset < allLines.length && shooters.length < 4) {
          const sLine = allLines[i + offset];
          // Zeile: Schützenname gefolgt von Punktzahl (z.B. "Jürg Luginbühl 99")
          const m = sLine.match(/^([a-zA-ZÀ-ÿ\s'\.\-]+?)\s+(\d{1,3})$/);
          if (m) {
            const rawName = m[1].trim();
            const pts = parseInt(m[2], 10);
            if (pts >= 0 && pts <= 100) {
              const matched = matchShooterWithMembers(rawName);
              const personNumber = matched ? matched.id : '';
              const memberName = matched ? `${matched.nachname} ${matched.vorname}` : rawName;
              const cleanLic = matched ? (matched.address_number || '') : '';
              const existsInRows = resultateState.rows.some(r => 
                (personNumber && String(r.id) === String(personNumber)) || 
                normalizeShooterName(r.name) === normalizeShooterName(rawName)
              );
              const shooterKey = `gz_${groupNr}_${personNumber || normalizeShooterName(rawName)}`;

              shooters.push({
                key: shooterKey,
                name: memberName,
                rawName: rawName,
                lic: cleanLic,
                points: pts,
                team: teamName,
                personNumber: personNumber,
                isMatched: Boolean(matched),
                existsInRows: existsInRows
              });
              offset++;
            } else {
              break;
            }
          } else {
            break;
          }
        }

        // Gruppentotal prüfen falls vorhanden
        let declaredTotal = null;
        if (i + offset < allLines.length && /^\d{2,3}$/.test(allLines[i + offset])) {
          declaredTotal = parseInt(allLines[i + offset], 10);
        }

        if (shooters.length > 0) {
          const sumPoints = shooters.reduce((sum, s) => sum + s.points, 0);
          parsedGroups.push({
            team: teamName,
            groupNr: groupNr,
            shooters: shooters,
            declaredTotal: declaredTotal,
            sumPoints: sumPoints,
            isConsistent: declaredTotal ? (sumPoints === declaredTotal) : true
          });
        }
      }
    }

    if (parsedGroups.length === 0) {
      throw new Error('Im PDF wurden keine Gruppen von "Sportschützen Muhen" gefunden. Bitte prüfe, ob die Datei die korrekte Rangliste ist.');
    }

    _grenzlandImportState = {
      fileName: file.name,
      year: detectedYear,
      round: detectedRound,
      groups: parsedGroups,
      selectedMap: {}
    };

    // Standardmässig alle Schützen selektieren
    parsedGroups.forEach(g => {
      g.shooters.forEach(s => {
        _grenzlandImportState.selectedMap[s.key] = true;
      });
    });

    renderGrenzlandImportModal();
    setStatus("Grenzland PDF eingelesen – Vorschau prüfen", false);

  } catch (err) {
    console.error("❌ Fehler beim Grenzland PDF-Import:", err);
    alert(`Fehler beim Einlesen der Grenzland-Rangliste:\n${err.message || err}`);
    setStatus("Fehler beim PDF-Import", true);
  }
}
window.handleGrenzlandPdfUpload = handleGrenzlandPdfUpload;

/**
 * Rendert das Vorschau-Modal für den Grenzland PDF-Import.
 */
function renderGrenzlandImportModal() {
  let modalEl = document.getElementById('modal-grenzland-import-preview');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'modal-grenzland-import-preview';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.innerHTML = `
      <div class="modal-dialog modal-xl modal-dialog-centered">
        <div class="modal-content border-0 rounded-4 shadow">
          <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
            <h5 class="modal-title fw-bold">
              <i class="fas fa-file-pdf me-2"></i>Grenzland-Cup Ranglisten-Import (PDF)
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body p-4">
            <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
              <div>
                <span class="text-muted small">Datei:</span> <strong id="gz-import-filename"></strong>
                <span class="badge bg-secondary ms-2" id="gz-import-year-badge"></span>
              </div>
              <div class="d-flex align-items-center gap-2">
                <label class="small text-muted mb-0 fw-semibold">Ziel-Runde:</label>
                <select id="gz-target-round-select" class="form-select form-select-sm" style="width: auto;" onchange="onGzTargetRoundChange(this.value)">
                  <option value="1">Runde 1</option>
                  <option value="2">Runde 2</option>
                  <option value="3">Runde 3</option>
                </select>
              </div>
            </div>

            <div class="alert alert-info py-2 px-3 small rounded-3 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
              <div>
                <i class="fas fa-info-circle me-1"></i>
                <span id="gz-import-summary-text"></span>
              </div>
              <div class="form-check mb-0">
                <input class="form-check-input" type="checkbox" id="gz-toggle-all-global" checked onchange="toggleAllGzShooters(this.checked)">
                <label class="form-check-label small fw-semibold" for="gz-toggle-all-global">Alle auswählen</label>
              </div>
            </div>

            <div id="gz-import-groups-container" class="row g-3">
            </div>
          </div>
          <div class="modal-footer border-0 p-3 bg-light rounded-bottom-4 d-flex justify-content-between">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Abbrechen</button>
            <button type="button" class="btn btn-success fw-bold px-4" onclick="applyGrenzlandImportData()">
              <i class="fas fa-check me-1"></i>Ergebnisse in Cockpit übernehmen
            </button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modalEl);
  }

  // Header Details
  document.getElementById('gz-import-filename').innerText = _grenzlandImportState.fileName;
  document.getElementById('gz-import-year-badge').innerText = `Saison ${_grenzlandImportState.year}`;
  
  const rndSel = document.getElementById('gz-target-round-select');
  if (rndSel) rndSel.value = String(_grenzlandImportState.round || 1);

  const totalShooters = _grenzlandImportState.groups.reduce((acc, g) => acc + g.shooters.length, 0);
  document.getElementById('gz-import-summary-text').innerText = 
    `Erkannt: ${_grenzlandImportState.groups.length} Gruppe(n) mit ${totalShooters} Schützen. Bitte prüfe die Zuteilungen und Rundenpunkte vor der Übernahme.`;

  // Render groups container
  const container = document.getElementById('gz-import-groups-container');
  const availableTeams = [...new Set([...(resultateState.teams || []), 'Muhen 1', 'Muhen 2', 'Muhen 3', POOL_LABEL])].sort();

  container.innerHTML = _grenzlandImportState.groups.map(g => {
    const consistencyBadge = g.isConsistent 
      ? `<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="fas fa-check me-1"></i>${g.sumPoints} / ${g.declaredTotal || g.sumPoints} Ringe</span>`
      : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="fas fa-exclamation-triangle me-1"></i>Summe ${g.sumPoints} != ${g.declaredTotal}</span>`;

    const shootersRows = g.shooters.map(s => {
      const isChecked = _grenzlandImportState.selectedMap[s.key] !== false;
      const statusBadge = s.existsInRows
        ? '<span class="badge bg-primary-subtle text-primary border border-primary-subtle">Update</span>'
        : '<span class="badge bg-success-subtle text-success border border-success-subtle">Neu</span>';

      const warningIcon = !s.isMatched
        ? `<span class="text-danger ms-1" title="Schütze nicht eindeutig in Mitgliederliste gefunden!"><i class="fas fa-exclamation-triangle"></i></span>`
        : '';

      const teamOptions = availableTeams.map(t => 
        `<option value="${escapeHtml(t)}" ${t === s.team ? 'selected' : ''}>${escapeHtml(t)}</option>`
      ).join('');

      return `
        <tr>
          <td style="width: 32px;" class="text-center">
            <input type="checkbox" class="form-check-input gz-shooter-chk" data-key="${escapeHtml(s.key)}" ${isChecked ? 'checked' : ''} onchange="toggleGzShooter('${escapeHtml(s.key)}', this.checked)">
          </td>
          <td>
            <div class="fw-bold text-dark">${escapeHtml(s.name)}${warningIcon}</div>
            <div class="small text-muted" style="font-size: 11px;">
              ${s.lic ? `Lizenz: ${escapeHtml(s.lic)} | ` : ''}ID: ${escapeHtml(s.personNumber || 'Manuell')}
            </div>
          </td>
          <td style="width: 140px;">
            <select class="form-select form-select-sm" onchange="onGzShooterTeamChange('${escapeHtml(s.key)}', this.value)">
              ${teamOptions}
            </select>
          </td>
          <td style="width: 80px;" class="text-center">
            <input type="number" min="0" max="100" class="form-control form-control-sm text-center fw-bold text-primary" value="${s.points}" onchange="onGzShooterPointsChange('${escapeHtml(s.key)}', this.value)">
          </td>
          <td style="width: 75px;" class="text-center">${statusBadge}</td>
        </tr>
      `;
    }).join('');

    return `
      <div class="col-12 col-lg-6 col-xl-4">
        <div class="card h-100 border rounded-3 shadow-sm">
          <div class="card-header bg-light py-2 px-3 d-flex justify-content-between align-items-center">
            <div class="fw-bold text-dark"><i class="fas fa-shield-alt text-primary me-1"></i>${escapeHtml(g.team)}</div>
            <div>${consistencyBadge}</div>
          </div>
          <div class="card-body p-0">
            <div class="table-responsive">
              <table class="table table-sm table-hover align-middle mb-0">
                <thead class="table-light text-muted small">
                  <tr>
                    <th></th>
                    <th>Schütze</th>
                    <th>Team</th>
                    <th class="text-center">Punkte</th>
                    <th class="text-center">Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${shootersRows}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
  modal.show();
}

function onGzTargetRoundChange(val) {
  _grenzlandImportState.round = parseInt(val, 10) || 1;
}
window.onGzTargetRoundChange = onGzTargetRoundChange;

function onGzShooterTeamChange(key, newTeam) {
  _grenzlandImportState.groups.forEach(g => {
    const s = g.shooters.find(x => x.key === key);
    if (s) s.team = newTeam;
  });
}
window.onGzShooterTeamChange = onGzShooterTeamChange;

function onGzShooterPointsChange(key, newPts) {
  const p = parseInt(newPts, 10);
  _grenzlandImportState.groups.forEach(g => {
    const s = g.shooters.find(x => x.key === key);
    if (s) s.points = isNaN(p) ? 0 : p;
  });
}
window.onGzShooterPointsChange = onGzShooterPointsChange;

function toggleGzShooter(key, checked) {
  _grenzlandImportState.selectedMap[key] = checked;
}
window.toggleGzShooter = toggleGzShooter;

function toggleAllGzShooters(checked) {
  _grenzlandImportState.groups.forEach(g => {
    g.shooters.forEach(s => {
      _grenzlandImportState.selectedMap[s.key] = checked;
    });
  });
  const inputs = document.querySelectorAll('.gz-shooter-chk');
  inputs.forEach(inp => inp.checked = checked);
}
window.toggleAllGzShooters = toggleAllGzShooters;

/**
 * Übernimmt die geprüften Schützen in resultateState.rows.
 */
function applyGrenzlandImportData() {
  const allShooters = [];
  _grenzlandImportState.groups.forEach(g => {
    g.shooters.forEach(s => allShooters.push(s));
  });

  const selected = allShooters.filter(s => _grenzlandImportState.selectedMap[s.key] !== false);
  if (selected.length === 0) {
    alert("Bitte mindestens einen Schützen für den Import auswählen.");
    return;
  }

  const rnd = _grenzlandImportState.round || 1;
  let importedCount = 0;

  selected.forEach(s => {
    let row = resultateState.rows.find(r => 
      (s.personNumber && String(r.id) === String(s.personNumber)) || 
      normalizeShooterName(r.name) === normalizeShooterName(s.name)
    );

    if (!row) {
      row = {
        id: s.personNumber || `import_gz_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        name: s.name,
        stellung: 'liegend',
        _autoR2: true,
        _autoR3: true
      };
      for (let i = 1; i <= 7; i++) {
        row[`r${i}_team`] = '';
        row[`r${i}_p1`] = '';
        if (i <= 3) row[`r${i}_p2`] = '';
      }
      resultateState.rows.push(row);
    }

    // Setze Team und Punkte für die gewählte Ziel-Runde
    row[`r${rnd}_team`] = s.team;
    row[`r${rnd}_p1`] = String(s.points);

    // Automatische Vererbung des Teams für Runde 2 und 3, falls noch leer
    if (rnd === 1) {
      if (row._autoR2 && !row.r2_team) row.r2_team = s.team;
      if (row._autoR3 && !row.r3_team) row.r3_team = s.team;
    } else if (rnd === 2) {
      if (row._autoR3 && !row.r3_team) row.r3_team = s.team;
    }

    // Falls Team neu in Teams-Liste ist
    if (s.team && !resultateState.teams.includes(s.team) && s.team !== POOL_LABEL) {
      resultateState.teams.push(s.team);
    }

    importedCount++;
  });

  resultateState.teams.sort((a,b) => a.localeCompare(b, "de", {numeric:true}));

  // State dirty setzen
  resultateState.isDirty = true;
  setStatus(`Ungespeicherte Änderungen (Grenzland Import R${rnd})`, true);
  if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState();

  // Modal schliessen
  const modalEl = document.getElementById('modal-grenzland-import-preview');
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  // UI aktualisieren
  if (typeof renderUI === 'function') renderUI();

  alert(`✅ Erfolgreich: ${importedCount} Schütze${importedCount === 1 ? '' : 'n'} für Grenzland-Cup (Runde ${rnd}) übernommen.\n\nBitte prüfe die Tabelle und klicke auf "Speichern", um die Änderungen nach Supabase zu übertragen.`);
}
window.applyGrenzlandImportData = applyGrenzlandImportData;

