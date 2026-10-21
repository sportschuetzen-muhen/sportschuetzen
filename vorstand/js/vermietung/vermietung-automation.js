// === SUB-MODUL: VERMIETUNG - AUTOMATION (GMAIL & CRON) ===
// Steuerung des automatischen Bank-Mail-Eingangs, pg_cron Zeitplan & Ingest-Audit

window._bankAutomationStatus = null;
window._bankIngestLogs = [];

/**
 * Lädt Status, Cron-Job und Ingest-Logs aus Supabase
 */
async function loadBankAutomationData() {
  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  if (!supa) return;

  try {
    // 1. Status via RPC abrufen
    const { data: statusData, error: statusErr } = await supa.rpc('get_bank_automation_status');
    if (!statusErr && statusData) {
      window._bankAutomationStatus = statusData;
    }

    // 2. Ingest-Logs abrufen
    const { data: logsData, error: logsErr } = await supa
      .from('bank_mail_ingest_logs')
      .select('*')
      .order('processed_at', { ascending: false })
      .limit(30);

    if (!logsErr && logsData) {
      window._bankIngestLogs = logsData;
    }
  } catch (err) {
    console.error("Fehler beim Laden der Bank-Automation-Daten:", err);
  }
}

/**
 * Rendert das Tab-Panel für die Bank-Automation
 */
async function renderBankAutomationTab() {
  const container = document.getElementById('tab-bank-automation');
  if (!container) return;

  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary mb-2" role="status"></div>
      <div class="text-muted small">Lade Bank-Automation &amp; Postfach-Status...</div>
    </div>
  `;

  await loadBankAutomationData();

  const status = window._bankAutomationStatus || {
    active: true,
    schedule: '5 */2 * * *',
    job_exists: true,
    last_status_code: 200,
    total_processed: 0,
    success_count: 0,
    error_count: 0
  };

  const canWrite = typeof hasWriteAccess === 'function' ? hasWriteAccess('vermietung') : true;
  const isActive = status.active === true;
  const currentSchedule = status.schedule || '5 */2 * * *';

  const scheduleLabels = {
    '*/15 * * * *': 'Alle 15 Minuten (Häufig)',
    '*/30 * * * *': 'Alle 30 Minuten',
    '0 * * * *': 'Jede Stunde',
    '5 */2 * * *': 'Alle 2 Stunden (Standard)',
    '0 */4 * * *': 'Alle 4 Stunden',
    '0 8 * * *': 'Einmal täglich (08:00 Uhr)'
  };

  const scheduleOptionsHtml = Object.entries(scheduleLabels).map(([cronVal, label]) => `
    <option value="${cronVal}" ${currentSchedule === cronVal ? 'selected' : ''}>${label}</option>
  `).join('');

  const lastRunText = status.last_run_at 
    ? new Date(status.last_run_at).toLocaleString('de-CH', { dateStyle: 'medium', timeStyle: 'short' })
    : 'Noch nicht ausgeführt';

  const statusBadge = isActive 
    ? `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="fas fa-circle text-success me-1" style="font-size:0.6rem;"></i>Aktiv (Hintergrund-Scan)</span>`
    : `<span class="badge bg-secondary-subtle text-secondary border px-2 py-1"><i class="fas fa-pause text-secondary me-1" style="font-size:0.6rem;"></i>Pausiert</span>`;

  // Baue Log-Tabelle
  let logsHtml = '';
  if (!window._bankIngestLogs || window._bankIngestLogs.length === 0) {
    logsHtml = `
      <tr>
        <td colspan="6" class="text-center py-4 text-muted">
          <i class="fas fa-inbox fa-2x mb-2 d-block opacity-25"></i>
          Bisher sind noch keine Bank-Mails im Postfach eingetroffen oder verarbeitet worden.
        </td>
      </tr>
    `;
  } else {
    logsHtml = window._bankIngestLogs.map(l => {
      let badge = '';
      if (l.result === 'success') {
        badge = '<span class="badge bg-success">✅ Verbucht</span>';
      } else if (l.result === 'already_paid') {
        badge = '<span class="badge bg-info text-dark">ℹ️ Bereits bezahlt</span>';
      } else if (l.result === 'underpaid') {
        badge = '<span class="badge bg-warning text-dark">⚠️ Zu wenig</span>';
      } else if (l.result === 'unknown_contract') {
        badge = '<span class="badge bg-danger">❓ Vertrag fehlt</span>';
      } else if (l.result === 'cancelled') {
        badge = '<span class="badge bg-secondary">Storniert</span>';
      } else {
        badge = `<span class="badge bg-danger">❌ ${escapeHtml(l.result)}</span>`;
      }

      const pDate = l.processed_at ? new Date(l.processed_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '–';
      const amt = l.amount_chf ? `CHF ${Number(l.amount_chf).toFixed(2)}` : '–';

      return `
        <tr>
          <td class="small text-muted">${pDate}</td>
          <td><span class="fw-bold text-dark">${escapeHtml(l.contract_nr || '–')}</span></td>
          <td class="fw-bold">${amt}</td>
          <td>${badge}</td>
          <td class="small text-truncate" style="max-width: 260px;" title="${escapeHtml(l.mail_subject || '')}">
            ${escapeHtml(l.mail_subject || '–')}
          </td>
          <td class="small text-muted text-truncate" style="max-width: 200px;" title="${escapeHtml(l.error_message || l.raw_excerpt || '')}">
            ${escapeHtml(l.error_message || l.raw_excerpt || '–')}
          </td>
        </tr>
      `;
    }).join('');
  }

  container.innerHTML = `
    <div class="row g-3 mb-4">
      <!-- KARTE 1: STEUERUNG CRONJOB -->
      <div class="col-12 col-xl-6">
        <div class="card border-0 shadow-sm h-100 p-3" style="border-left: 4px solid #0f3a5d !important;">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h6 class="fw-bold text-dark mb-0">
                <i class="fas fa-robot text-primary me-1.5"></i>Raiffeisen E-Banking Automation
              </h6>
              <small class="text-muted">Liest E-Mails von <code>noreply@ebanking.raiffeisen.ch</code></small>
            </div>
            <div>${statusBadge}</div>
          </div>

          <p class="small text-muted mb-3">
            Scannt das Vereins-Postfach vollautomatisch, parst Gutschriften anhand der Buchungsnummer (z.&nbsp;B. <code>V-2026-0050</code>),
            verbucht den Zahlungseingang (Stufe 1) und informiert den Mieter sowie das Wirtschaftsteam.
          </p>

          <div class="bg-light p-3 rounded-3 border mb-3">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="small fw-bold text-dark">Automatischer Scan-Status:</span>
              <div class="form-check form-switch m-0">
                <input class="form-check-input" type="checkbox" role="switch" id="bank-cron-switch" 
                  ${isActive ? 'checked' : ''} 
                  ${!canWrite ? 'disabled' : ''} 
                  onchange="toggleBankCronActive(this.checked)" 
                  style="cursor:pointer; width: 2.4em; height: 1.2em;">
              </div>
            </div>

            <div class="mb-3">
              <label class="form-label small fw-bold text-muted mb-1">Scan-Intervall / Häufigkeit</label>
              <select class="form-select form-select-sm fw-bold" id="bank-cron-schedule-select" 
                ${!canWrite ? 'disabled' : ''} 
                onchange="saveBankCronSchedule(this.value)">
                ${scheduleOptionsHtml}
              </select>
            </div>

            <div class="d-flex justify-content-between small text-muted pt-2 border-top">
              <span><i class="fas fa-history me-1"></i>Letzte Prüfung: <b>${lastRunText}</b></span>
              <span>HTTP Status: <span class="badge ${status.last_status_code === 200 ? 'bg-success' : 'bg-warning text-dark'}">${status.last_status_code || 200}</span></span>
            </div>
          </div>

          <div class="d-flex gap-2">
            ${canWrite ? `
              <button class="btn btn-sm btn-primary fw-bold flex-grow-1 py-2 write-protected" id="btn-bank-scan-now" onclick="triggerBankMailScanNow()">
                <i class="fas fa-sync-alt me-1.5"></i>Jetzt Postfach scannen
              </button>
            ` : `
              <button class="btn btn-sm btn-secondary fw-bold flex-grow-1 py-2" disabled title="Nur mit Schreibrecht (vermietung.manage) verfügbar">
                <i class="fas fa-lock me-1.5"></i>Jetzt scannen (Schreibgeschützt)
              </button>
            `}
            <a href="https://mail.google.com/mail/u/0/#label/Raiffeisen" target="_blank" rel="noopener noreferrer" class="btn btn-sm btn-outline-secondary py-2" title="Gmail im Browser öffnen">
              <i class="fas fa-external-link-alt me-1"></i>Gmail öffnen
            </a>
          </div>
        </div>
      </div>

      <!-- KARTE 2: GMAIL STATUS & VERBINDUNG -->
      <div class="col-12 col-xl-6">
        <div class="card border-0 shadow-sm h-100 p-3" style="border-left: 4px solid #ea4335 !important;">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div>
              <h6 class="fw-bold text-dark mb-0">
                <i class="fab fa-google text-danger me-1.5"></i>Gmail Postfach-Verbindung
              </h6>
              <small class="text-muted">sportschuetzen.muhen@gmail.com</small>
            </div>
            <span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1">
              <i class="fas fa-check-circle me-1"></i>OAuth Verbunden
            </span>
          </div>

          <div class="row g-2 mb-3">
            <div class="col-4">
              <div class="border rounded-3 p-2 text-center bg-light">
                <div class="fw-bold text-dark fs-5">${status.total_processed || 0}</div>
                <div class="text-muted" style="font-size:0.75rem;">Verarbeitet</div>
              </div>
            </div>
            <div class="col-4">
              <div class="border rounded-3 p-2 text-center bg-light">
                <div class="fw-bold text-success fs-5">${status.success_count || 0}</div>
                <div class="text-muted" style="font-size:0.75rem;">Verbucht</div>
              </div>
            </div>
            <div class="col-4">
              <div class="border rounded-3 p-2 text-center bg-light">
                <div class="fw-bold text-danger fs-5">${status.error_count || 0}</div>
                <div class="text-muted" style="font-size:0.75rem;">Fehler/Prüfen</div>
              </div>
            </div>
          </div>

          <div class="alert alert-light border small mb-0 py-2.5">
            <div class="fw-bold text-dark mb-1"><i class="fas fa-tag text-warning me-1"></i>Gmail-Labels Workflow:</div>
            <ol class="ps-3 mb-0 text-muted" style="font-size:0.8rem;">
              <li>Eingehendes Mail erhält via Gmail-Filter das Label <code>Raiffeisen</code>.</li>
              <li>Automation liest das Mail, verbucht die Buchung &amp; verschiebt es nach <code>Raiffeisen/Verarbeitet</code>.</li>
              <li>Bei Unklarheiten oder Unterzahlung verschiebt das System nach <code>Raiffeisen/Fehler</code> und sendet ein Admin-Mail.</li>
            </ol>
          </div>
        </div>
      </div>
    </div>

    <!-- LOG-TABELLE: VERARBEITETE BANK-MAILS -->
    <div class="card border-0 shadow-sm p-3">
      <div class="d-flex justify-content-between align-items-center mb-3">
        <h6 class="fw-bold text-dark mb-0">
          <i class="fas fa-receipt text-primary me-1.5"></i>Verlauf der Bank-Mail Verbuchungen
        </h6>
        <button class="btn btn-sm btn-outline-secondary py-0.5" onclick="renderBankAutomationTab()">
          <i class="fas fa-redo me-1"></i>Aktualisieren
        </button>
      </div>

      <div class="table-responsive">
        <table class="table table-sm table-hover align-middle mb-0">
          <thead class="table-light">
            <tr>
              <th style="width: 120px;">Zeitpunkt</th>
              <th style="width: 130px;">Vertrag</th>
              <th style="width: 110px;">Betrag</th>
              <th style="width: 140px;">Ergebnis</th>
              <th>E-Mail Betreff</th>
              <th>Rückmeldung / Hinweis</th>
            </tr>
          </thead>
          <tbody>
            ${logsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

/**
 * Aktiviert / Deaktiviert den Hintergrund-Cron
 */
async function toggleBankCronActive(newActiveState) {
  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  if (!supa) return;

  const currentSchedule = window._bankAutomationStatus?.schedule || '5 */2 * * *';

  try {
    const { data, error } = await supa.rpc('set_bank_cron_config', {
      p_schedule: currentSchedule,
      p_active: Boolean(newActiveState)
    });

    if (error) throw error;

    if (window._bankAutomationStatus) {
      window._bankAutomationStatus.active = Boolean(newActiveState);
    }

    if (typeof showToast === 'function') {
      showToast(newActiveState ? 'Hintergrund-Scan aktiviert (alle 2h).' : 'Hintergrund-Scan pausiert.', 'success');
    }
    renderBankAutomationTab();
  } catch (err) {
    console.error("Fehler beim Umschalten des Cronjobs:", err);
    alert("Fehler beim Speichern: " + (err.message || err));
    renderBankAutomationTab();
  }
}

/**
 * Speichert ein neues Scan-Intervall
 */
async function saveBankCronSchedule(newSchedule) {
  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  if (!supa) return;

  const isActive = window._bankAutomationStatus?.active !== false;

  try {
    const { data, error } = await supa.rpc('set_bank_cron_config', {
      p_schedule: newSchedule,
      p_active: isActive
    });

    if (error) throw error;

    if (window._bankAutomationStatus) {
      window._bankAutomationStatus.schedule = newSchedule;
    }

    if (typeof showToast === 'function') {
      showToast('Scan-Intervall erfolgreich aktualisiert.', 'success');
    }
  } catch (err) {
    console.error("Fehler beim Anpassen des Scan-Intervalls:", err);
    alert("Fehler beim Speichern: " + (err.message || err));
    renderBankAutomationTab();
  }
}

/**
 * Löst sofort einen manuellen Postfach-Scan aus
 */
async function triggerBankMailScanNow() {
  const btn = document.getElementById('btn-bank-scan-now');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1.5" role="status"></span>Scanne Postfach...`;
  }

  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  if (!supa) return;

  try {
    const { data, error } = await supa.rpc('trigger_bank_mail_scan_now');
    if (error) throw error;

    if (typeof showToast === 'function') {
      showToast('Scan angestossen. Aktualisiere in 3 Sekunden...', 'info');
    }

    setTimeout(async () => {
      await renderBankAutomationTab();
      if (typeof showToast === 'function') {
        showToast('Scan abgeschlossen & Daten aktualisiert.', 'success');
      }
    }, 3500);
  } catch (err) {
    console.error("Fehler beim Starten des Sofort-Scans:", err);
    alert("Fehler beim Starten des Scans: " + (err.message || err));
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<i class="fas fa-sync-alt me-1.5"></i>Jetzt Postfach scannen`;
    }
  }
}

// Global verfügbar machen
window.renderBankAutomationTab = renderBankAutomationTab;
window.toggleBankCronActive = toggleBankCronActive;
window.saveBankCronSchedule = saveBankCronSchedule;
window.triggerBankMailScanNow = triggerBankMailScanNow;
