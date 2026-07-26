// === SUB-MODUL: MITGLIEDER - SSV IMPORT FRONTEND ===

let _mglImportId = null;
let _mglImportRows = [];

function mglRenderImport() {
  const container = document.getElementById('mglTabContent');
  if (!container) return;

  container.innerHTML = `
    <style>
      .import-dropzone {
        border: 2px dashed var(--border);
        border-radius: var(--radius-lg);
        background: white;
        padding: 3rem 2rem;
        text-align: center;
        transition: var(--transition);
        cursor: pointer;
      }
      .import-dropzone:hover, .import-dropzone.dragover {
        border-color: var(--primary);
        background: var(--primary-light);
      }
      .import-dropzone i {
        color: var(--primary);
        font-size: 3rem;
        margin-bottom: 1.2rem;
        transition: var(--transition);
      }
      .import-dropzone:hover i {
        transform: translateY(-4px);
      }
      .diff-row-green { background-color: #d9ead3 !important; }
      .diff-row-yellow { background-color: #fff2cc !important; }
      .diff-row-red { background-color: #f4cccc !important; }
      
      .diff-badge {
        font-size: 0.72rem;
        font-weight: 700;
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        text-transform: uppercase;
        display: inline-block;
      }
      .diff-badge.green { background: #2e7d32; color: white; }
      .diff-badge.yellow { background: #f57f17; color: white; }
      .diff-badge.red { background: #c2185b; color: white; }
      
      .table-import-preview td {
        vertical-align: middle;
      }
    </style>

    <div class="card border-0 shadow-sm p-4">
      <h4 class="text-primary mb-3" style="font-weight: 700;">
        <i class="fas fa-file-excel me-2"></i> SSV Mitglieder-Import
      </h4>
      <p class="text-muted mb-4" style="font-size: 0.9rem; max-width: 750px;">
        Lade die im VVA-Portal des SSV exportierte Excel-Datei herunter (entweder das <strong>Mitgliederverzeichnis</strong> oder die <strong>Etat-Mitgliederdaten</strong>). Unser System liest die Rohdaten im Hintergrund aus und zeigt dir alle Mutationen zur Freigabe an.
      </p>

      <div id="mglImportStep1">
        <div class="import-dropzone" id="mglDropzone" onclick="document.getElementById('mglImportFileInput').click()">
          <i class="fas fa-cloud-upload-alt"></i>
          <h5 class="fw-bold mb-1">SSV-Excel-Datei hierhin ziehen oder klicken</h5>
          <p class="text-muted small mb-0">Unterstützt .xlsx-Dateien mit einem "DataSource"-Blatt</p>
          <input type="file" id="mglImportFileInput" class="d-none" accept=".xlsx" onchange="mglHandleImportFileSelect(event)">
        </div>
      </div>

      <div id="mglImportStep2" class="d-none">
        <div class="d-flex justify-content-between align-items-center mb-3">
          <div>
            <h5 class="fw-bold mb-1 text-secondary">Vorschau der Mutationen</h5>
            <div class="small text-muted" id="mglImportStats">Lade Differenzen...</div>
          </div>
          <div class="d-flex gap-2">
            <button class="btn btn-outline-secondary btn-sm" onclick="mglCancelImport()">
              <i class="fas fa-times me-1"></i> Abbrechen
            </button>
            <button class="btn btn-success btn-sm" onclick="mglApplyImport()" id="mglBtnApplyImport">
              <i class="fas fa-check me-1"></i> Änderungen anwenden
            </button>
          </div>
        </div>

        <!-- Info-Banner zur Erklärung der Checkboxen -->
        <div class="alert alert-info py-2 px-3 mb-3 d-flex align-items-center" style="font-size: 0.85rem;">
          <i class="fas fa-info-circle me-2 text-info" style="font-size: 1.1rem;"></i>
          <div>
            <strong>Hinweis:</strong> Nur Mutationen mit einem <strong>aktivierten blauen Häkchen</strong> werden beim Klick auf <em>"Änderungen anwenden"</em> in die Google-Datenbank übernommen. Nicht ausgewählte Mutationen werden verworfen.
          </div>
        </div>

        <div class="table-responsive rounded-3 border">
          <table class="table table-hover table-import-preview mb-0">
            <thead class="table-dark">
              <tr>
                <th width="40" class="text-center">
                  <input type="checkbox" id="mglSelectAllDiffs" checked onchange="mglToggleSelectAllDiffs(this)">
                </th>
                <th>Mitglied</th>
                <th>Bereich</th>
                <th>Feld</th>
                <th>Alter Wert</th>
                <th>Neuer Wert</th>
                <th>Mutationstyp</th>
              </tr>
            </thead>
            <tbody id="mglImportDiffBody"></tbody>
          </table>
        </div>
      </div>

      <div id="mglImportLoading" class="d-none text-center py-5">
        <div class="spinner-border text-primary" style="width: 3rem; height: 3rem;" role="status"></div>
        <h5 class="fw-bold mt-3 text-primary" id="mglImportLoadingText">Verarbeite Datei...</h5>
      </div>
    </div>
  `;

  // Drag and drop listeners
  const dropzone = document.getElementById('mglDropzone');
  if (dropzone) {
    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });
    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });
    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        mglProcessImportFile(files[0]);
      }
    });
  }
}

function mglCancelImport() {
  _mglImportId = null;
  _mglImportRows = [];
  mglRenderImport();
}

function mglHandleImportFileSelect(e) {
  const file = e.target.files[0];
  if (file) {
    mglProcessImportFile(file);
  }
}

function mglProcessImportFile(file) {
  const loading = document.getElementById('mglImportLoading');
  const step1 = document.getElementById('mglImportStep1');
  const loadingText = document.getElementById('mglImportLoadingText');

  step1.classList.add('d-none');
  loading.classList.remove('d-none');
  loadingText.textContent = "Lese Excel-Datei im Browser...";

  const reader = new FileReader();
  reader.onload = async function(e) {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });

      // Finde DataSource Sheet
      const dsSheetName = workbook.SheetNames.find(name => name.toLowerCase().trim() === 'datasource');
      if (!dsSheetName) {
        throw new Error('Es konnte kein Blatt namens "DataSource" in der Excel-Datei gefunden werden. Bitte lade die originale Export-Datei aus dem VVA-Portal herunter.');
      }

      loadingText.textContent = "Berechne Differenzen in der Google-Datenbank...";
      const worksheet = workbook.Sheets[dsSheetName];
      const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      const payload = {
        action: 'calculateSSVDiff',
        rows: rawRows
      };

      const res = await apiFetch('mitglieder', payload, 'POST');
      const resData = await res.json();

      if (!resData.success) {
        throw new Error(resData.error || 'Fehler beim Berechnen des Imports auf dem Server.');
      }

      _mglImportId = resData.importId;
      _mglImportRows = resData.diffRows;

      mglDisplayDiffs();
    } catch(err) {
      alert("Fehler beim Importieren: " + err.message);
      mglCancelImport();
    }
  };
  reader.readAsArrayBuffer(file);
}

function mglDisplayDiffs() {
  const loading = document.getElementById('mglImportLoading');
  const step2 = document.getElementById('mglImportStep2');
  const diffBody = document.getElementById('mglImportDiffBody');
  const statsEl = document.getElementById('mglImportStats');

  loading.classList.add('d-none');
  step2.classList.remove('d-none');

  if (!_mglImportRows || _mglImportRows.length === 0) {
    diffBody.innerHTML = `
      <tr>
        <td colspan="7" class="text-center py-4 text-success fw-bold">
          <i class="fas fa-check-circle me-1"></i> Keine Mutationen gefunden! Deine Datenbank ist bereits 100% synchron mit dem SSV.
        </td>
      </tr>
    `;
    statsEl.textContent = '0 Mutationen gefunden.';
    document.getElementById('mglBtnApplyImport').disabled = true;
    return;
  }

  document.getElementById('mglBtnApplyImport').disabled = false;
  statsEl.textContent = `${_mglImportRows.length} Mutationen identifiziert.`;

  diffBody.innerHTML = _mglImportRows.map((row, idx) => {
    // Row layout: [importId, pn, name, sheet, feld, alt, neu, differenztyp, entscheid, bearbeitetam]
    const pn = row[1];
    const name = row[2];
    const sheet = row[3];
    const feld = row[4];
    const alt = row[5];
    const neu = row[6];
    const type = row[7];
    const defaultChecked = row[8] === 'Update' ? 'checked' : '';

    // Translation maps
    const sheetTrans = {
      'members': 'Mitglied',
      'memberlicenses': 'Lizenz',
      'memberfunctions': 'Funktion',
      'membertraining': 'Training'
    };

    const typeLabels = {
      'NEU': { label: 'Neues Mitglied', class: 'green' },
      'LIZENZNEU': { label: 'Lizenz Neu', class: 'green' },
      'FUNKTIONNEU': { label: 'Funktion Neu', class: 'green' },
      'TRAININGNEU': { label: 'Training Neu', class: 'green' },
      
      'AENDERUNG': { label: 'Änderung', class: 'yellow' },
      'LIZENZAENDERUNG': { label: 'Lizenz Update', class: 'yellow' },
      'LIZENZDATUMSKORREKTUR': { label: 'Datumskorrektur', class: 'yellow' },
      'FUNKTIONAENDERUNG': { label: 'Funktion Update', class: 'yellow' },
      
      'ABGANG': { label: 'Austritt', class: 'red' },
      'LIZENZWEG': { label: 'Lizenz Ende', class: 'red' },
      'FUNKTIONWEG': { label: 'Funktion Ende', class: 'red' }
    };

    const displayType = typeLabels[type] || { label: type, class: 'yellow' };

    let rowClass = 'diff-row-yellow';
    if (displayType.class === 'green') rowClass = 'diff-row-green';
    if (displayType.class === 'red') rowClass = 'diff-row-red';

    // Format display values nicely
    let altDisplay = alt;
    let neuDisplay = neu;

    if (feld === 'EntryDate' || feld === 'LicenseType|LicenseCategory' || feld === 'MembershipCategory') {
      altDisplay = String(alt).replace('|', ' (ab ') + (String(alt).includes('|') ? ')' : '');
      neuDisplay = String(neu).replace('|', ' (ab ') + (String(neu).includes('|') ? ')' : '');
    }

    return `
      <tr class="${rowClass}">
        <td class="text-center">
          <input type="checkbox" class="mgl-diff-checkbox" data-idx="${idx}" ${defaultChecked} onchange="mglUpdateDiffDecision(${idx}, this.checked)">
        </td>
        <td>
          <div class="fw-bold">${name}</div>
          <div class="small text-muted">PN: ${pn}</div>
        </td>
        <td class="fw-medium">${sheetTrans[sheet] || sheet}</td>
        <td class="small text-muted font-monospace">${feld}</td>
        <td class="text-muted" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${altDisplay || '—'}</td>
        <td class="fw-bold" style="max-width: 180px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${neuDisplay || '—'}</td>
        <td>
          <span class="diff-badge ${displayType.class}">${displayType.label}</span>
        </td>
      </tr>
    `;
  }).join('');
}

function mglUpdateDiffDecision(idx, checked) {
  if (_mglImportRows[idx]) {
    _mglImportRows[idx][8] = checked ? 'Update' : 'Verworfen';
  }
}

function mglToggleSelectAllDiffs(el) {
  const checkboxes = document.querySelectorAll('.mgl-diff-checkbox');
  checkboxes.forEach(cb => {
    cb.checked = el.checked;
    const idx = parseInt(cb.getAttribute('data-idx'));
    mglUpdateDiffDecision(idx, el.checked);
  });
}

async function mglApplyImport() {
  if (!_mglImportId || !_mglImportRows || _mglImportRows.length === 0) return;

  const btn = document.getElementById('mglBtnApplyImport');
  const step2 = document.getElementById('mglImportStep2');
  const loading = document.getElementById('mglImportLoading');
  const loadingText = document.getElementById('mglImportLoadingText');

  btn.disabled = true;
  step2.classList.add('d-none');
  loading.classList.remove('d-none');
  loadingText.textContent = "Wende freigegebene Mutationen an. Bitte warten...";

  try {
    const payload = {
      action: 'applySSVDiff',
      importId: _mglImportId,
      diffRows: _mglImportRows
    };

    const res = await apiFetch('mitglieder', payload, 'POST');
    const data = await res.json();

    if (!data.success) {
      throw new Error(data.error || 'Fehler beim Anwenden des Imports auf dem Server.');
    }

    const stats = data.stats;
    alert(`✅ Import erfolgreich abgeschlossen!\n\nMutiert/Korrgiert: ${stats.updated}\nNeu angelegt: ${stats.created}\nÜbersprungen: ${stats.skipped}`);

    // Zurücksetzen und Mitgliederliste neu laden
    _mglImportId = null;
    _mglImportRows = [];
    _mglActiveTab = 'liste';
    
    // Mitglieder neu laden
    await loadMitgliederData(true);
  } catch(err) {
    alert("Fehler beim Abschliessen des Imports: " + err.message);
    // Zurück zur Vorschau
    loading.classList.add('d-none');
    step2.classList.remove('d-none');
    btn.disabled = false;
  }
}
