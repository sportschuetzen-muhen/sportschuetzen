// === SUB-MODUL: MITGLIEDER - SYSTEM SYNC FRONTEND ===

let _mglSyncCurrentDiffs = null;
let _mglSyncCurrentTarget = null;

function mglRenderSync() {
  const container = document.getElementById('mglTabContent');
  if (!container) return;

  container.innerHTML = `
    <style>
      .sync-card {
        background: #ffffff;
        border: 1px solid rgba(0,0,0,0.08);
        border-radius: 12px;
        padding: 1.5rem;
        box-shadow: 0 4px 14px rgba(0,0,0,0.04);
        transition: transform 0.2s ease, box-shadow 0.2s ease;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        height: 100%;
      }
      .sync-card:hover {
        transform: translateY(-3px);
        box-shadow: 0 8px 24px rgba(15, 58, 93, 0.1);
      }
      .sync-card-icon {
        width: 48px;
        height: 48px;
        border-radius: 10px;
        background: var(--primary-light, #eef2f7);
        color: #0f3a5d;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 1.4rem;
        margin-bottom: 1rem;
      }
      .sync-status-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.25rem 0.5rem;
        border-radius: 6px;
      }
      .diff-badge-neu { background: #198754; color: #fff; }
      .diff-badge-update { background: #ffc107; color: #000; }
      .diff-badge-entfernt { background: #dc3545; color: #fff; }
      .modal-xl-custom { max-width: 1000px; }
    </style>

    <div class="card border-0 shadow-sm p-4">
      <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h4 class="text-primary mb-1" style="font-weight: 700;">
            <i class="fas fa-sync-alt me-2"></i> Outbound System-Synchronisation
          </h4>
          <p class="text-muted mb-0" style="font-size: 0.9rem;">
            Übertragungen aus der Master-Datenbank <strong>Members100</strong> zu allen 6 angebundenen Ziel-Tabellen steuern & prüfen.
          </p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" onclick="mglLoadSyncHistory()">
            <i class="fas fa-history me-1"></i> Audit-Log
          </button>
          <button class="btn btn-primary btn-sm" onclick="mglCheckSyncDiff('all')">
            <i class="fas fa-rocket me-1"></i> 1-Klick Master-Sync (Alle)
          </button>
        </div>
      </div>

      <!-- 6 System Cards Grid -->
      <div class="row g-3" id="mglSyncCardGrid">
        <!-- 1. Jahresmeisterschaft -->
        <div class="col-md-6 col-lg-4">
          <div class="sync-card">
            <div>
              <div class="d-flex justify-content-between align-items-start">
                <div class="sync-card-icon"><i class="fas fa-trophy"></i></div>
                <span class="badge bg-light text-dark border">Sheet: Mitgliederdaten</span>
              </div>
              <h5 class="fw-bold mb-1">Jahresmeisterschaft</h5>
              <p class="text-muted small mb-3">Stammdaten, Jahrgang, 6-stellige Lizenz & E-Mail für Schiessresultate.</p>
            </div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="mglCheckSyncDiff('jahresmeisterschaft')">
                <i class="fas fa-search me-1"></i> Vorschau
              </button>
              <button class="btn btn-primary btn-sm flex-fill" onclick="mglExecuteSyncDirect('jahresmeisterschaft')">
                <i class="fas fa-sync me-1"></i> Sync
              </button>
            </div>
          </div>
        </div>

        <!-- 2. Homepage / Mannschaft -->
        <div class="col-md-6 col-lg-4">
          <div class="sync-card">
            <div>
              <div class="d-flex justify-content-between align-items-start">
                <div class="sync-card-icon"><i class="fas fa-globe"></i></div>
                <span class="badge bg-light text-dark border">Sheet: Mitglieder</span>
              </div>
              <h5 class="fw-bold mb-1">Homepage / Mannschaft</h5>
              <p class="text-muted small mb-3">Aktive Schützen mit 50m-Lizenz für Homepage & Gruppenaufstellungen.</p>
            </div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="mglCheckSyncDiff('homepage')">
                <i class="fas fa-search me-1"></i> Vorschau
              </button>
              <button class="btn btn-primary btn-sm flex-fill" onclick="mglExecuteSyncDirect('homepage')">
                <i class="fas fa-sync me-1"></i> Sync
              </button>
            </div>
          </div>
        </div>

        <!-- 3. Vereinsinventar -->
        <div class="col-md-6 col-lg-4">
          <div class="sync-card">
            <div>
              <div class="d-flex justify-content-between align-items-start">
                <div class="sync-card-icon"><i class="fas fa-boxes"></i></div>
                <span class="badge bg-light text-dark border">Sheet: Personendaten</span>
              </div>
              <h5 class="fw-bold mb-1">Vereinsinventar</h5>
              <p class="text-muted small mb-3">Adressbuch & Ausleiher mit M-ID (Aktiv, Passiv, Verstorben, Ehemalig).</p>
            </div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="mglCheckSyncDiff('inventar')">
                <i class="fas fa-search me-1"></i> Vorschau
              </button>
              <button class="btn btn-primary btn-sm flex-fill" onclick="mglExecuteSyncDirect('inventar')">
                <i class="fas fa-sync me-1"></i> Sync
              </button>
            </div>
          </div>
        </div>

        <!-- 4. Vorstand & App-Login -->
        <div class="col-md-6 col-lg-4">
          <div class="sync-card">
            <div>
              <div class="d-flex justify-content-between align-items-start">
                <div class="sync-card-icon"><i class="fas fa-key"></i></div>
                <span class="badge bg-light text-dark border">Sheet: app_login</span>
              </div>
              <h5 class="fw-bold mb-1">Vorstand & App-Login</h5>
              <p class="text-muted small mb-3">App-Benutzer und 6-stellige PINs aus AddressNumber synchron halten.</p>
            </div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="mglCheckSyncDiff('login')">
                <i class="fas fa-search me-1"></i> Vorschau
              </button>
              <button class="btn btn-primary btn-sm flex-fill" onclick="mglExecuteSyncDirect('login')">
                <i class="fas fa-sync me-1"></i> Sync
              </button>
            </div>
          </div>
        </div>

        <!-- 5. Eventplaner / RSVP -->
        <div class="col-md-6 col-lg-4">
          <div class="sync-card">
            <div>
              <div class="d-flex justify-content-between align-items-start">
                <div class="sync-card-icon"><i class="fas fa-calendar-check"></i></div>
                <span class="badge bg-light text-dark border">Sheet: members</span>
              </div>
              <h5 class="fw-bold mb-1">Eventplaner (RSVP)</h5>
              <p class="text-muted small mb-3">Mitgliederliste für Event-Anmeldungen, Schiessanlässe & Rückmeldungen.</p>
            </div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="mglCheckSyncDiff('eventplaner')">
                <i class="fas fa-search me-1"></i> Vorschau
              </button>
              <button class="btn btn-primary btn-sm flex-fill" onclick="mglExecuteSyncDirect('eventplaner')">
                <i class="fas fa-sync me-1"></i> Sync
              </button>
            </div>
          </div>
        </div>

        <!-- 6. Admin Generalversammlung -->
        <div class="col-md-6 col-lg-4">
          <div class="sync-card">
            <div>
              <div class="d-flex justify-content-between align-items-start">
                <div class="sync-card-icon"><i class="fas fa-users-cog"></i></div>
                <span class="badge bg-light text-dark border">Sheet: Mitglieder</span>
              </div>
              <h5 class="fw-bold mb-1">Admin Generalversammlung</h5>
              <p class="text-muted small mb-3">Teilnehmerliste für GV-Einladungen, Wahlen & Stimmrechtsprüfung.</p>
            </div>
            <div class="d-flex gap-2 mt-2">
              <button class="btn btn-outline-primary btn-sm flex-fill" onclick="mglCheckSyncDiff('admin_gv')">
                <i class="fas fa-search me-1"></i> Vorschau
              </button>
              <button class="btn btn-primary btn-sm flex-fill" onclick="mglExecuteSyncDirect('admin_gv')">
                <i class="fas fa-sync me-1"></i> Sync
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Container für Audit History -->
      <div id="mglSyncHistoryContainer" class="mt-4 d-none">
        <hr class="my-4">
        <h5 class="fw-bold text-secondary mb-3"><i class="fas fa-history me-2"></i> Letzte Synchronisationen (Audit-Log)</h5>
        <div class="table-responsive rounded-3 border">
          <table class="table table-sm table-hover mb-0" style="font-size: 0.88rem;">
            <thead class="table-dark">
              <tr>
                <th>Zeitpunkt</th>
                <th>Zielsystem</th>
                <th>Aktion</th>
                <th>Details / Status</th>
                <th>Benutzer</th>
              </tr>
            </thead>
            <tbody id="mglSyncHistoryBody"></tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- DRY RUN DIFF PREVIEW MODAL -->
    <div class="modal fade" id="mglSyncModal" tabindex="-1" aria-hidden="true">
      <div class="modal-dialog modal-dialog-centered modal-xl modal-xl-custom">
        <div class="modal-content">
          <div class="modal-header bg-primary text-white">
            <h5 class="modal-title fw-bold" id="mglSyncModalTitle">
              <i class="fas fa-search me-2"></i> Sync-Vorschau (Dry Run)
            </h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4" id="mglSyncModalBody">
            <div class="text-center py-4">
              <div class="spinner-border text-primary"></div>
              <p class="mt-2 text-muted">Berechne Differenzen mit Zielsystem...</p>
            </div>
          </div>
          <div class="modal-footer bg-light">
            <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Abbrechen</button>
            <button type="button" class="btn btn-success btn-sm" id="mglBtnApplySync" onclick="mglApplyApprovedSync()">
              <i class="fas fa-check me-1"></i> Synchronisation ausführen
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Führt einen Dry-Run durch und zeigt das Vorschau-Modal an.
 */
async function mglCheckSyncDiff(targetKey) {
  _mglSyncCurrentTarget = targetKey;
  _mglSyncCurrentDiffs = [];

  const modalEl = document.getElementById('mglSyncModal');
  const modalObj = new bootstrap.Modal(modalEl);
  modalObj.show();

  const titleEl = document.getElementById('mglSyncModalTitle');
  const bodyEl = document.getElementById('mglSyncModalBody');
  const applyBtn = document.getElementById('mglBtnApplySync');

  titleEl.innerHTML = `<i class="fas fa-search me-2"></i> Sync-Vorschau (${targetKey === 'all' ? 'Alle Systeme' : targetKey})`;
  bodyEl.innerHTML = `
    <div class="text-center py-4">
      <div class="spinner-border text-primary"></div>
      <p class="mt-2 text-muted">Prüfe Mutationen und lese Stammdaten...</p>
    </div>
  `;
  applyBtn.disabled = true;

  try {
    const res = await apiFetch('mitglieder', `action=getSyncDiff&targetKey=${targetKey}`);
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      throw new Error('Das Google Apps Script Backend (Members100_GAS) wurde noch nicht neu bereitgestellt/veröffentlicht. Bitte im Google Apps Script Editor "Bereitstellen -> Neue Bereitstellung" ausführen.');
    }

    if (!data.success) throw new Error(data.error || 'Fehler beim Laden des Diff-Previews');

    if (targetKey === 'all') {
      mglRenderAllDiffsModal(data.targets);
    } else {
      _mglSyncCurrentDiffs = data.diffs || [];
      mglRenderSingleDiffModal(data.targetName, _mglSyncCurrentDiffs);
    }
  } catch(err) {
    bodyEl.innerHTML = `<div class="alert alert-danger"><strong>Fehler:</strong> ${escapeHtml(err.message)}</div>`;
  }
}

/**
 * Rendert das Diff-Preview für ein einzelnes Zielsystem.
 */
function mglRenderSingleDiffModal(targetName, diffs) {
  const bodyEl = document.getElementById('mglSyncModalBody');
  const applyBtn = document.getElementById('mglBtnApplySync');

  if (!diffs || diffs.length === 0) {
    bodyEl.innerHTML = `
      <div class="alert alert-success my-3 text-center py-4">
        <i class="fas fa-check-circle fa-2x mb-2"></i><br>
        <h5>System "${escapeHtml(targetName)}" ist 100% aktuell!</h5>
        <p class="mb-0 text-muted">Es wurden keine Abweichungen zur Master-Datenbank festgestellt.</p>
      </div>
    `;
    applyBtn.disabled = true;
    return;
  }

  applyBtn.disabled = false;

  const rowsHtml = diffs.map((d, idx) => {
    let badgeClass = 'diff-badge-update';
    if (d.action === 'NEU') badgeClass = 'diff-badge-neu';
    if (d.action === 'ENTFERNT') badgeClass = 'diff-badge-entfernt';

    return `
      <tr>
        <td class="text-center">
          <input type="checkbox" class="mgl-sync-diff-cb" data-idx="${idx}" checked>
        </td>
        <td><span class="sync-status-badge ${badgeClass}">${d.action}</span></td>
        <td class="fw-bold">${escapeHtml(d.nachname || '—')}</td>
        <td>${escapeHtml(d.vorname || '—')}</td>
        <td><i class="fas fa-map-marker-alt text-danger me-1"></i>${escapeHtml(d.wohnort || '—')}</td>
        <td class="small text-muted font-monospace">${escapeHtml(d.details || '')}</td>
      </tr>
    `;
  }).join('');

  bodyEl.innerHTML = `
    <div class="alert alert-info py-2 px-3 mb-3 d-flex align-items-center" style="font-size: 0.85rem;">
      <i class="fas fa-info-circle me-2 text-info" style="font-size: 1.1rem;"></i>
      <div><strong>Vorschau für ${escapeHtml(targetName)}:</strong> Es wurden <strong>${diffs.length} Mutationen</strong> gefunden. Aktiviere/Deaktiviere die Häkchen vor den Einträgen vor dem Schreiben.</div>
    </div>

    <div class="table-responsive rounded-3 border">
      <table class="table table-hover table-sm mb-0 align-middle">
        <thead class="table-dark">
          <tr>
            <th width="40" class="text-center"><input type="checkbox" checked onchange="mglToggleAllSyncCbs(this)"></th>
            <th>Aktion</th>
            <th>Nachname</th>
            <th>Vorname</th>
            <th>Wohnort</th>
            <th>Details / Geänderte Felder</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml}
        </tbody>
      </table>
    </div>
  `;
}

/**
 * Rendert das Diff-Preview für ALLE 6 Zielsysteme gleichzeitig.
 */
function mglRenderAllDiffsModal(targetsObj) {
  const bodyEl = document.getElementById('mglSyncModalBody');
  const applyBtn = document.getElementById('mglBtnApplySync');

  let totalDiffs = 0;
  let html = '';

  Object.keys(targetsObj).forEach(key => {
    const item = targetsObj[key];
    const diffs = item.diffs || [];
    totalDiffs += diffs.length;

    html += `<h6 class="fw-bold mt-3 text-primary border-bottom pb-1">${escapeHtml(key.toUpperCase())} (${diffs.length} Mutationen)</h6>`;

    if (diffs.length === 0) {
      html += `<div class="small text-success mb-2"><i class="fas fa-check me-1"></i> Bereits vollständig synchron.</div>`;
    } else {
      html += `
        <ul class="list-group list-group-flush mb-2 small">
          ${diffs.map(d => `
            <li class="list-group-item d-flex justify-content-between align-items-center py-1">
              <div>
                <strong>${escapeHtml(d.nachname)}, ${escapeHtml(d.vorname)}</strong> (${escapeHtml(d.wohnort || '—')})
                <span class="text-muted ms-2 font-monospace">${escapeHtml(d.details)}</span>
              </div>
              <span class="badge ${d.action === 'NEU' ? 'bg-success' : 'bg-warning text-dark'}">${d.action}</span>
            </li>
          `).join('')}
        </ul>
      `;
    }
  });

  bodyEl.innerHTML = html;
  applyBtn.disabled = totalDiffs === 0;
}

function mglToggleAllSyncCbs(masterCb) {
  document.querySelectorAll('.mgl-sync-diff-cb').forEach(cb => cb.checked = masterCb.checked);
}

/**
 * Führt die durch den Dry-Run bestätigte Synchronisation aus.
 */
async function mglApplyApprovedSync() {
  const applyBtn = document.getElementById('mglBtnApplySync');
  applyBtn.disabled = true;
  applyBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span> Schreibe Daten...`;

  try {
    const selectedDiffs = [];
    document.querySelectorAll('.mgl-sync-diff-cb').forEach(cb => {
      selectedDiffs.push(cb.checked);
    });

    const payload = {
      action: 'executeSystemSync',
      targetKey: _mglSyncCurrentTarget,
      selectedDiffs: selectedDiffs,
      user: 'Vorstand User'
    };

    const res = await apiFetch('mitglieder', payload, 'POST');
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      throw new Error('Das Backend in Google Apps Script ist noch nicht neu veröffentlicht / deployed worden.');
    }

    if (!data.success) throw new Error(data.error || 'Fehler beim Ausführen des Syncs');

    alert('✅ Synchronisation erfolgreich abgeschlossen!');

    // Modal schliessen
    const modalEl = document.getElementById('mglSyncModal');
    const modalObj = bootstrap.Modal.getInstance(modalEl);
    if (modalObj) modalObj.hide();

  } catch(err) {
    alert('❌ Fehler: ' + err.message);
  } finally {
    applyBtn.disabled = false;
    applyBtn.innerHTML = `<i class="fas fa-check me-1"></i> Synchronisation ausführen`;
  }
}

/**
 * Führt direkten Sync für eine Karte aus (nach Bestätigung).
 */
async function mglExecuteSyncDirect(targetKey) {
  if (!confirm(`Möchtest du den Sync für ${targetKey} jetzt ausführen?`)) return;

  try {
    const payload = {
      action: 'executeSystemSync',
      targetKey: targetKey,
      user: 'Vorstand Admin'
    };

    const res = await apiFetch('mitglieder', payload, 'POST');
    const rawText = await res.text();
    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      throw new Error('Das Backend in Google Apps Script ist noch nicht neu veröffentlicht / deployed worden.');
    }

    if (!data.success) throw new Error(data.error || 'Fehler beim Ausführen des Syncs');

    alert('✅ Synchronisation erfolgreich abgeschlossen!');
  } catch(err) {
    alert('❌ Fehler beim Sync: ' + err.message);
  }
}

/**
 * Lädt das Audit-Log der bisherigen Synchronisationen.
 */
async function mglLoadSyncHistory() {
  const container = document.getElementById('mglSyncHistoryContainer');
  const body = document.getElementById('mglSyncHistoryBody');
  container.classList.remove('d-none');

  body.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted"><div class="spinner-border spinner-border-sm me-1"></div> Lade Historie...</td></tr>`;

  try {
    const res = await apiFetch('mitglieder', 'action=getSyncHistory');
    const data = await res.json();

    if (!data.success) throw new Error(data.error || 'Fehler beim Laden der Historie');

    const history = data.history || [];
    if (history.length === 0) {
      body.innerHTML = `<tr><td colspan="5" class="text-center py-3 text-muted">Noch keine Sync-Protokolle vorhanden.</td></tr>`;
      return;
    }

    body.innerHTML = history.map(h => `
      <tr>
        <td class="font-monospace">${escapeHtml(h.timestamp || '—')}</td>
        <td class="fw-bold">${escapeHtml(h.feld || '—')}</td>
        <td><span class="badge bg-secondary">${escapeHtml(h.aktion || '—')}</span></td>
        <td>${escapeHtml(h.neuerwert || '—')}</td>
        <td>${escapeHtml(h.benutzer || '—')}</td>
      </tr>
    `).join('');
  } catch(err) {
    body.innerHTML = `<tr><td colspan="5" class="text-danger text-center">Fehler: ${escapeHtml(err.message)}</td></tr>`;
  }
}
