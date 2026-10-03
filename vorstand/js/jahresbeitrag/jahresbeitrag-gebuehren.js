// vorstand/js/jahresbeitrag/jahresbeitrag-gebuehren.js
// ============================================================
// GEBÜHREN-KONFIGURATION (MEMBERS100) - MANAGEMENT IM FRONTEND
// ============================================================

let _jbGebuehrenSearch = '';
let _jbGebuehrenKategorieFilter = '';
let _jbGebuehrenGruppeFilter = '';
let _jbGebSortCol = 'sort';
let _jbGebSortAsc = true;

function renderGebuehrenConfigTab() {
  return `
    <div class="card border-0 shadow-sm p-4 bg-white rounded-3">
      
      <!-- Kopfbereich -->
      <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 pb-3 mb-3 border-bottom">
        <div>
          <h4 class="mb-1 text-primary fw-bold">
            <i class="fas fa-sliders-h me-2"></i>Gebühren-Konfiguration
          </h4>
          <p class="text-muted small mb-0">
            Verwalten Sie alle Tarife, Wettkampfgebühren und UI-Darstellungstypen (Members100 <code>gebuehrenconfig</code>).
          </p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-secondary" onclick="jbReloadGebuehrenData()">
            <i class="fas fa-sync-alt me-1"></i> Neu laden
          </button>
          <button class="btn btn-sm btn-success fw-bold shadow-sm" onclick="jbOpenEditGebuehrModal('')">
            <i class="fas fa-plus me-1"></i> Neue Gebühr anlegen
          </button>
        </div>
      </div>

      <!-- Filterleiste -->
      <div class="row g-2 mb-3 align-items-center">
        <div class="col-md-4">
          <div class="input-group input-group-sm">
            <span class="input-group-text bg-light"><i class="fas fa-search"></i></span>
            <input type="text" class="form-control" id="jbGebuehrSearch" placeholder="Suche nach Key, Bezeichnung, Konto..." oninput="jbFilterGebuehrenTable()">
          </div>
        </div>
        <div class="col-md-3">
          <select class="form-select form-select-sm" id="jbGebuehrKatFilter" onchange="jbFilterGebuehrenTable()">
            <option value="">Alle Kategorien (Kategorie)</option>
          </select>
        </div>
        <div class="col-md-3">
          <select class="form-select form-select-sm" id="jbGebuehrGruppeFilter" onchange="jbFilterGebuehrenTable()">
            <option value="">Alle UI-Gruppen (ui_gruppe)</option>
          </select>
        </div>
        <div class="col-md-2" id="jbGebuehrenColToggleContainer">
          <!-- TableKit Spaltenauswahl Dropdown -->
        </div>
        <div class="col-md-2 text-end text-muted small ms-auto" id="jbGebuehrenCount">
          <!-- Anzahl -->
        </div>
      </div>

      <!-- Tabelle (Globales TableKit Modell mit Spaltensortierung) -->
      <div class="table-responsive border rounded-3 overflow-hidden shadow-sm">
        <table class="table table-hover table-sm align-middle mb-0" id="jbGebuehrenTable">
          <thead class="table-light small text-muted text-uppercase" style="font-size: 11px;">
            <tr>
              <th data-col-id="key" data-col-name="Key" data-sort-key="key" onclick="jbSortGebuehren('key')" class="tk-sortable" style="cursor: pointer; user-select: none; width: 85px;">Key <span class="tk-sort-ind">${_jbGebSortCol === 'key' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="kategorie" data-col-name="Kategorie" data-sort-key="kategorie" onclick="jbSortGebuehren('kategorie')" class="tk-sortable" style="cursor: pointer; user-select: none; width: 110px;">Kategorie <span class="tk-sort-ind">${_jbGebSortCol === 'kategorie' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="zielgruppe" data-col-name="Zielgruppe" data-sort-key="zielgruppe" onclick="jbSortGebuehren('zielgruppe')" class="tk-sortable" style="cursor: pointer; user-select: none; width: 100px;">Zielgruppe <span class="tk-sort-ind">${_jbGebSortCol === 'zielgruppe' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="bezeichnung" data-col-name="Bezeichnung Frontend" data-sort-key="bezeichnung" onclick="jbSortGebuehren('bezeichnung')" class="tk-sortable" style="cursor: pointer; user-select: none;">Bezeichnung Frontend <span class="tk-sort-ind">${_jbGebSortCol === 'bezeichnung' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="betrag" data-col-name="Betrag" data-sort-key="betrag" onclick="jbSortGebuehren('betrag')" class="tk-sortable text-end" style="cursor: pointer; user-select: none; width: 95px;">Betrag <span class="tk-sort-ind">${_jbGebSortCol === 'betrag' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="konto" data-col-name="Haben-Konto" data-sort-key="konto" onclick="jbSortGebuehren('konto')" class="tk-sortable" style="cursor: pointer; user-select: none; width: 110px;">Haben-Konto <span class="tk-sort-ind">${_jbGebSortCol === 'konto' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="ui_gruppe" data-col-name="UI-Gruppe" data-sort-key="ui_gruppe" onclick="jbSortGebuehren('ui_gruppe')" class="tk-sortable" style="cursor: pointer; user-select: none;">UI-Gruppe <span class="tk-sort-ind">${_jbGebSortCol === 'ui_gruppe' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="ui_feld" data-col-name="UI-Feld" data-sort-key="ui_feld" onclick="jbSortGebuehren('ui_feld')" class="tk-sortable" style="cursor: pointer; user-select: none;">UI-Feld <span class="tk-sort-ind">${_jbGebSortCol === 'ui_feld' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="ui_typ" data-col-name="UI-Typ" data-sort-key="ui_typ" onclick="jbSortGebuehren('ui_typ')" class="tk-sortable" style="cursor: pointer; user-select: none; width: 110px;">UI-Typ <span class="tk-sort-ind">${_jbGebSortCol === 'ui_typ' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="sort" data-col-name="Sortierung" data-sort-key="sort" onclick="jbSortGebuehren('sort')" class="tk-sortable text-center" style="cursor: pointer; user-select: none; width: 65px;">Sort <span class="tk-sort-ind">${_jbGebSortCol === 'sort' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="aktiv" data-col-name="Aktiv" data-sort-key="aktiv" onclick="jbSortGebuehren('aktiv')" class="tk-sortable text-center" style="cursor: pointer; user-select: none; width: 65px;">Aktiv <span class="tk-sort-ind">${_jbGebSortCol === 'aktiv' ? (_jbGebSortAsc ? '▲' : '▼') : '↕'}</span></th>
              <th data-col-id="actions" data-col-name="Aktion" class="text-end" style="width: 65px;">Aktion</th>
            </tr>
          </thead>
          <tbody id="jbGebuehrenTableBody">
            <!-- Dynamisch gerendert -->
          </tbody>
        </table>
      </div>

    </div>

    <!-- Modals für Bearbeitung -->
    ${renderGebuehrenConfigModals()}
  `;
}

function renderGebuehrenConfigModals() {
  return `
    <div class="modal fade" id="jbModalGebuehrEdit" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
        <div class="modal-content border-0 rounded-4 shadow-lg overflow-hidden position-relative">
          <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4" style="cursor: grab; user-select: none;">
            <h5 class="modal-title fw-bold mb-0" id="jbModalGebuehrTitle"><i class="fas fa-sliders-h me-2"></i>Gebühr bearbeiten</h5>
            <div class="d-flex align-items-center gap-2">
              <button type="button" class="btn btn-sm text-white p-1 border-0 shadow-none rn-modal-maximize-btn" title="Maximieren / Wiederherstellen" style="opacity: 0.85; line-height: 1;">
                <i class="fas fa-expand"></i>
              </button>
              <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
            </div>
          </div>
          <div class="modal-body p-4">
            <!-- ⚠️ Fehler- und Hilfe-Banner bei Validierungsproblemen -->
            <div id="jbGebuehrErrorAlert"></div>

            <form id="jbFormGebuehr" onsubmit="event.preventDefault(); jbSaveGebuehrFromModal();">
              
              <!-- 💡 Aufklappbarer Spickzettel & Erklärung der UI-Felder -->
              <div class="card border-info-subtle bg-light-subtle mb-3">
                <div class="card-header bg-white py-2 d-flex justify-content-between align-items-center" style="cursor: pointer;" data-bs-toggle="collapse" data-bs-target="#jbGebuehrenHelpCollapse">
                  <span class="fw-bold text-primary small">
                    <i class="fas fa-question-circle me-1 text-info"></i> 💡 Spickzettel: Wie funktionieren die 5 UI-Felder & Zielgruppen?
                  </span>
                  <span class="badge bg-light text-muted border small"><i class="fas fa-chevron-down"></i></span>
                </div>
                <div class="collapse" id="jbGebuehrenHelpCollapse">
                  <div class="card-body p-3 small text-muted" style="font-size: 11.5px; line-height: 1.5;">
                    <div class="row g-2">
                      <div class="col-md-6">
                        <div class="p-2 border rounded bg-white h-100">
                          <strong class="text-dark d-block mb-1">🏷️ UI-Gruppe & UI-Feld</strong>
                          <ul class="ps-3 mb-0">
                            <li><strong>UI-Gruppe:</strong> Überschrift der Card in der Schnellerfassung (z. B. <code>50m Wettschiessen (KK)</code>).</li>
                            <li><strong>UI-Feld:</strong> Beschriftung des Elements oder Gruppenname (z. B. <code>SSV Dezernat</code>).</li>
                            <li><strong>Sortierung (ui_sort):</strong> Reihenfolge innerhalb der Gruppe (z. B. <code>10</code>, <code>20</code>, <code>30</code>).</li>
                          </ul>
                        </div>
                      </div>
                      <div class="col-md-6">
                        <div class="p-2 border rounded bg-white h-100">
                          <strong class="text-dark d-block mb-1">🎛️ UI-Typ & Steuerelement</strong>
                          <ul class="ps-3 mb-0">
                            <li><code>checkbox</code>: Häkchen (Ja / Nein) für Einzelstiche.</li>
                            <li><code>counter</code>: Stiche-Zähler (0, 1, 2, 3 Stiche, multipliziert Betrag × Stiche).</li>
                            <li><code>singleselect</code>: Radio-Pills (nur 1 Option aus der Gruppe wählbar).</li>
                            <li><code>multiselect</code>: Mehrfachauswahl als Pill-Buttons.</li>
                            <li><code>amount</code>: Freier Betrag mit Schutzkonto (Variable Zusatzkosten).</li>
                          </ul>
                        </div>
                      </div>
                      <div class="col-12">
                        <div class="p-2 border rounded bg-white">
                          <strong class="text-dark d-block mb-1">🎯 Zielgruppe (Variante A) & Buchhaltung</strong>
                          <div class="d-flex gap-3 flex-wrap">
                            <div><code>Alle</code>: Für alle Mitglieder wählbar.</div>
                            <div><code>Aktive</code>: Nur für erwachsene Aktivmitglieder (Zahlung durch Mitglied).</div>
                            <div><code>Junioren</code>: Nur für Junioren (wird auf der Rechnung automatisch via <strong>Jugendförderung Konto 3420</strong> vom Verein übernommen).</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Basisdaten Zeile 1 -->
              <div class="row g-3 mb-3">
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">Schlüssel (Key) *</label>
                  <input type="text" class="form-control form-control-sm font-monospace fw-bold" id="g_key" placeholder="z.B. KK009" required readonly style="background-color: #f8f9fa;">
                  <div class="form-text small" id="g_key_help" style="font-size: 10px;">Eindeutiger Code (automatisch vergeben)</div>
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">Kategorie *</label>
                  <select class="form-select form-select-sm" id="g_kategorie_select" onchange="jbOnModalKategorieSelectChanged(this)">
                    <!-- Dynamisch geladen -->
                  </select>
                  <input type="text" class="form-control form-control-sm mt-1" id="g_kategorie" placeholder="Kategorie eingeben" required style="display: none;" oninput="jbOnModalCustomKategorieInput(this.value)">
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">🎯 Zielgruppe *</label>
                  <select class="form-select form-select-sm fw-semibold" id="g_zielgruppe" onchange="jbUpdateGebuehrLivePreview()">
                    <option value="Alle">👥 Alle (Aktive & Junioren)</option>
                    <option value="Aktive">🎯 Nur Aktive (Erwachsene)</option>
                    <option value="Junioren">👦 Nur Junioren (Vereinsübernahme)</option>
                  </select>
                </div>
                <div class="col-md-3">
                  <label class="form-label small fw-bold text-muted">Betrag (CHF) *</label>
                  <div class="input-group input-group-sm">
                    <span class="input-group-text">CHF</span>
                    <input type="number" step="0.05" class="form-control text-end" id="g_betrag" placeholder="0.00" required oninput="jbUpdateGebuehrLivePreview()">
                  </div>
                </div>
              </div>

              <!-- Zeile 2: Bezeichnungen -->
              <div class="row g-3 mb-3">
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Bezeichnung Frontend *</label>
                  <input type="text" class="form-control form-control-sm" id="g_bezeichnungfrontend" placeholder="z.B. 50m Liegend Nachdoppel" required oninput="jbOnModalBezeichnungFrontendInput(this.value)">
                </div>
                <div class="col-md-6">
                  <label class="form-label small fw-bold text-muted">Vollständige Bezeichnung (Rechnungsdruck)</label>
                  <input type="text" class="form-control form-control-sm" id="g_bezeichnung" placeholder="Wird auf PDF-Rechnung gedruckt">
                </div>
              </div>

              <!-- Zeile 3: Buchhaltungskonto (Kontenrahmen-Anbindung) -->
              <div class="row g-3 mb-3">
                <div class="col-md-5">
                  <label class="form-label small fw-bold text-muted">Haben-Konto (Ertragskonto) *</label>
                  <div class="input-group input-group-sm">
                    <input type="text" class="form-control font-monospace fw-bold" id="g_konto" list="jb-konten-datalist" placeholder="z.B. 3000 oder 3200" onchange="jbOnGebuehrKontoChanged(this.value); jbUpdateGebuehrLivePreview();" required>
                    <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Aus Kontenrahmen wählen">
                      <i class="fas fa-book"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow p-2" id="jb-gebuehr-konten-dropdown" style="max-height: 280px; overflow-y: auto; font-size: 12px; min-width: 280px;">
                      <!-- Dynamisch aus Kontenrahmen befüllt -->
                    </ul>
                  </div>
                  <div class="form-text text-muted small" style="font-size: 10px;">Aus KMU-Kontenrahmen wählen oder eingeben</div>
                </div>
                <div class="col-md-7">
                  <label class="form-label small fw-bold text-muted">Kontobezeichnung (KMU-Kontenrahmen)</label>
                  <input type="text" class="form-control form-control-sm bg-light" id="g_kontobezeichnung" placeholder="Wird automatisch ermittelt..." readonly>
                </div>
              </div>

              <!-- UI-Darstellung Card -->
              <div class="card p-3 bg-light border-0 rounded-3 mb-3">
                <h6 class="text-secondary fw-bold mb-2 small text-uppercase" style="font-size: 11px;">
                  <i class="fas fa-desktop me-1 text-primary"></i> UI-Darstellung in der Schnellerfassung
                </h6>
                <div class="row g-3">
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">UI-Gruppe (Card-Überschrift) *</label>
                    <select class="form-select form-select-sm" id="g_ui_gruppe_select" onchange="jbHandleSmartSelect(this, 'g_ui_gruppe'); jbUpdateGebuehrLivePreview();">
                      <!-- Dynamisch geladen -->
                    </select>
                    <input type="text" class="form-control form-control-sm mt-1" id="g_ui_gruppe" placeholder="UI-Gruppe eingeben" style="display: none;" oninput="jbUpdateGebuehrLivePreview()">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">UI-Feld (Steuerelement-Name) *</label>
                    <select class="form-select form-select-sm" id="g_ui_feld_select" onchange="jbHandleSmartSelect(this, 'g_ui_feld'); jbUpdateGebuehrLivePreview();">
                      <!-- Dynamisch geladen -->
                    </select>
                    <input type="text" class="form-control form-control-sm mt-1" id="g_ui_feld" placeholder="UI-Feld eingeben" style="display: none;" oninput="jbUpdateGebuehrLivePreview()">
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">UI-Typ *</label>
                    <select class="form-select form-select-sm fw-semibold" id="g_ui_typ" onchange="jbUpdateGebuehrLivePreview()">
                      <option value="checkbox">☑️ Checkbox (Toggle Ja/Nein)</option>
                      <option value="counter">🔢 Counter (Stiche-Zähler: 0, 1, 2, 3)</option>
                      <option value="multiselect">🔲 Mehrfachauswahl (Pill-Gruppe)</option>
                      <option value="singleselect">🔘 Einzelauswahl (Radio-Pills)</option>
                      <option value="amount">💵 Freier Betrag (Variable Zusatzkosten)</option>
                    </select>
                  </div>
                </div>
                <div class="row g-3 mt-1">
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">Sortierung (ui_sort)</label>
                    <input type="number" class="form-control form-control-sm" id="g_ui_sort" value="10">
                  </div>
                  <div class="col-md-4 d-flex align-items-center mt-4">
                    <div class="form-check form-switch mb-0">
                      <input class="form-check-input" type="checkbox" id="g_aktiv" checked onchange="jbUpdateGebuehrLivePreview()">
                      <label class="form-check-label small fw-semibold" for="g_aktiv">In Schnellerfassung aktiv</label>
                    </div>
                  </div>
                  <div class="col-md-4">
                    <label class="form-label small fw-bold text-muted">Bemerkung</label>
                    <input type="text" class="form-control form-control-sm" id="g_bem" placeholder="Optionale Notiz">
                  </div>
                </div>
              </div>

              <!-- 👁️ Live-Vorschau in der Schnellerfassung -->
              <div class="card border border-2 border-primary-subtle p-3 rounded-3 bg-white mb-3 shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-2 pb-1 border-bottom">
                  <span class="small fw-bold text-primary text-uppercase" style="font-size: 11px;">
                    <i class="fas fa-eye me-1"></i> Live-Vorschau: So sieht das Element in der Schnellerfassung aus
                  </span>
                  <span class="badge bg-primary-subtle text-primary border border-primary-subtle small font-monospace" id="jbGebuehrPreviewTypeBadge">Typ: Checkbox</span>
                </div>
                <div class="p-3 bg-light rounded-2 border" id="jbGebuehrLivePreviewContainer">
                  <!-- Dynamisch gerendert über jbUpdateGebuehrLivePreview() -->
                </div>
              </div>

              <div class="modal-footer bg-light border-top px-4 py-3 rounded-bottom-4 d-flex justify-content-between">
                <button type="button" class="btn btn-secondary px-3" data-bs-dismiss="modal">Abbrechen</button>
                <button type="submit" class="btn btn-success fw-bold px-4 shadow-sm" id="btnSaveGebuehr">
                  <i class="fas fa-save me-1"></i> Gebühr speichern
                </button>
              </div>

            </form>
          </div>
          <div class="rn-modal-resizer" title="Grösse durch Ziehen verändern" style="position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;">
            <i class="fas fa-arrows-alt-diagonal" style="font-size: 10px; opacity: 0.5;"></i>
          </div>
        </div>
      </div>
    </div>
  `;
}

// ============================================================
// SPALTENSORTIERUNG & TABLEKIT INTEGRATION
// ============================================================
function jbSortGebuehren(col) {
  if (_jbGebSortCol === col) {
    _jbGebSortAsc = !_jbGebSortAsc;
  } else {
    _jbGebSortCol = col;
    _jbGebSortAsc = true;
  }
  jbApplyGebuehrenSorting();
  jbRenderGebuehrenTable();
  jbUpdateGebuehrenHeaderVisuals();
}
window.jbSortGebuehren = jbSortGebuehren;

function jbApplyGebuehrenSorting() {
  const fees = window._jbGebuehren || [];
  fees.sort((a, b) => {
    let valA = '';
    let valB = '';
    if (_jbGebSortCol === 'key') {
      valA = String(a.key || '').toUpperCase();
      valB = String(b.key || '').toUpperCase();
    } else if (_jbGebSortCol === 'kategorie') {
      valA = String(a.kategorie || '').toLowerCase();
      valB = String(b.kategorie || '').toLowerCase();
    } else if (_jbGebSortCol === 'zielgruppe') {
      valA = String(a.zielgruppe || '').toLowerCase();
      valB = String(b.zielgruppe || '').toLowerCase();
    } else if (_jbGebSortCol === 'bezeichnung') {
      valA = String(a.bezeichnungfrontend || a.bezeichnung || '').toLowerCase();
      valB = String(b.bezeichnungfrontend || b.bezeichnung || '').toLowerCase();
    } else if (_jbGebSortCol === 'betrag') {
      valA = Number(a.betrag || 0);
      valB = Number(b.betrag || 0);
      return _jbGebSortAsc ? (valA - valB) : (valB - valA);
    } else if (_jbGebSortCol === 'konto') {
      valA = String(a['Haben-Konto-Jahresbeitrag-Buchhaltung'] || a.konto || '');
      valB = String(b['Haben-Konto-Jahresbeitrag-Buchhaltung'] || b.konto || '');
    } else if (_jbGebSortCol === 'ui_gruppe') {
      valA = String(a.ui_gruppe || '').toLowerCase();
      valB = String(b.ui_gruppe || '').toLowerCase();
    } else if (_jbGebSortCol === 'ui_feld') {
      valA = String(a.ui_feld || '').toLowerCase();
      valB = String(b.ui_feld || '').toLowerCase();
    } else if (_jbGebSortCol === 'ui_typ') {
      valA = String(a.ui_typ || '').toLowerCase();
      valB = String(b.ui_typ || '').toLowerCase();
    } else if (_jbGebSortCol === 'sort') {
      valA = Number(a.ui_sort !== undefined && a.ui_sort !== null && a.ui_sort !== '' ? a.ui_sort : (a.sort_order || 99));
      valB = Number(b.ui_sort !== undefined && b.ui_sort !== null && b.ui_sort !== '' ? b.ui_sort : (b.sort_order || 99));
      return _jbGebSortAsc ? (valA - valB) : (valB - valA);
    } else if (_jbGebSortCol === 'aktiv') {
      valA = (a.aktiv !== false && a.aktiv !== '0' && a.aktiv !== 0) ? 1 : 0;
      valB = (b.aktiv !== false && b.aktiv !== '0' && b.aktiv !== 0) ? 1 : 0;
      return _jbGebSortAsc ? (valA - valB) : (valB - valA);
    }
    return _jbGebSortAsc ? valA.localeCompare(valB, 'de') : valB.localeCompare(valA, 'de');
  });
}

function jbUpdateGebuehrenHeaderVisuals() {
  document.querySelectorAll('#jbGebuehrenTable th[data-sort-key]').forEach(th => {
    const key = th.dataset.sortKey;
    const ind = th.querySelector('.tk-sort-ind');
    if (ind) {
      ind.textContent = (key === _jbGebSortCol) ? (_jbGebSortAsc ? '▲' : '▼') : '↕';
      ind.style.opacity = (key === _jbGebSortCol) ? '1' : '0.4';
    }
  });
}

function jbInitGebuehrenConfig() {
  jbApplyGebuehrenSorting();
  jbPopulateFilterDropdowns();
  jbRenderGebuehrenTable();
  jbUpdateGebuehrenHeaderVisuals();
}

function jbPopulateFilterDropdowns() {
  const fees = window._jbGebuehren || [];
  const kats = Array.from(new Set(fees.map(f => String(f.kategorie || '').trim()).filter(Boolean))).sort();
  const gruppen = Array.from(new Set(fees.map(f => String(f.ui_gruppe || '').trim()).filter(Boolean))).sort();

  const katEl = document.getElementById('jbGebuehrKatFilter');
  if (katEl) {
    katEl.innerHTML = '<option value="">Alle Kategorien (kategorie)</option>' +
      kats.map(k => `<option value="${k}">${k}</option>`).join('');
  }

  const grpEl = document.getElementById('jbGebuehrGruppeFilter');
  if (grpEl) {
    grpEl.innerHTML = '<option value="">Alle UI-Gruppen (ui_gruppe)</option>' +
      gruppen.map(g => `<option value="${g}">${g}</option>`).join('');
  }
}

function jbFilterGebuehrenTable() {
  _jbGebuehrenSearch = (document.getElementById('jbGebuehrSearch')?.value || '').toLowerCase().trim();
  _jbGebuehrenKategorieFilter = document.getElementById('jbGebuehrKatFilter')?.value || '';
  _jbGebuehrenGruppeFilter = document.getElementById('jbGebuehrGruppeFilter')?.value || '';
  jbRenderGebuehrenTable();
}

function jbRenderGebuehrenTable() {
  const tbody = document.getElementById('jbGebuehrenTableBody');
  const countEl = document.getElementById('jbGebuehrenCount');
  if (!tbody) return;

  const fees = window._jbGebuehren || [];
  const filtered = fees.filter(f => {
    const k = String(f.key || '').toLowerCase();
    const bez = String(f.bezeichnungfrontend || f.bezeichnung || '').toLowerCase();
    const konto = String(f['Haben-Konto-Jahresbeitrag-Buchhaltung'] || f.konto || '').toLowerCase();
    const grp = String(f.ui_gruppe || '').toLowerCase();

    const matchesSearch = !_jbGebuehrenSearch || k.includes(_jbGebuehrenSearch) || bez.includes(_jbGebuehrenSearch) || konto.includes(_jbGebuehrenSearch) || grp.includes(_jbGebuehrenSearch);
    const matchesKat = !_jbGebuehrenKategorieFilter || String(f.kategorie || '').trim() === _jbGebuehrenKategorieFilter;
    const matchesGrp = !_jbGebuehrenGruppeFilter || String(f.ui_gruppe || '').trim() === _jbGebuehrenGruppeFilter;

    return matchesSearch && matchesKat && matchesGrp;
  });

  if (countEl) {
    countEl.textContent = `${filtered.length} von ${fees.length} Gebühren`;
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="12" class="text-center py-4 text-muted">
          <i class="fas fa-info-circle me-1"></i> Keine Gebühren entsprechen den Filterkriterien.
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(f => {
    const k = String(f.key || '').trim().toUpperCase();
    const konto = f['Haben-Konto-Jahresbeitrag-Buchhaltung'] || f.konto || '–';
    const kontoBezeichnung = f['Kontobezeichnung im KMU-Kontenrahmen'] || f.kontobezeichnung || '';
    const isAktiv = f.aktiv !== false && f.aktiv !== 'FALSE' && f.aktiv !== '0' && f.aktiv !== 0;
    const uiTyp = (f.ui_typ || 'checkbox').toLowerCase();

    let typBadge = `<span class="badge bg-secondary">checkbox</span>`;
    if (uiTyp === 'counter') typBadge = `<span class="badge bg-info text-dark">counter (1-3)</span>`;
    else if (uiTyp === 'multiselect') typBadge = `<span class="badge bg-primary">multiselect</span>`;
    else if (uiTyp === 'singleselect') typBadge = `<span class="badge bg-warning text-dark">singleselect</span>`;
    else if (uiTyp === 'amount') typBadge = `<span class="badge bg-success">amount</span>`;

    const zg = String(f.zielgruppe || 'Alle').trim();
    let zgBadge = `<span class="badge bg-light text-muted border">Alle</span>`;
    if (zg.toLowerCase() === 'junioren') zgBadge = `<span class="badge bg-success text-white">👦 Junioren</span>`;
    else if (zg.toLowerCase() === 'aktive') zgBadge = `<span class="badge bg-primary text-white">🎯 Aktive</span>`;

    return `
      <tr class="${isAktiv ? '' : 'table-light opacity-75'}">
        <td class="tk-col-key"><strong class="font-monospace text-primary">${k}</strong></td>
        <td class="tk-col-kategorie"><span class="badge bg-light text-secondary border">${f.kategorie || '–'}</span></td>
        <td class="tk-col-zielgruppe">${zgBadge}</td>
        <td class="tk-col-bezeichnung">
          <div class="fw-semibold text-dark">${f.bezeichnungfrontend || f.bezeichnung || '–'}</div>
          ${f.bezeichnung && f.bezeichnung !== f.bezeichnungfrontend ? `<div class="text-muted small" style="font-size:10px;">${f.bezeichnung}</div>` : ''}
        </td>
        <td class="tk-col-betrag text-end fw-bold text-dark">CHF ${Number(f.betrag || 0).toFixed(2)}</td>
        <td class="tk-col-konto">
          <span class="badge bg-light text-dark border font-monospace">${konto}</span>
          ${kontoBezeichnung ? `<div class="text-muted small" style="font-size:10px;">${escHtml(kontoBezeichnung)}</div>` : ''}
        </td>
        <td class="tk-col-ui_gruppe"><small class="text-secondary">${f.ui_gruppe || '<span class="text-muted fst-italic">Auto</span>'}</small></td>
        <td class="tk-col-ui_feld"><small class="text-dark">${f.ui_feld || '<span class="text-muted fst-italic">Auto</span>'}</small></td>
        <td class="tk-col-ui_typ">${typBadge}</td>
        <td class="tk-col-sort text-center small">${f.ui_sort !== undefined && f.ui_sort !== '' ? f.ui_sort : '–'}</td>
        <td class="tk-col-aktiv text-center">
          <i class="fas ${isAktiv ? 'fa-check-circle text-success' : 'fa-times-circle text-danger'}"></i>
        </td>
        <td class="tk-col-actions text-end">
          <button class="btn btn-xs btn-outline-primary py-1 px-2 rounded" onclick="jbOpenEditGebuehrModal('${k}')" title="Gebühr bearbeiten">
            <i class="fas fa-edit"></i>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  if (window.TableKit && typeof window.TableKit.makeResizable === 'function') {
    window.TableKit.makeResizable('#jbGebuehrenTable', {
      storageKey: 'jb_gebuehren_table_col_widths',
      minWidth: 40
    });
  }
  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function' && document.getElementById('jbGebuehrenColToggleContainer')) {
    window.TableKit.setupColumnToggle('#jbGebuehrenTable', {
      container: '#jbGebuehrenColToggleContainer',
      storageKey: 'jb_gebuehren_table_cols'
    });
  }
}

function jbOnGebuehrKontoChanged(val) {
  const code = String(val || '').split('|')[0].trim();
  const inputEl = document.getElementById('g_konto');
  if (inputEl) inputEl.value = code;

  const bezeichnungEl = document.getElementById('g_kontobezeichnung');
  const konten = window._bhKontenrahmen || [];
  const acc = konten.find(a => String(a.konto).trim() === code);
  if (bezeichnungEl) {
    bezeichnungEl.value = acc ? acc.bezeichnung : '';
  }
}
window.jbOnGebuehrKontoChanged = jbOnGebuehrKontoChanged;

function jbPopulateModalDropdowns(selectedKat, selectedGrp, selectedFeld) {
  const fees = window._jbGebuehren || [];
  
  // 1. Kategorie Select
  const kats = Array.from(new Set(fees.map(f => String(f.kategorie || '').trim()).filter(Boolean))).sort();
  const katSelect = document.getElementById('g_kategorie_select');
  const katInput = document.getElementById('g_kategorie');
  if (katSelect && katInput) {
    let html = '<option value="">-- Kategorie wählen --</option>';
    let found = false;
    kats.forEach(k => {
      const sel = k === selectedKat;
      if (sel) found = true;
      html += `<option value="${escHtml(k)}"${sel ? ' selected' : ''}>${escHtml(k)}</option>`;
    });
    html += '<option value="__custom__">➕ [ Neue Kategorie erfassen… ]</option>';
    katSelect.innerHTML = html;
    if (!found && selectedKat) {
      katSelect.value = '__custom__';
      katInput.value = selectedKat;
      katInput.style.display = 'block';
    } else {
      katInput.value = selectedKat || '';
      katInput.style.display = 'none';
    }
  }

  // 2. UI-Gruppe Select
  const gruppen = Array.from(new Set(fees.map(f => String(f.ui_gruppe || '').trim()).filter(Boolean))).sort();
  const grpSelect = document.getElementById('g_ui_gruppe_select');
  const grpInput = document.getElementById('g_ui_gruppe');
  if (grpSelect && grpInput) {
    let html = '<option value="">-- UI-Gruppe wählen --</option>';
    let found = false;
    gruppen.forEach(g => {
      const sel = g === selectedGrp;
      if (sel) found = true;
      html += `<option value="${escHtml(g)}"${sel ? ' selected' : ''}>${escHtml(g)}</option>`;
    });
    html += '<option value="__custom__">➕ [ Neue UI-Gruppe erfassen… ]</option>';
    grpSelect.innerHTML = html;
    if (!found && selectedGrp) {
      grpSelect.value = '__custom__';
      grpInput.value = selectedGrp;
      grpInput.style.display = 'block';
    } else {
      grpInput.value = selectedGrp || '';
      grpInput.style.display = 'none';
    }
  }

  // 3. UI-Feld Select
  const felder = Array.from(new Set(fees.map(f => String(f.ui_feld || '').trim()).filter(Boolean))).sort();
  const feldSelect = document.getElementById('g_ui_feld_select');
  const feldInput = document.getElementById('g_ui_feld');
  if (feldSelect && feldInput) {
    let html = '<option value="">-- Bestehendes Feld wählen oder neu --</option>';
    let found = false;
    felder.forEach(fld => {
      const sel = fld === selectedFeld;
      if (sel) found = true;
      html += `<option value="${escHtml(fld)}"${sel ? ' selected' : ''}>${escHtml(fld)}</option>`;
    });
    html += '<option value="__custom__">➕ [ Neues Feld erfassen… ]</option>';
    feldSelect.innerHTML = html;
    if (!found && selectedFeld) {
      feldSelect.value = '__custom__';
      feldInput.value = selectedFeld;
      feldInput.style.display = 'block';
    } else {
      feldInput.value = selectedFeld || '';
      feldInput.style.display = 'none';
    }
  }
}

function jbHandleSmartSelect(selectEl, inputId) {
  const inputEl = document.getElementById(inputId);
  if (!inputEl) return;
  if (selectEl.value === '__custom__') {
    inputEl.style.display = 'block';
    inputEl.value = '';
    inputEl.focus();
  } else if (selectEl.value) {
    inputEl.value = selectEl.value;
    inputEl.style.display = 'none';
  } else {
    inputEl.value = '';
    inputEl.style.display = 'none';
  }
}

let _jbGebuehrIsNewModal = false;

// Hilfsfunktion: Automatische Schlüssel-Ableitung basierend auf Kategorie (verhindert Dubletten)
function jbDeriveNextFeeKey(kategorie) {
  const kat = String(kategorie || '').trim().toLowerCase();
  let prefix = 'Z';
  if (kat.includes('jahresbeitrag')) prefix = 'JB';
  else if (kat.includes('kleinkaliber') || kat.includes('50m') || kat.includes('kk')) prefix = 'KK';
  else if (kat.includes('luftgewehr') || kat.includes('10m') || kat.includes('lg')) prefix = 'LG';
  else if (kat.includes('lizenz')) prefix = 'LI';
  else if (kat.includes('rabatt') || kat.includes('gutschrift')) prefix = 'RA';
  else if (kat.includes('gebäude') || kat.includes('infrastruktur') || kat.includes('schützenhaus')) prefix = 'GE';
  else if (kat.includes('variabel') || kat.includes('zusatz')) prefix = 'Z';
  else prefix = 'SO';

  const existingKeys = (window._jbGebuehren || []).map(g => String(g.key || '').trim().toUpperCase());
  let maxNum = 0;
  existingKeys.forEach(k => {
    if (k.startsWith(prefix)) {
      const numPart = parseInt(k.substring(prefix.length), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  });
  const nextNum = maxNum + 1;
  const padded = String(nextNum).padStart(3, '0');
  return `${prefix}${padded}`;
}
window.jbDeriveNextFeeKey = jbDeriveNextFeeKey;

function jbOnModalKategorieSelectChanged(selectEl) {
  jbHandleSmartSelect(selectEl, 'g_kategorie');
  const katVal = document.getElementById('g_kategorie')?.value || selectEl.value;
  if (_jbGebuehrIsNewModal) {
    const keyInput = document.getElementById('g_key');
    if (keyInput) {
      keyInput.value = jbDeriveNextFeeKey(katVal);
    }
  }
  jbUpdateGebuehrLivePreview();
}
window.jbOnModalKategorieSelectChanged = jbOnModalKategorieSelectChanged;

function jbOnModalCustomKategorieInput(val) {
  if (_jbGebuehrIsNewModal) {
    const keyInput = document.getElementById('g_key');
    if (keyInput) {
      keyInput.value = jbDeriveNextFeeKey(val);
    }
  }
  jbUpdateGebuehrLivePreview();
}
window.jbOnModalCustomKategorieInput = jbOnModalCustomKategorieInput;

function jbOnModalBezeichnungFrontendInput(val) {
  const bezInput = document.getElementById('g_bezeichnung');
  const fldInput = document.getElementById('g_ui_feld');
  if (bezInput && !bezInput.dataset.manualEdit) {
    bezInput.value = val;
  }
  if (fldInput && fldInput.style.display !== 'none' && !fldInput.dataset.manualEdit) {
    fldInput.value = val;
  }
  jbUpdateGebuehrLivePreview();
}
window.jbOnModalBezeichnungFrontendInput = jbOnModalBezeichnungFrontendInput;

// Live-Vorschau in der Schnellerfassung
function jbUpdateGebuehrLivePreview() {
  const container = document.getElementById('jbGebuehrLivePreviewContainer');
  const badge = document.getElementById('jbGebuehrPreviewTypeBadge');
  if (!container) return;

  const ui_typ = document.getElementById('g_ui_typ')?.value || 'checkbox';
  const bezeichnung = document.getElementById('g_bezeichnungfrontend')?.value?.trim() || '';
  const ui_feld = document.getElementById('g_ui_feld')?.value?.trim() || bezeichnung || 'Muster-Gebühr';
  const betrag = parseFloat(document.getElementById('g_betrag')?.value) || 0;
  const konto = document.getElementById('g_konto')?.value?.trim() || '3000';
  const zielgruppe = document.getElementById('g_zielgruppe')?.value || 'Alle';

  if (badge) {
    const typeNames = {
      checkbox: '☑️ Checkbox (Ja/Nein)',
      counter: '🔢 Counter (Stiche-Zähler)',
      singleselect: '🔘 Einzelauswahl (Pills)',
      multiselect: '🔲 Mehrfachauswahl',
      amount: '💵 Freier Betrag (Variable Zusatzkosten)'
    };
    badge.textContent = `UI-Typ: ${typeNames[ui_typ] || ui_typ}`;
  }

  let html = '';
  if (ui_typ === 'checkbox') {
    html = `
      <div class="d-flex align-items-center justify-content-between bg-white p-2.5 rounded-2 border shadow-xs">
        <div class="d-flex align-items-center gap-2">
          <div class="form-check mb-0">
            <input class="form-check-input" type="checkbox" checked style="cursor: pointer;">
          </div>
          <div>
            <span class="fw-semibold text-dark small">${escHtml(ui_feld)}</span>
            ${zielgruppe === 'Junioren' ? '<span class="badge bg-info-subtle text-info ms-2" style="font-size:10px;">Jugendförderung</span>' : ''}
          </div>
        </div>
        <span class="badge bg-light text-dark border font-monospace small">CHF ${betrag.toFixed(2)}</span>
      </div>
    `;
  } else if (ui_typ === 'counter') {
    html = `
      <div class="bg-white p-2.5 rounded-2 border shadow-xs">
        <div class="d-flex justify-content-between align-items-center mb-1.5">
          <span class="fw-semibold text-dark small">${escHtml(ui_feld)}</span>
          <span class="badge bg-light text-muted border small font-monospace">Einzelpreis: CHF ${betrag.toFixed(2)}</span>
        </div>
        <div class="btn-group btn-group-sm w-100" role="group">
          <button type="button" class="btn btn-outline-secondary">Kein Stich</button>
          <button type="button" class="btn btn-primary active fw-bold">1 Stich (CHF ${betrag.toFixed(2)})</button>
          <button type="button" class="btn btn-outline-secondary">2 Stiche (CHF ${(betrag * 2).toFixed(2)})</button>
          <button type="button" class="btn btn-outline-secondary">3 Stiche (CHF ${(betrag * 3).toFixed(2)})</button>
        </div>
      </div>
    `;
  } else if (ui_typ === 'singleselect') {
    html = `
      <div class="bg-white p-2.5 rounded-2 border shadow-xs">
        <div class="small fw-semibold text-muted mb-1.5">${escHtml(ui_feld)}</div>
        <div class="d-flex gap-1.5 flex-wrap">
          <button type="button" class="btn btn-sm btn-primary active py-1 px-3 rounded-pill fw-bold">
            ${escHtml(ui_feld)} (CHF ${betrag.toFixed(2)})
          </button>
          <button type="button" class="btn btn-sm btn-light border py-1 px-3 rounded-pill text-muted">
            Andere Option
          </button>
        </div>
      </div>
    `;
  } else if (ui_typ === 'multiselect') {
    html = `
      <div class="bg-white p-2.5 rounded-2 border shadow-xs">
        <div class="small fw-semibold text-muted mb-1.5">${escHtml(ui_feld)}</div>
        <div class="d-flex gap-1.5 flex-wrap">
          <button type="button" class="btn btn-sm btn-primary active py-1 px-2.5 rounded-pill">
            <i class="fas fa-check me-1"></i>${escHtml(ui_feld)} (CHF ${betrag.toFixed(2)})
          </button>
        </div>
      </div>
    `;
  } else if (ui_typ === 'amount') {
    html = `
      <div class="p-2.5 bg-white rounded-2 border shadow-xs">
        <div class="row g-2 align-items-center">
          <div class="col-auto">
            <input class="form-check-input" type="checkbox" checked style="cursor: pointer;">
          </div>
          <div class="col">
            <input type="text" class="form-control form-control-sm bg-light" value="${escHtml(ui_feld)}" readonly>
          </div>
          <div class="col-3">
            <div class="input-group input-group-sm">
              <span class="input-group-text px-1">CHF</span>
              <input type="text" class="form-control form-control-sm text-end fw-bold bg-light" value="${betrag.toFixed(2)}" readonly>
            </div>
          </div>
          <div class="col-auto">
            <div class="input-group input-group-sm" style="width: 140px;">
              <input type="text" class="form-control form-control-sm font-monospace" value="${escHtml(konto)}" readonly style="background-color: #e9ecef;">
              <button class="btn btn-outline-secondary" type="button" disabled title="Konto gesperrt">
                <i class="fas fa-lock"></i>
              </button>
            </div>
          </div>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
}
window.jbUpdateGebuehrLivePreview = jbUpdateGebuehrLivePreview;

function jbOpenEditGebuehrModal(key) {
  const modalEl = document.getElementById('jbModalGebuehrEdit');
  if (!modalEl) return;
  const modal = bootstrap.Modal.getOrCreateInstance(modalEl);

  if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
    window.UIModalKit.makeMovableAndResizable(modalEl);
  } else if (window.TableKit && typeof window.TableKit.setupDraggableModal === 'function') {
    window.TableKit.setupDraggableModal(modalEl);
  }

  const titleEl = document.getElementById('jbModalGebuehrTitle');
  const keyInput = document.getElementById('g_key');
  const keyHelp = document.getElementById('g_key_help');
  const isNew = !key;
  _jbGebuehrIsNewModal = isNew;

  // Fehlermeldungen zurücksetzen
  document.querySelectorAll('#jbFormGebuehr .is-invalid').forEach(el => el.classList.remove('is-invalid'));
  document.querySelectorAll('#jbFormGebuehr .invalid-feedback').forEach(el => el.remove());
  const errorContainer = document.getElementById('jbGebuehrErrorAlert');
  if (errorContainer) errorContainer.innerHTML = '';

  // Dropdown für Kontenrahmen initialisieren
  const ddEl = document.getElementById('jb-gebuehr-konten-dropdown');
  if (ddEl) {
    const list = window._bhKontenrahmen || [];
    ddEl.innerHTML = list.map(k => `
      <li>
        <a class="dropdown-item py-1 px-2 d-flex justify-content-between align-items-center cursor-pointer" href="#" onclick="jbOnGebuehrKontoChanged('${k.konto}'); jbUpdateGebuehrLivePreview(); return false;">
          <span>${escHtml(k.bezeichnung)}</span>
          <span class="badge bg-light text-primary font-monospace ms-2 border">${escHtml(k.konto)}</span>
        </a>
      </li>
    `).join('') || '<li class="text-muted small px-2">Keine Konten geladen</li>';
  }

  if (isNew) {
    if (titleEl) titleEl.innerHTML = '➕ Neue Gebühr erfassen';
    keyInput.readOnly = true;
    keyInput.style.backgroundColor = '#f8f9fa';
    const initialKat = 'variabel';
    keyInput.value = jbDeriveNextFeeKey(initialKat);
    if (keyHelp) {
      keyHelp.innerHTML = '<span class="text-success fw-semibold"><i class="fas fa-magic me-1"></i>Automatisch vergeben: nächster freier Schlüssel (Dubletten ausgeschlossen).</span>';
    }

    jbPopulateModalDropdowns(initialKat, 'Variable Zusatzpositionen', '');
    document.getElementById('g_zielgruppe').value = 'Alle';
    document.getElementById('g_bezeichnungfrontend').value = '';
    document.getElementById('g_bezeichnung').value = '';
    document.getElementById('g_betrag').value = '50.00';
    jbOnGebuehrKontoChanged('8500');
    document.getElementById('g_ui_typ').value = 'amount';
    document.getElementById('g_ui_sort').value = '30';
    document.getElementById('g_aktiv').checked = true;
    document.getElementById('g_bem').value = '';
  } else {
    if (titleEl) titleEl.innerHTML = `⚙️ Gebühr bearbeiten: <span class="font-monospace">${key}</span>`;
    keyInput.readOnly = true;
    keyInput.style.backgroundColor = '#e9ecef';
    keyInput.value = key;
    if (keyHelp) {
      keyHelp.innerHTML = '<span class="text-muted"><i class="fas fa-lock me-1"></i>Bestehender Schlüssel (fest vergeben, schützt vor Dubletten).</span>';
    }

    const f = (window._jbGebuehren || []).find(x => String(x.key || '').trim().toUpperCase() === String(key).toUpperCase()) || {};
    jbPopulateModalDropdowns(f.kategorie || '', f.ui_gruppe || '', f.ui_feld || '');
    document.getElementById('g_zielgruppe').value = f.zielgruppe || 'Alle';
    document.getElementById('g_bezeichnungfrontend').value = f.bezeichnungfrontend || '';
    document.getElementById('g_bezeichnung').value = f.bezeichnung || '';
    document.getElementById('g_betrag').value = f.betrag !== undefined ? f.betrag : '';
    const initialKonto = f['Haben-Konto-Jahresbeitrag-Buchhaltung'] || f.konto_haben || f.konto || '3000';
    jbOnGebuehrKontoChanged(initialKonto);
    document.getElementById('g_ui_typ').value = (f.ui_typ || 'checkbox').toLowerCase();
    document.getElementById('g_ui_sort').value = f.ui_sort !== undefined ? f.ui_sort : '10';
    document.getElementById('g_aktiv').checked = f.aktiv !== false && f.aktiv !== 'FALSE' && f.aktiv !== '0' && f.aktiv !== 0;
    document.getElementById('g_bem').value = f.bem || f.bemerkung || '';
  }

  jbUpdateGebuehrLivePreview();
  modal.show();
}

async function jbSaveGebuehrFromModal() {
  const btn = document.getElementById('btnSaveGebuehr');
  
  // 1. Frühere Validierungsfehler zurücksetzen
  document.querySelectorAll('#jbFormGebuehr .is-invalid').forEach(el => el.classList.remove('is-invalid'));
  document.querySelectorAll('#jbFormGebuehr .invalid-feedback').forEach(el => el.remove());
  const errorContainer = document.getElementById('jbGebuehrErrorAlert');
  if (errorContainer) errorContainer.innerHTML = '';

  const errors = [];

  const keyInput = document.getElementById('g_key');
  const key = (keyInput?.value || '').trim().toUpperCase();

  const katSelect = document.getElementById('g_kategorie_select');
  const katInput = document.getElementById('g_kategorie');
  const kategorie = (katInput?.value || katSelect?.value || '').trim();

  const zielgruppe = document.getElementById('g_zielgruppe')?.value || 'Alle';

  const bezFrontInput = document.getElementById('g_bezeichnungfrontend');
  const bezeichnungfrontend = (bezFrontInput?.value || '').trim();

  const bezInput = document.getElementById('g_bezeichnung');
  const bezeichnung = (bezInput?.value || '').trim() || bezeichnungfrontend;

  const betragInput = document.getElementById('g_betrag');
  const rawBetrag = betragInput?.value;
  const betrag = parseFloat(rawBetrag);

  const kontoInput = document.getElementById('g_konto');
  const konto = (kontoInput?.value || '').trim();

  const kontobezeichnung = (document.getElementById('g_kontobezeichnung')?.value || '').trim();

  const grpInput = document.getElementById('g_ui_gruppe');
  const grpSelect = document.getElementById('g_ui_gruppe_select');
  const ui_gruppe = (grpInput?.value || grpSelect?.value || '').trim();

  const fldInput = document.getElementById('g_ui_feld');
  const fldSelect = document.getElementById('g_ui_feld_select');
  const ui_feld = (fldInput?.value || fldSelect?.value || bezeichnungfrontend).trim();

  const ui_typ = document.getElementById('g_ui_typ')?.value || 'checkbox';
  const ui_sort = parseInt(document.getElementById('g_ui_sort')?.value, 10) || 10;
  const aktiv = document.getElementById('g_aktiv')?.checked !== false;
  const bem = (document.getElementById('g_bem')?.value || '').trim();

  // Helper zum Setzen von Fehlern
  const setFieldError = (inputEl, message) => {
    if (!inputEl) return;
    inputEl.classList.add('is-invalid');
    const feedback = document.createElement('div');
    feedback.className = 'invalid-feedback';
    feedback.style.display = 'block';
    feedback.innerHTML = `<i class="fas fa-exclamation-circle me-1"></i>${message}`;
    inputEl.parentNode.appendChild(feedback);
    errors.push(message);
  };

  // Validierung:
  // A) Schlüssel
  if (!key || key.length < 2) {
    setFieldError(keyInput, 'Bitte einen gültigen Schlüssel angeben (z. B. KK009 oder Z003).');
  }

  // B) Kategorie
  if (!kategorie) {
    setFieldError(katInput?.style?.display !== 'none' ? katInput : katSelect, 
      'Kategorie ist erforderlich (z. B. Kleinkaliber, Luftgewehr oder variabel).');
  }

  // C) Frontend-Bezeichnung
  if (!bezeichnungfrontend || bezeichnungfrontend.length < 3) {
    setFieldError(bezFrontInput, 'Bitte eine aussagekräftige Bezeichnung für das Portal angeben (mind. 3 Zeichen, z. B. "Beitrag Vereinsjacke").');
  }

  // D) Haben-Konto (Ertragskonto) - Pflichtprüfung gegen KMU-Kontenrahmen!
  if (!konto) {
    setFieldError(kontoInput, 'Haben-Konto ist ein Pflichtfeld. Wählen Sie ein Ertragskonto aus dem Kontenrahmen (z. B. 1300, 3410 oder 8500).');
  } else {
    const konten = window._bhKontenrahmen || [];
    const foundAcc = konten.find(a => String(a.konto).trim() === konto);
    if (!foundAcc && konten.length > 0) {
      setFieldError(kontoInput, `Das Haben-Konto '${konto}' existiert nicht im KMU-Kontenrahmen. Bitte wählen Sie ein gültiges Konto über das Buch-Symbol, z.B. 1300 (Wettkampfbeiträge), 3410 (Mitgliederbeiträge), 3420 (Jugendförderung) oder 8500 (Zusatzerträge).`);
    }
  }

  // E) Betrag
  if (isNaN(betrag)) {
    setFieldError(betragInput, 'Bitte einen gültigen Betrag in CHF eingeben (z. B. 15.00 oder 60.00).');
  } else if (ui_typ === 'amount' && betrag <= 0) {
    setFieldError(betragInput, 'Bei einer variablen Zusatzposition muss der Standardbetrag grösser als 0.00 CHF sein (z. B. 60.00).');
  } else if (betrag === 0 && !['JB004', 'JB006', 'LI002', 'LI003'].includes(key)) {
    setFieldError(betragInput, 'Der Betrag ist CHF 0.00. Sollte diese Gebühr kostenpflichtig sein, tragen Sie bitte den Tarif ein (0.00 ist nur für befreite Kategorien wie Ehrenmitglieder oder Schüler zulässig).');
  }

  // F) UI-Gruppe & UI-Feld
  if (!ui_gruppe) {
    setFieldError(grpInput?.style?.display !== 'none' ? grpInput : grpSelect, 
      'UI-Gruppe ist erforderlich. Sie bestimmt die Card-Überschrift in der Schnellerfassung (z. B. "50m Wettschiessen (KK)" oder "Variable Zusatzpositionen").');
  }

  if (!ui_feld) {
    setFieldError(fldInput?.style?.display !== 'none' ? fldInput : fldSelect, 
      'UI-Feld ist erforderlich (bestimmt die Beschriftung des Steuerelements in der Schnellerfassung).');
  }

  // Falls Fehler vorliegen: Abbruch mit Hilfe-Banner und Fokus auf erstes fehlerhaftes Feld
  if (errors.length > 0) {
    if (errorContainer) {
      errorContainer.innerHTML = `
        <div class="alert alert-danger shadow-sm border-danger border-2 rounded-3 mb-3 p-3">
          <div class="d-flex align-items-center mb-2">
            <i class="fas fa-exclamation-triangle fa-lg text-danger me-2"></i>
            <h6 class="mb-0 fw-bold text-danger">Bitte korrigieren Sie die folgenden ${errors.length} Eingaben:</h6>
          </div>
          <ul class="mb-0 ps-3 small" style="line-height: 1.6;">
            ${errors.map(err => `<li>${err}</li>`).join('')}
          </ul>
        </div>
      `;
    }
    const firstInvalid = document.querySelector('#jbFormGebuehr .is-invalid');
    if (firstInvalid) {
      firstInvalid.focus();
      firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    return;
  }

  // Alles valide -> Speichern!
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Speichere…';
  }

  try {
    const payload = {
      action: 'saveGebuehr',
      key,
      kategorie,
      zielgruppe,
      bezeichnungfrontend,
      bezeichnung,
      betrag,
      konto,
      'Haben-Konto-Jahresbeitrag-Buchhaltung': konto,
      konto_haben: konto,
      'Kontobezeichnung im KMU-Kontenrahmen': kontobezeichnung,
      kontobezeichnung,
      ui_gruppe,
      ui_feld,
      ui_typ,
      ui_sort,
      aktiv,
      bem,
      bemerkung: bem,
      user: window.currentUser || 'frontend'
    };

    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    if (supa) {
      const { error: supaErr } = await supa.from('gebuehren_config').upsert({
        key: key,
        bezeichnung: bezeichnung,
        bezeichnung_frontend: bezeichnungfrontend,
        betrag: Number(betrag || 0),
        konto_haben: konto,
        kategorie: kategorie,
        sort_order: Number(ui_sort || 10),
        ui_gruppe: ui_gruppe,
        ui_feld: ui_feld,
        ui_typ: ui_typ,
        zielgruppe: zielgruppe,
        aktiv: aktiv,
        bemerkung: bem,
        updated_at: new Date().toISOString()
      }, { onConflict: 'key' });

      if (supaErr) throw supaErr;
      console.log(`✅ [Supabase] Gebühr ${key} erfolgreich mit allen UI-Spalten gespeichert.`);
    }

    showToast(`🎉 Gebühr ${key} erfolgreich in Supabase gespeichert!`);

    const modalEl = document.getElementById('jbModalGebuehrEdit');
    if (modalEl) {
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();
    }

    const existingIdx = (window._jbGebuehren || []).findIndex(x => String(x.key || '').trim().toUpperCase() === key);
    if (existingIdx >= 0) {
      window._jbGebuehren[existingIdx] = { ...window._jbGebuehren[existingIdx], ...payload };
    } else {
      window._jbGebuehren.push(payload);
    }

    jbPopulateFilterDropdowns();
    jbRenderGebuehrenTable();

  } catch(err) {
    alert("Fehler beim Speichern der Gebühr: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Gebühr speichern';
    }
  }
}

async function jbReloadGebuehrenData() {
  try {
    showToast("Lade Gebührenkonfiguration aus Supabase neu…");
    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    if (supa) {
      const { data, error } = await supa.from('gebuehren_config').select('*').order('sort_order', { ascending: true });
      if (!error && Array.isArray(data)) {
        window._jbGebuehren = data.map(g => ({
          key: g.key,
          bezeichnung: g.bezeichnung,
          bezeichnungfrontend: g.bezeichnung_frontend || g.bezeichnung,
          betrag: Number(g.betrag || 0),
          konto: g.konto_haben || '3000',
          kategorie: g.kategorie || 'Jahresbeitrag',
          sort_order: g.sort_order || 10
        }));
        jbPopulateFilterDropdowns();
        jbRenderGebuehrenTable();
        showToast("✅ Gebühren aus Supabase aktualisiert!");
        return;
      }
    }
  } catch(e) {
    console.error("Fehler beim Neuladen der Gebühren aus Supabase:", e);
  }
}
