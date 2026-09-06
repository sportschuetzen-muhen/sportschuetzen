// === SUB-MODUL: MITGLIEDER - EXCEL & CSV EXPORT ===

let _mglExportSelectedPreset = 'verband';
let _mglExportSelectedScope = 'filtered';

/**
 * Hilfsfunktion: Gibt den lesbaren Status eines Mitglieds zurück
 */
function mglGetStatusText(m) {
  const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
  const isEhren = m._istEhren || m.IsHonoraryMember == 1 || m.IsHonoraryMember === true;
  const isPassiv = m._istPassiv || m.IsPassive == 1 || m.IsPassive === true;
  const isAktiv = m.IsActive == 1 || m.IsActive === true || m.IsActive === '1';
  const hatAktLiz = Number(m._aktiveLizenzenCount || 0) > 0;

  if (isDeceased) return 'Verstorben';
  if (isEhren) return 'Ehrenmitglied';
  if (isPassiv) return 'Passiv';
  if (isAktiv && hatAktLiz) return 'Aktiv mit Lizenz';
  if (isAktiv && !hatAktLiz) return 'Aktiv ohne Lizenz';
  return 'Inaktiv';
}

/**
 * Hilfsfunktion: Formatiert alle aktiven Lizenzen als lesbare Zeichenkette
 */
function mglFormatLizenzenText(personNumber) {
  const pnKey = String(personNumber || '').trim();
  const list = window._mglLizenzenCache?.[pnKey] || [];
  const active = list.filter(l => (l.IsActive == 1 || l.IsActive === true || l.IsActive === '1') && !l.ExitDate);
  if (!active.length) return '';
  return active.map(l => {
    let cat = l.MembershipCategory || l.LicenseType || '';
    if (l.LicenseCategory && !cat.includes(l.LicenseCategory)) {
      cat += ` (${l.LicenseCategory})`;
    }
    return cat;
  }).join(', ');
}

/**
 * Hilfsfunktion: Formatiert alle aktiven Funktionen als lesbare Zeichenkette
 */
function mglFormatFunktionenText(personNumber) {
  const pnKey = String(personNumber || '').trim();
  const list = window._mglFunktionenCache?.[pnKey] || [];
  const active = list.filter(f => (f.IsActive == 1 || f.IsActive === true || f.IsActive === '1') && !f.ExitDate && !f.OfficialFunctionExitDate);
  if (!active.length) return '';
  return active.map(f => f.OfficialFunctionCategory || f.FunctionType || f.FunctionName || f.OfficialFunctionRemark || '').filter(Boolean).join(', ');
}

/**
 * Öffnet das Export-Modal und berechnet dynamisch die verfügbaren Datensätze
 */
function mglOpenExportModal() {
  const countFiltered = (_mglFiltered && _mglFiltered.length > 0) ? _mglFiltered.length : (_mglData || []).length;
  const activeMembers = (_mglData || []).filter(m => {
    const isAktiv = m.IsActive == 1 || m.IsActive === true || m.IsActive === '1';
    const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
    return isAktiv && !isDeceased;
  });
  const countActive = activeMembers.length;
  const countTotal = (_mglData || []).length;

  // Filter-Hinweistext ermitteln
  let filterHint = '';
  if (window._mglFilterType && window._mglFilterType !== 'alle') {
    filterHint = ` (Filter: ${window._mglFilterType})`;
  }
  const searchVal = document.getElementById('mglSearch')?.value?.trim();
  if (searchVal) {
    filterHint += ` (Suche: "${searchVal}")`;
  }

  let modalEl = document.getElementById('mglModalExport');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'mglModalExport';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }

  const todayIso = new Date().toISOString().split('T')[0];

  modalEl.innerHTML = `
    <div class="modal-dialog modal-lg modal-dialog-centered">
      <div class="modal-content border-0 shadow-lg" style="border-radius: 14px; overflow: hidden;">
        
        <!-- Header -->
        <div class="modal-header bg-success text-white py-3 px-4">
          <h5 class="modal-title fw-bold mb-0 d-flex align-items-center">
            <i class="fas fa-file-excel fs-4 me-2"></i> Mitglieder-Export (Excel / CSV)
          </h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
        </div>

        <!-- Body -->
        <div class="modal-body p-4" style="background: #fafbfc;">

          <!-- SCHRITT 1: DATENAUSWAHL (SCOPE) -->
          <div class="mb-4">
            <label class="form-label fw-bold text-secondary small text-uppercase mb-2">
              <i class="fas fa-filter me-1 text-success"></i> 1. Datenauswahl (Wer soll exportiert werden?)
            </label>
            <div class="bg-white border rounded-3 p-3 shadow-sm">
              <div class="form-check mb-2">
                <input class="form-check-input" type="radio" name="mglExportScope" id="scopeFiltered" value="filtered" ${countFiltered > 0 ? 'checked' : ''} onchange="mglOnExportScopeChange()">
                <label class="form-check-label fw-bold" for="scopeFiltered">
                  Aktuelle Ansicht / Filter
                  <span class="badge bg-success ms-2">${countFiltered} Mitglieder</span>
                  <span class="text-muted small fw-normal ms-1">${filterHint}</span>
                </label>
              </div>

              <div class="form-check mb-2">
                <input class="form-check-input" type="radio" name="mglExportScope" id="scopeActive" value="active" ${countFiltered === 0 ? 'checked' : ''} onchange="mglOnExportScopeChange()">
                <label class="form-check-label" for="scopeActive">
                  Alle aktiven Mitglieder (ohne Austritte & Passiv)
                  <span class="badge bg-primary ms-2">${countActive} Mitglieder</span>
                </label>
              </div>

              <div class="form-check mb-0">
                <input class="form-check-input" type="radio" name="mglExportScope" id="scopeAll" value="all" onchange="mglOnExportScopeChange()">
                <label class="form-check-label" for="scopeAll">
                  Gesamter Datenbestand (inkl. Passiv, Ehren & Ehemalige)
                  <span class="badge bg-secondary ms-2">${countTotal} Mitglieder</span>
                </label>
              </div>
            </div>
          </div>

          <!-- SCHRITT 2: PRESET-AUSWAHL -->
          <div class="mb-4">
            <label class="form-label fw-bold text-secondary small text-uppercase mb-2">
              <i class="fas fa-layer-group me-1 text-success"></i> 2. Vorlage / Spalten-Profil wählen
            </label>

            <div class="row g-2">
              <!-- Preset 1: Verband & Schiesswesen -->
              <div class="col-md-6">
                <div class="p-3 border rounded-3 bg-white h-100 cursor-pointer mgl-preset-card ${_mglExportSelectedPreset === 'verband' ? 'border-success bg-light' : ''}" 
                     id="mglPresetCard_verband" onclick="mglSelectExportPreset('verband')" style="transition: all 0.2s ease;">
                  <div class="d-flex align-items-center mb-1">
                    <div class="rounded-circle bg-success-subtle text-success p-2 me-2 d-flex align-items-center justify-content-center" style="width:34px; height:34px;">
                      <i class="fas fa-crosshairs"></i>
                    </div>
                    <span class="fw-bold text-dark">Verband & Schiesswesen</span>
                  </div>
                  <div class="text-muted small ps-1">
                    Lizenz-Nr., Name, Vorname, Geburtsdatum, Jahrgang, Alterskategorie, Lizenzen (G50m/G10m), Wohnort.
                  </div>
                </div>
              </div>

              <!-- Preset 2: Post & Adressliste -->
              <div class="col-md-6">
                <div class="p-3 border rounded-3 bg-white h-100 cursor-pointer mgl-preset-card ${_mglExportSelectedPreset === 'adressen' ? 'border-success bg-light' : ''}" 
                     id="mglPresetCard_adressen" onclick="mglSelectExportPreset('adressen')" style="transition: all 0.2s ease;">
                  <div class="d-flex align-items-center mb-1">
                    <div class="rounded-circle bg-primary-subtle text-primary p-2 me-2 d-flex align-items-center justify-content-center" style="width:34px; height:34px;">
                      <i class="fas fa-envelope"></i>
                    </div>
                    <span class="fw-bold text-dark">Post- & Adressliste</span>
                  </div>
                  <div class="text-muted small ps-1">
                    Mitglied-Nr., Anrede, Name, Vorname, Adresse, PLZ, Ort, Land, E-Mail, Rechnungsversand.
                  </div>
                </div>
              </div>

              <!-- Preset 3: Telefon & Kontakte -->
              <div class="col-md-6">
                <div class="p-3 border rounded-3 bg-white h-100 cursor-pointer mgl-preset-card ${_mglExportSelectedPreset === 'kontakte' ? 'border-success bg-light' : ''}" 
                     id="mglPresetCard_kontakte" onclick="mglSelectExportPreset('kontakte')" style="transition: all 0.2s ease;">
                  <div class="d-flex align-items-center mb-1">
                    <div class="rounded-circle bg-info-subtle text-info p-2 me-2 d-flex align-items-center justify-content-center" style="width:34px; height:34px;">
                      <i class="fas fa-phone-alt"></i>
                    </div>
                    <span class="fw-bold text-dark">Telefon- & Kontaktliste</span>
                  </div>
                  <div class="text-muted small ps-1">
                    Name, Vorname, Mobile, Festnetz, E-Mail, Wohnort, Vereinsfunktionen.
                  </div>
                </div>
              </div>

              <!-- Preset 4: Finanzen & Kassier -->
              <div class="col-md-6">
                <div class="p-3 border rounded-3 bg-white h-100 cursor-pointer mgl-preset-card ${_mglExportSelectedPreset === 'finanzen' ? 'border-success bg-light' : ''}" 
                     id="mglPresetCard_finanzen" onclick="mglSelectExportPreset('finanzen')" style="transition: all 0.2s ease;">
                  <div class="d-flex align-items-center mb-1">
                    <div class="rounded-circle bg-warning-subtle text-warning p-2 me-2 d-flex align-items-center justify-content-center" style="width:34px; height:34px;">
                      <i class="fas fa-file-invoice-dollar"></i>
                    </div>
                    <span class="fw-bold text-dark">Finanzen & Kassier</span>
                  </div>
                  <div class="text-muted small ps-1">
                    Mitglied-Nr., Lizenz-Nr., Name, Status, IBAN, BIC, Kontoinhaber, Nie mahnen.
                  </div>
                </div>
              </div>

              <!-- Preset 5: Komplettabzug -->
              <div class="col-12">
                <div class="p-3 border rounded-3 bg-white cursor-pointer mgl-preset-card ${_mglExportSelectedPreset === 'komplett' ? 'border-success bg-light' : ''}" 
                     id="mglPresetCard_komplett" onclick="mglSelectExportPreset('komplett')" style="transition: all 0.2s ease;">
                  <div class="d-flex align-items-center mb-1">
                    <div class="rounded-circle bg-dark-subtle text-dark p-2 me-2 d-flex align-items-center justify-content-center" style="width:34px; height:34px;">
                      <i class="fas fa-database"></i>
                    </div>
                    <span class="fw-bold text-dark">Vollständiger Datenabzug (Alle Felder)</span>
                  </div>
                  <div class="text-muted small ps-1">
                    Enthält sämtliche Stammdaten, Adressen, Bankdaten, Eintritts-/Austrittsdaten, Lizenzen und Vorstandsposten.
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- SCHRITT 3: FORMAT & DATEINAME -->
          <div>
            <label class="form-label fw-bold text-secondary small text-uppercase mb-2">
              <i class="fas fa-cog me-1 text-success"></i> 3. Format & Dateiname
            </label>
            <div class="row g-3 align-items-center bg-white border rounded-3 p-3 shadow-sm">
              <div class="col-md-5">
                <label class="form-label small text-muted mb-1">Dateiformat:</label>
                <div class="d-flex gap-3">
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="mglExportFormat" id="fmtXlsx" value="xlsx" checked onchange="mglUpdateExportFilenamePreview()">
                    <label class="form-check-label fw-bold" for="fmtXlsx">
                      <i class="fas fa-file-excel text-success me-1"></i> Excel (.xlsx)
                    </label>
                  </div>
                  <div class="form-check">
                    <input class="form-check-input" type="radio" name="mglExportFormat" id="fmtCsv" value="csv" onchange="mglUpdateExportFilenamePreview()">
                    <label class="form-check-label" for="fmtCsv">
                      <i class="fas fa-file-csv text-primary me-1"></i> CSV (.csv)
                    </label>
                  </div>
                </div>
              </div>
              <div class="col-md-7">
                <label class="form-label small text-muted mb-1">Zieldateiname:</label>
                <input type="text" class="form-control form-control-sm font-monospace" id="mglExportFilename" value="Sportschuetzen_Muhen_Mitglieder_Verband_${todayIso}.xlsx">
              </div>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="modal-footer bg-light py-2.5 px-4 d-flex justify-content-between">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">
            Abbrechen
          </button>
          <button type="button" class="btn btn-success fw-bold px-4" id="mglBtnRunExport" onclick="mglExecuteExport()">
            <i class="fas fa-download me-1"></i> Jetzt herunterladen
          </button>
        </div>

      </div>
    </div>
  `;

  mglUpdateExportFilenamePreview();

  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();
}

/**
 * Umschalten des ausgewählten Export-Presets
 */
function mglSelectExportPreset(presetKey) {
  _mglExportSelectedPreset = presetKey;
  document.querySelectorAll('.mgl-preset-card').forEach(card => {
    card.classList.remove('border-success', 'bg-light');
  });
  const activeCard = document.getElementById(`mglPresetCard_${presetKey}`);
  if (activeCard) {
    activeCard.classList.add('border-success', 'bg-light');
  }
  mglUpdateExportFilenamePreview();
}

/**
 * Scope-Wechsel EventHandler
 */
function mglOnExportScopeChange() {
  const scopeEl = document.querySelector('input[name="mglExportScope"]:checked');
  _mglExportSelectedScope = scopeEl ? scopeEl.value : 'filtered';
  mglUpdateExportFilenamePreview();
}

/**
 * Aktualisiert die Dateinamensanzeige im Modal
 */
function mglUpdateExportFilenamePreview() {
  const filenameInput = document.getElementById('mglExportFilename');
  if (!filenameInput) return;

  const format = document.querySelector('input[name="mglExportFormat"]:checked')?.value || 'xlsx';
  const todayIso = new Date().toISOString().split('T')[0];

  const presetLabels = {
    'verband': 'Verband_Schiessen',
    'adressen': 'Adressliste',
    'kontakte': 'Kontakte',
    'finanzen': 'Finanzen_Kassier',
    'komplett': 'Mitglieder_Komplett'
  };

  const label = presetLabels[_mglExportSelectedPreset] || 'Export';
  filenameInput.value = `Sportschuetzen_Muhen_${label}_${todayIso}.${format}`;
}

/**
 * Führt die Datentransformation und den Datei-Download aus
 */
function mglExecuteExport() {
  const scope = document.querySelector('input[name="mglExportScope"]:checked')?.value || 'filtered';
  const format = document.querySelector('input[name="mglExportFormat"]:checked')?.value || 'xlsx';
  let filename = document.getElementById('mglExportFilename')?.value?.trim();

  if (!filename) {
    filename = `Mitglieder_Export_${new Date().toISOString().split('T')[0]}.${format}`;
  }

  // 1. Datenbasis nach Scope filtern
  let sourceList = [];
  if (scope === 'filtered') {
    sourceList = (_mglFiltered && _mglFiltered.length > 0) ? _mglFiltered : (_mglData || []);
  } else if (scope === 'active') {
    sourceList = (_mglData || []).filter(m => {
      const isAktiv = m.IsActive == 1 || m.IsActive === true || m.IsActive === '1';
      const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
      return isAktiv && !isDeceased;
    });
  } else {
    sourceList = _mglData || [];
  }

  if (!sourceList.length) {
    alert('Es wurden keine Datensätze für diesen Export gefunden.');
    return;
  }

  // 2. Zeilen je nach gewähltem Preset aufbereiten
  const exportRows = sourceList.map(m => mglBuildPresetRow(m, _mglExportSelectedPreset));

  try {
    if (typeof XLSX === 'undefined') {
      throw new Error('SheetJS (XLSX) Bibliothek ist nicht geladen.');
    }

    // 3. Sheet erstellen
    const ws = XLSX.utils.json_to_sheet(exportRows);

    // Automatische Spaltenbreiten berechnen
    if (exportRows.length > 0) {
      const keys = Object.keys(exportRows[0]);
      const colWidths = keys.map(key => {
        let maxLen = key.length;
        for (let i = 0; i < Math.min(exportRows.length, 100); i++) {
          const valStr = String(exportRows[i][key] || '');
          if (valStr.length > maxLen) maxLen = valStr.length;
        }
        return { wch: Math.min(Math.max(maxLen + 3, 10), 45) };
      });
      ws['!cols'] = colWidths;
    }

    // 4. Download durchführen
    if (format === 'csv') {
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      // UTF-8 BOM hinzufügen, damit Excel Umlaute korrekt darstellt
      const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Mitglieder");
      XLSX.writeFile(wb, filename);
    }

    // Modal schliessen
    const modalEl = document.getElementById('mglModalExport');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    }

    // Erfolgsmeldung
    if (typeof showSuccess === 'function') {
      showSuccess(`Export erfolgreich heruntergeladen (${exportRows.length} Zeilen)`);
    } else {
      alert(`✅ Export erfolgreich erstellt!\n\nDatei: ${filename}\nAnzahl: ${exportRows.length} Zeilen`);
    }
  } catch (err) {
    console.error('❌ Fehler beim Excel-Export:', err);
    alert('Fehler beim Erstellen der Export-Datei: ' + err.message);
  }
}

/**
 * Mappt ein einzelnes Mitgliedsobjekt in die Spaltenstruktur des gewählten Presets
 */
function mglBuildPresetRow(m, preset) {
  const addrNum = String(m.AddressNumber || '').padStart(6, '0');
  const personNum = m.PersonNumber || '';
  const birthDateFmt = mglFmtDate(m.BirthDate);
  const birthYear = m.BirthDate ? new Date(m.BirthDate).getFullYear() : '';
  const statusStr = mglGetStatusText(m);
  const lizenzenStr = mglFormatLizenzenText(personNum);
  const funktionenStr = mglFormatFunktionenText(personNum);

  // Geschlecht formatieren
  let genderFmt = m.Gender || '';
  if (genderFmt === 'M' || genderFmt === 'Male') genderFmt = 'Männlich';
  if (genderFmt === 'F' || genderFmt === 'Female') genderFmt = 'Weiblich';

  switch (preset) {
    case 'verband':
      return {
        'Lizenz-Nr.': personNum,
        'Mitglied-Nr.': addrNum,
        'Nachname': m.LastName || '',
        'Vorname': m.FirstName || '',
        'Jahrgang': birthYear,
        'Geburtsdatum': birthDateFmt,
        'Geschlecht': genderFmt,
        'Kategorie': m._kategorie || '',
        'Lizenzen': lizenzenStr,
        'PLZ': m.PostCode || '',
        'Wohnort': m.City || '',
        'E-Mail': m.PrimaryEmail || '',
        'Status': statusStr
      };

    case 'adressen':
      return {
        'Mitglied-Nr.': addrNum,
        'Anrede': m.Salutation || '',
        'Nachname': m.LastName || '',
        'Vorname': m.FirstName || '',
        'Zusatz / Firma': m.Addition || m.Company || '',
        'Strasse': m.Street || '',
        'PLZ': m.PostCode || '',
        'Ort': m.City || '',
        'Land': m.Country || 'CH',
        'E-Mail': m.PrimaryEmail || '',
        'Telefon Mobile': m.PrivateMobilePhone || m.BusinessMobilePhone || '',
        'Rechnungsversand': m.Rechnungsversand || 'E-Mail',
        'Status': statusStr
      };

    case 'kontakte':
      return {
        'Nachname': m.LastName || '',
        'Vorname': m.FirstName || '',
        'Mobiltelefon': m.PrivateMobilePhone || m.BusinessMobilePhone || '',
        'Festnetz': m.PrivateLandlinePhone || m.BusinessLandlinePhone || '',
        'E-Mail': m.PrimaryEmail || '',
        'Zusatz-E-Mail': m.AdditionalEmail || '',
        'PLZ': m.PostCode || '',
        'Wohnort': m.City || '',
        'Vereinsfunktionen': funktionenStr,
        'Status': statusStr
      };

    case 'finanzen':
      return {
        'Mitglied-Nr.': addrNum,
        'Lizenz-Nr.': personNum,
        'Nachname': m.LastName || '',
        'Vorname': m.FirstName || '',
        'Status': statusStr,
        'Kategorie': m._kategorie || '',
        'Rechnungsversand': m.Rechnungsversand || 'E-Mail',
        'IBAN': m.IBAN || '',
        'BIC': m.BIC || '',
        'Kontoinhaber': m.Kontoinhaber || '',
        'Nie mahnen': (m.Niemahnen == 1 || m.Niemahnen === true || m.Niemahnen === '1') ? 'Ja' : 'Nein'
      };

    case 'komplett':
    default:
      return {
        'Mitglied-Nr.': addrNum,
        'Lizenz-Nr.': personNum,
        'Anrede': m.Salutation || '',
        'Nachname': m.LastName || '',
        'Vorname': m.FirstName || '',
        'Zusatz': m.Addition || m.Company || '',
        'Strasse': m.Street || '',
        'PLZ': m.PostCode || '',
        'Ort': m.City || '',
        'Land': m.Country || 'CH',
        'Geburtsdatum': birthDateFmt,
        'Jahrgang': birthYear,
        'Geschlecht': genderFmt,
        'Alterskategorie': m._kategorie || '',
        'Status': statusStr,
        'E-Mail': m.PrimaryEmail || '',
        'Zusatz-E-Mail': m.AdditionalEmail || '',
        'Mobiltelefon': m.PrivateMobilePhone || m.BusinessMobilePhone || '',
        'Festnetz': m.PrivateLandlinePhone || m.BusinessLandlinePhone || '',
        'Lizenzen': lizenzenStr,
        'Funktionen': funktionenStr,
        'Vereinseintritt': mglFmtDate(m.ClubEntryDate || m.EntryDate),
        'Vereinsaustritt': mglFmtDate(m.Vereinsaustritt || m.ExitDate),
        'Foto-Freigabe': m.FotoFreigabe || 'Ja',
        'Rechnungsversand': m.Rechnungsversand || 'E-Mail',
        'IBAN': m.IBAN || '',
        'BIC': m.BIC || '',
        'Kontoinhaber': m.Kontoinhaber || '',
        'Nie mahnen': (m.Niemahnen == 1 || m.Niemahnen === true || m.Niemahnen === '1') ? 'Ja' : 'Nein',
        'Bemerkung': m.Remark || ''
      };
  }
}
