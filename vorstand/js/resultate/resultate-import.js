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
