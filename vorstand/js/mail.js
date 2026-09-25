// ============================================================
// mail.js – Mail-Baustein Sportschützen Muhen
// ============================================================

const MAIL_GRUPPEN_CONFIG = [
  { key: 'vorstand', label: '⭐ Vorstand',              haupt: true,  filter: m => m._istVorstand === true },
  { key: 'alle',     label: '⭐ Alle Mitglieder',       haupt: true,  filter: m => true },
  { key: 'aktiv',    label: '🎯 Alle Aktiven Schützen',haupt: false, filter: m => (m.IsActive == 1 || m.IsActive === true) && !m._istPassiv && !m._istEhren && m._kategorien && m._kategorien.length > 0 },
  { key: 'g50m',     label: 'Gewehr 50m Schützen',      haupt: false, filter: m => m._kategorien && m._kategorien.some(k => k.includes('50m')) },
  { key: 'g10m',     label: 'Gewehr 10m Schützen',      haupt: false, filter: m => m._kategorien && m._kategorien.some(k => k.includes('10m')) },
  { key: 'ehren',    label: 'Ehrenmitglieder',          haupt: false, filter: m => m._istEhren === true },
  { key: 'passiv',   label: 'Passivmitglieder',         haupt: false, filter: m => m._istPassiv === true },
];

let _mailAllMembers = [];
let _mailSelected   = new Set();
let _mailLoaded     = false;
window._mailSortCol = 'ln';
window._mailSortDir = 1;

// ============================================================
// LADEN
// ============================================================
async function loadMailData(forceReload = false) {
  if (_mailLoaded && !forceReload) return;

  _mailSelected.clear();

  // Cache-First Integration:
  if (!forceReload && window._mglData && window._mglData.length > 0) {
    console.log("⚡ loadMailData: Lade Mitglieder aus globalem Cache...");
    const seen = new Set();
    _mailAllMembers = window._mglData.filter(m => {
      const pn = String(m.PersonNumber || '');
      if (!pn || seen.has(pn)) return false;
      seen.add(pn);

      // Verstorbene + Ausgetretene immer raus
      if (m.Deceased == 1 || m.Deceased === true ||
          String(m.Deceased).toLowerCase() === 'true') return false;
      if (m.Vereinsaustritt) return false;

      // Aktiv ODER Passiv ODER Ehrenmitglied einschliessen
      const istAktiv  = m.IsActive  == 1 || m.IsActive  === true || String(m.IsActive).toLowerCase()  === 'true';
      const istPassiv = m.IsPassive == 1 || m.IsPassive === true || String(m.IsPassive).toLowerCase() === 'true';
      const istEhren  = m.IsHonoraryMember == 1 || m.IsHonoraryMember === true || String(m.IsHonoraryMember).toLowerCase() === 'true';
      return istAktiv || istPassiv || istEhren;
    });

    _mailLoaded = true;
    renderMailUI();
    return;
  }

  _mailLoaded     = false;
  _mailAllMembers = [];
  _mailSelected.clear();

  document.getElementById('mail-container').innerHTML =
    '<div class="text-center py-5 text-muted"><i class="fas fa-circle-notch fa-spin fa-2x mb-3"></i><br>Lade Mitglieder...</div>';

  try {
    let list = [];
    if (typeof window.ensureMitgliederLoaded === 'function') {
      list = await window.ensureMitgliederLoaded(forceReload);
    } else {
      const res  = await apiFetch('mitglieder', 'action=getAll');
      const text = await res.text();
      let data;
      try { data = JSON.parse(text); }
      catch (e) {
        document.getElementById('mail-container').innerHTML =
          `<div class="alert alert-danger"><strong>Parse-Fehler:</strong><br>
           <pre style="font-size:0.75rem;max-height:200px;overflow:auto">${text.substring(0,500)}</pre></div>`;
        return;
      }
      if (!data.success) {
        document.getElementById('mail-container').innerHTML =
          `<div class="alert alert-danger">Fehler: ${data.error || JSON.stringify(data)}</div>`;
        return;
      }
      list = Array.isArray(data.data) ? data.data : [];
    }

    window._mglData = list;

    const seen = new Set();
    _mailAllMembers = window._mglData.filter(m => {
      const pn = String(m.PersonNumber || '');
      if (!pn || seen.has(pn)) return false;
      seen.add(pn);

      // Verstorbene + Ausgetretene immer raus
      if (m.Deceased == 1 || m.Deceased === true ||
          String(m.Deceased).toLowerCase() === 'true') return false;
      if (m.Vereinsaustritt) return false;

      // Aktiv ODER Passiv ODER Ehrenmitglied einschliessen
      const istAktiv  = m.IsActive  == 1 || m.IsActive  === true || String(m.IsActive).toLowerCase()  === 'true';
      const istPassiv = m.IsPassive == 1 || m.IsPassive === true || String(m.IsPassive).toLowerCase() === 'true';
      const istEhren  = m.IsHonoraryMember == 1 || m.IsHonoraryMember === true || String(m.IsHonoraryMember).toLowerCase() === 'true';
      return istAktiv || istPassiv || istEhren;
    });

    _mailLoaded = true;
    renderMailUI();

  } catch (e) {
    document.getElementById('mail-container').innerHTML =
      `<div class="alert alert-danger">Verbindungsfehler: ${e.message}</div>`;
  }
}

// ============================================================
// UI AUFBAUEN
// ============================================================
function renderMailUI() {
  const counts = {};
  MAIL_GRUPPEN_CONFIG.forEach(g => {
    counts[g.key] = _mailAllMembers.filter(g.filter).length;
  });

  const hauptRows = MAIL_GRUPPEN_CONFIG
    .filter(g => g.haupt)
    .map(g => _gruppenCheckbox(g, counts[g.key]))
    .join('');
  const katRows = MAIL_GRUPPEN_CONFIG
    .filter(g => !g.haupt)
    .map(g => _gruppenCheckbox(g, counts[g.key]))
    .join('');

  document.getElementById('mail-container').innerHTML = `
    <div class="row g-4">
      <div class="col-md-5 col-lg-4">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body p-0">
            <div class="p-3 bg-light border-bottom">
              <h6 class="mb-0 fw-bold text-uppercase text-muted" style="letter-spacing: 0.5px; font-size: 0.8rem;">Hauptverteiler</h6>
            </div>
            <div class="list-group list-group-flush mb-3">
              ${hauptRows}
            </div>
            <div class="p-3 bg-light border-top border-bottom">
              <h6 class="mb-0 fw-bold text-uppercase text-muted" style="letter-spacing: 0.5px; font-size: 0.8rem;">Nach Kategorie</h6>
            </div>
            <div class="list-group list-group-flush">
              ${katRows}
            </div>
          </div>
        </div>
      </div>
      <div class="col-md-7 col-lg-8">
        <div class="card border-0 shadow-sm h-100">
          <div class="card-body d-flex flex-column">
            
            <div class="d-flex flex-wrap align-items-center justify-content-between mb-3 pb-3 border-bottom gap-2">
              <div id="mail-summary" class="fw-medium text-secondary">
                👈 Wähle links eine Verteilergruppe aus.
              </div>
              <div class="d-flex gap-2">
                <button class="btn btn-primary" onclick="mailKopieren()" id="btn-copy" disabled>
                  <i class="fas fa-copy me-1"></i> Adressen kopieren <span id="copy-count" class="badge bg-white text-primary ms-1">0</span>
                </button>
                <button id="btn-mailto" class="btn btn-outline-secondary" onclick="mailOpenMailto()" disabled title="In Standard-Mailprogramm öffnen">
                  <i class="fas fa-envelope"></i>
                </button>
                <div class="dropdown">
                  <button class="btn btn-outline-secondary dropdown-toggle" type="button" data-bs-toggle="dropdown">
                    <i class="fas fa-ellipsis-v"></i>
                  </button>
                  <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                    <li><a class="dropdown-item" href="#" onclick="mailCSV(); return false;"><i class="fas fa-download me-2 text-muted"></i>Als CSV exportieren</a></li>
                    <li><hr class="dropdown-divider"></li>
                    <li><a class="dropdown-item" href="#" onclick="loadMailData(true); return false;"><i class="fas fa-sync me-2 text-muted"></i>Mitglieder neu laden</a></li>
                  </ul>
                </div>
              </div>
            </div>

            <div id="mail-missing-warning" class="alert alert-warning py-2 small d-none d-flex align-items-center mb-3">
              <i class="fas fa-exclamation-triangle fs-5 me-2"></i>
              <div>
                <strong>Achtung:</strong> Für <span id="mail-missing-count" class="fw-bold"></span> ausgewählte Mitglieder ist <strong>keine E-Mail-Adresse</strong> hinterlegt!
              </div>
            </div>

            <div id="mail-bcc-hint" class="alert alert-info py-2 small d-none d-flex align-items-center mb-3">
              <i class="fas fa-info-circle fs-5 me-2"></i>
              <div>
                Füge die kopierten Adressen bitte immer ins <strong>BCC-Feld</strong> (Blindkopie) ein, um die Privatsphäre der Mitglieder zu schützen.
              </div>
            </div>
            
            <div id="mail-copy-success" class="alert alert-success py-2 small d-none d-flex align-items-center mb-3">
              <i class="fas fa-check-circle fs-5 me-2"></i> Adressen erfolgreich in die Zwischenablage kopiert!
            </div>
            
            <div id="mail-mailto-hint" class="alert alert-danger py-2 small d-none d-flex align-items-center mb-3">
              <i class="fas fa-ban fs-5 me-2"></i>
              <div>
                <strong>Zu viele Empfänger (>30).</strong> Die "Mail öffnen"-Funktion ist blockiert, da Provider sonst streiken. Bitte kopiere die Adressen und füge sie manuell ins Mailprogramm ein.
              </div>
            </div>

            <div id="mail-preview-container" class="flex-grow-1 overflow-auto border rounded bg-white" style="min-height: 300px; max-height: 500px;">
              <div id="mail-preview" class="h-100">
                <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted" style="opacity: 0.5;">
                  <i class="fas fa-users fa-3x mb-3"></i>
                  <p>Wähle eine Gruppe um die Empfänger zu sehen</p>
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>`;
}

function _gruppenCheckbox(g, count) {
  return `
    <label class="list-group-item list-group-item-action d-flex justify-content-between align-items-center border-0" style="cursor: pointer;" id="label-${g.key}">
      <div class="d-flex align-items-center">
        <input class="form-check-input me-3 mt-0" type="checkbox" id="mg-${g.key}" onchange="mailGruppeToggle('${g.key}')" value="">
        <span class="fw-medium">${g.label}</span>
      </div>
      <span class="badge bg-secondary rounded-pill">${count}</span>
    </label>`;
}

// ============================================================
// GRUPPENAUSWAHL
// ============================================================
function mailGruppeToggle(key) {
  const cb     = document.getElementById(`mg-${key}`);
  const isAlle = key === 'alle';

  if (isAlle && cb.checked) {
    MAIL_GRUPPEN_CONFIG.forEach(g => {
      if (g.key !== 'alle') {
        const el = document.getElementById(`mg-${g.key}`);
        if (el) { el.checked = false; el.disabled = true; }
        const lbl = document.getElementById(`label-${g.key}`);
        if (lbl) { lbl.classList.add('text-muted'); lbl.classList.remove('active', 'bg-light'); }
      }
    });
  } else if (isAlle && !cb.checked) {
    MAIL_GRUPPEN_CONFIG.forEach(g => {
      const el = document.getElementById(`mg-${g.key}`);
      if (el) el.disabled = false;
      const lbl = document.getElementById(`label-${g.key}`);
      if (lbl) lbl.classList.remove('text-muted');
    });
  }
  
  // Optisches Highlight für selektierte Listen-Einträge
  MAIL_GRUPPEN_CONFIG.forEach(g => {
      const el = document.getElementById(`mg-${g.key}`);
      const lbl = document.getElementById(`label-${g.key}`);
      if (el && lbl && !el.disabled) {
          if (el.checked) {
              lbl.classList.add('bg-light');
          } else {
              lbl.classList.remove('bg-light');
          }
      }
  });

  _mailUpdateSelection();
}

function _mailUpdateSelection() {
  _mailSelected.clear();
  MAIL_GRUPPEN_CONFIG.forEach(g => {
    const cb = document.getElementById(`mg-${g.key}`);
    if (cb && cb.checked) {
      _mailAllMembers.filter(g.filter).forEach(m => {
        _mailSelected.add(String(m.PersonNumber || ''));
      });
    }
  });
  _mailRenderSummary();
  _mailRenderPreview();
}

// ============================================================
// KATEGORIE-LABEL (kontextabhängig)
// ============================================================
function _getKatLabel(m) {
  // Nutzen des Arrays _kategorien
  if (m._kategorien && m._kategorien.length > 0) {
      return m._kategorien.join(', ');
  }
  return m._kategorie || '–';
}

// ============================================================
// MAILTO – OS-Erkennung für korrekten Trennzeichen
// ============================================================
function _mailGetTrenner() {
  const ua  = navigator.userAgent;
  const isIOS     = /iPhone|iPad|iPod/i.test(ua) ||
                    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(ua);
  const isMac     = /Macintosh/i.test(ua) && !isIOS;
  return (isIOS || isAndroid || isMac) ? ',' : ';';
}

// ============================================================
// SUMMARY
// ============================================================
function _mailRenderSummary() {
  const alle     = _mailGetAllSelected();
  const mitEmail = alle.filter(m => _getEmail(m));
  const ohne     = alle.length - mitEmail.length;

  const summaryEl  = document.getElementById('mail-summary');
  const hintEl     = document.getElementById('mail-bcc-hint');
  const warnEl     = document.getElementById('mail-missing-warning');
  const warnCount  = document.getElementById('mail-missing-count');
  const mailtoBtn  = document.getElementById('btn-mailto');
  const copyBtn    = document.getElementById('btn-copy');
  const copyCount  = document.getElementById('copy-count');
  const mailtoHint = document.getElementById('mail-mailto-hint');

  if (alle.length === 0) {
    summaryEl.innerHTML = '👈 Wähle links eine Verteilergruppe aus.';
    hintEl.classList.add('d-none');
    warnEl.classList.add('d-none');
    mailtoHint.classList.add('d-none');
    mailtoBtn.disabled = true;
    copyBtn.disabled = true;
    copyCount.textContent = '0';
    return;
  }

  summaryEl.innerHTML = `<span class="text-dark"><strong>${mitEmail.length} gültige E-Mail-Adressen</strong> von ${alle.length} Personen gefunden.</span>`;
  
  if (ohne > 0) {
      warnCount.textContent = ohne;
      warnEl.classList.remove('d-none');
  } else {
      warnEl.classList.add('d-none');
  }

  hintEl.classList.remove('d-none');

  const zuViele = mitEmail.length > 30;
  mailtoBtn.disabled = zuViele || mitEmail.length === 0;
  copyBtn.disabled = mitEmail.length === 0;
  copyCount.textContent = mitEmail.length;
  mailtoHint.classList.toggle('d-none', !zuViele);
}

// ============================================================
// VORSCHAU
// ============================================================
function _mailRenderPreview() {
  const alle = _mailGetAllSelected();
  const container = document.getElementById('mail-preview');

  if (alle.length === 0) {
    container.innerHTML = `
      <div class="d-flex flex-column align-items-center justify-content-center h-100 text-muted" style="opacity: 0.5;">
        <i class="fas fa-users fa-3x mb-3"></i>
        <p>Wähle eine Gruppe um die Empfänger zu sehen</p>
      </div>`;
    return;
  }

  const sorted = [...alle].sort((a, b) => {
    const col = window._mailSortCol;
    const va  = col === 'fn'    ? (a.FirstName || '') :
                col === 'ln'    ? (a.LastName  || '') :
                col === 'email' ? _getEmail(a)        : _getKatLabel(a);
    const vb  = col === 'fn'    ? (b.FirstName || '') :
                col === 'ln'    ? (b.LastName  || '') :
                col === 'email' ? _getEmail(b)        : _getKatLabel(b);
    return window._mailSortDir * va.localeCompare(vb, 'de');
  });

  function arrow(col) {
    if (window._mailSortCol !== col) return ' <span class="text-muted opacity-50" style="font-size:0.8em">⇅</span>';
    return window._mailSortDir === 1 ? ' <i class="fas fa-sort-alpha-down"></i>' : ' <i class="fas fa-sort-alpha-up"></i>';
  }

  // Hinweis: mglKatBadge kommt aus mitglieder.js
  const rows = sorted.map(m => {
    const email = _getEmail(m)
      ? `<span class="text-success fw-medium">${_getEmail(m)}</span>`
      : `<span class="text-danger fw-bold"><i class="fas fa-times-circle me-1"></i>Fehlt</span>`;
      
    let katHtml = '–';
    if (m._kategorien && m._kategorien.length > 0) {
        katHtml = m._kategorien.map(k => typeof mglKatBadge === 'function' ? mglKatBadge(k) : k).join(' ');
    } else if (m._kategorie) {
        katHtml = typeof mglKatBadge === 'function' ? mglKatBadge(m._kategorie) : m._kategorie;
    }

    return `<tr style="${!_getEmail(m) ? 'background-color: rgba(220, 53, 69, 0.05)' : ''}">
      <td class="align-middle">${escapeHtml(m.LastName  || '–')}</td>
      <td class="align-middle">${escapeHtml(m.FirstName || '–')}</td>
      <td class="align-middle">${email}</td>
      <td class="align-middle">${katHtml}</td>
    </tr>`;
  }).join('');

  container.innerHTML = `
    <table class="table table-hover mb-0" style="font-size: 0.9rem;">
      <thead class="table-light" style="position:sticky;top:0;z-index:2;cursor:pointer;user-select:none">
        <tr>
          <th class="py-3 px-3" onclick="mailSort('ln')" style="width: 20%;">Nachname${arrow('ln')}</th>
          <th class="py-3 px-3" onclick="mailSort('fn')" style="width: 20%;">Vorname${arrow('fn')}</th>
          <th class="py-3 px-3" onclick="mailSort('email')" style="width: 30%;">E-Mail${arrow('email')}</th>
          <th class="py-3 px-3" onclick="mailSort('kat')" style="width: 30%;">Kategorie${arrow('kat')}</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;
}

// Global – wird aus onclick im gerenderten HTML aufgerufen
function mailSort(col) {
  if (window._mailSortCol === col) window._mailSortDir *= -1;
  else { window._mailSortCol = col; window._mailSortDir = 1; }
  _mailRenderPreview();
}

// ============================================================
// HILFSFUNKTIONEN
// ============================================================
function _getEmail(m) {
  return (m.PrimaryEmail || m.primary_email || m.Email || '').trim();
}

function _mailGetAllSelected() {
  return _mailAllMembers.filter(m =>
    _mailSelected.has(String(m.PersonNumber || ''))
  );
}

function _mailGetEmailList() {
  return _mailGetAllSelected()
    .filter(m => _getEmail(m))
    .map(m => _getEmail(m))
    .join('; ');  // Für Kopieren immer Semikolon (Outlook-Paste-kompatibel)
}

// ============================================================
// EXPORT-AKTIONEN
// ============================================================
function mailKopieren() {
  const liste = _mailGetEmailList();
  if (!liste) { alert('Keine E-Mail-Adressen in der Auswahl.'); return; }
  navigator.clipboard.writeText(liste).then(() => {
    const el = document.getElementById('mail-copy-success');
    el.classList.remove('d-none');
    setTimeout(() => el.classList.add('d-none'), 3000);
  }).catch(() => {
    prompt('Adressen kopieren (Ctrl+C):', liste);
  });
}

function mailOpenMailto() {
  const emails = _mailGetAllSelected()
    .filter(m => _getEmail(m))
    .map(m => _getEmail(m));

  if (!emails.length) return;

  const trenner = _mailGetTrenner();
  const bcc     = emails.join(trenner);
  const a       = document.createElement('a');
  a.href        = 'mailto:?bcc=' + encodeURIComponent(bcc);
  document.body.appendChild(a);
  a.click();
  setTimeout(() => document.body.removeChild(a), 100);
}

function mailCSV() {
  const alle = _mailGetAllSelected();
  if (!alle.length) return;

  const lines = ['"Nachname";"Vorname";"E-Mail";"Kategorie"'];
  alle.forEach(m => {
    const kat = _getKatLabel(m);
    lines.push(
      `"${(m.LastName  || '').replace(/"/g, '""')}";` +
      `"${(m.FirstName || '').replace(/"/g, '""')}";` +
      `"${_getEmail(m).replace(/"/g, '""')}";` +
      `"${kat.replace(/"/g, '""')}"`
    );
  });

  const blob = new Blob(['\uFEFF' + lines.join('\n')],
                        { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `muhen_mail_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
}

// ============================================================
// MAIL-LOG (Versandprotokoll aus public.mail_logs / Supabase)
// ============================================================

let _mailLogData   = [];   // Rohdaten (alle geladenen Logs)
let _mailLogLoaded = false;

/**
 * Lädt die letzten 500 Einträge aus public.mail_logs und rendert die Tabelle.
 * @param {boolean} force – true = Cache ignorieren
 */
async function loadMailLogData(force = false) {
  if (_mailLogLoaded && !force) { filterMailLog(); return; }

  const container = document.getElementById('mail-log-container');
  container.innerHTML = `
    <div class="text-center py-5 text-muted">
      <i class="fas fa-circle-notch fa-spin fa-2x mb-3"></i><br>Lade Versandprotokoll…
    </div>`;

  try {
    const sb = window.supabaseClient || (typeof supabase !== 'undefined' ? supabase : null);
    if (!sb) throw new Error('Supabase-Client nicht initialisiert.');

    const { data, error } = await sb
      .from('mail_logs')
      .select('id,module_ref,record_id,recipient_email,recipient_name,cc_email,subject,body_snippet,status,error_message,sender_name,has_pdf,sent_via,sent_at')
      .order('sent_at', { ascending: false })
      .limit(500);

    if (error) throw new Error(error.message);

    _mailLogData   = data || [];
    _mailLogLoaded = true;

    // Badge aktualisieren
    const badge = document.getElementById('mail-log-badge');
    if (badge) {
      badge.textContent = _mailLogData.length;
      badge.classList.remove('d-none');
    }

    filterMailLog();

  } catch (e) {
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Fehler:</strong> ${e.message}
      </div>`;
  }
}

/** Filtert _mailLogData anhand der drei Filter-Controls und rendert die Tabelle. */
function filterMailLog() {
  const module = (document.getElementById('mail-log-filter-module')?.value || '').toLowerCase();
  const status = (document.getElementById('mail-log-filter-status')?.value || '').toLowerCase();
  const search = (document.getElementById('mail-log-search')?.value || '').toLowerCase();

  const filtered = _mailLogData.filter(r => {
    if (module && r.module_ref !== module) return false;
    if (status && r.status    !== status)  return false;
    if (search) {
      const hay = `${r.recipient_email} ${r.recipient_name || ''} ${r.subject}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  });

  _renderMailLogTable(filtered);
}

/** Rendert die gefilterten Einträge als Bootstrap-Tabelle. */
function _renderMailLogTable(rows) {
  const container = document.getElementById('mail-log-container');
  if (!container) return;

  if (!rows.length) {
    container.innerHTML = `
      <div class="text-center text-muted py-5">
        <i class="fas fa-inbox fa-2x mb-2"></i><br>Keine Einträge gefunden.
      </div>`;
    return;
  }

  const tbody = rows.map(r => {
    const statusBadge = _mailLogStatusBadge(r.status);
    const modLabel    = _mailLogModuleLabel(r.module_ref);
    const sentAt      = r.sent_at ? new Date(r.sent_at).toLocaleString('de-CH', { dateStyle: 'short', timeStyle: 'short' }) : '–';
    const pdfIcon     = r.has_pdf ? '<i class="fas fa-paperclip text-muted" title="PDF Anhang"></i>' : '';
    const subject     = escapeHtml(r.subject || '–');
    const recipient   = escapeHtml(r.recipient_email || '–');
    const name        = escapeHtml(r.recipient_name || '');

    return `
      <tr style="cursor:pointer" onclick="_showMailLogDetail('${r.id}')">
        <td class="align-middle text-nowrap text-muted small">${sentAt}</td>
        <td class="align-middle">${modLabel}</td>
        <td class="align-middle">
          <div class="fw-medium">${recipient}</div>
          ${name ? `<div class="text-muted small">${name}</div>` : ''}
        </td>
        <td class="align-middle" style="max-width:300px">
          <div class="text-truncate">${subject}</div>
          ${r.record_id ? `<span class="badge bg-light text-dark border small">${escapeHtml(r.record_id)}</span>` : ''}
        </td>
        <td class="align-middle text-center">${pdfIcon}</td>
        <td class="align-middle">${statusBadge}</td>
      </tr>`;
  }).join('');

  container.innerHTML = `
    <div class="text-muted small mb-2">${rows.length} Einträge</div>
    <div class="table-responsive">
      <table class="table table-hover table-sm align-middle" style="font-size:0.875rem">
        <thead class="table-light">
          <tr>
            <th>Datum</th>
            <th>Modul</th>
            <th>Empfänger</th>
            <th>Betreff / Ref.</th>
            <th class="text-center"><i class="fas fa-paperclip" title="PDF"></i></th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>`;
}

/** Zeigt Detailansicht eines Log-Eintrags (Klick auf Zeile). */
function _showMailLogDetail(itemOrId) {
  let r = null;
  if (typeof itemOrId === 'string') {
    r = _mailLogData.find(x => x.id === itemOrId);
    if (!r) {
      try { r = JSON.parse(itemOrId); } catch (e) { r = null; }
    }
  } else if (itemOrId && typeof itemOrId === 'object') {
    r = itemOrId;
  }
  if (!r) return;

  const sentAt = r.sent_at ? new Date(r.sent_at).toLocaleString('de-CH') : '–';

  const rows = [
    ['Datum',       sentAt],
    ['Modul',       r.module_ref || '–'],
    ['Referenz-ID', r.record_id  || '–'],
    ['Empfänger',   r.recipient_email + (r.recipient_name ? ` (${r.recipient_name})` : '')],
    ['CC',          r.cc_email  || '–'],
    ['Betreff',     r.subject   || '–'],
    ['Status',      r.status    || '–'],
    ['Absender',    r.sender_name || '–'],
    ['Versandweg',  r.sent_via  || '–'],
    ['PDF-Anhang',  r.has_pdf ? '✅ Ja' : '–'],
    ['Vorschau',    r.body_snippet ? `<pre style="white-space:pre-wrap;font-size:0.8rem;max-height:200px;overflow:auto">${escapeHtml(r.body_snippet)}</pre>` : '–'],
    ...(r.error_message ? [['Fehlermeldung', `<span class="text-danger">${escapeHtml(r.error_message)}</span>`]] : [])
  ];

  const tableRows = rows.map(([k, v]) =>
    `<tr><th class="text-muted fw-normal" style="width:130px;white-space:nowrap">${k}</th><td>${v}</td></tr>`
  ).join('');

  // Modal dynamisch erzeugen oder wiederverwenden
  let modal = document.getElementById('mail-log-detail-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'mail-log-detail-modal';
    modal.className = 'modal fade';
    modal.tabIndex = -1;
    modal.innerHTML = `
      <div class="modal-dialog modal-lg modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title"><i class="fas fa-envelope me-2"></i>Mail-Log Detail</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="mail-log-detail-body"></div>
          <div class="modal-footer">
            <button class="btn btn-secondary" data-bs-dismiss="modal">Schliessen</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(modal);
  }

  document.getElementById('mail-log-detail-body').innerHTML =
    `<table class="table table-sm table-borderless">${tableRows}</table>`;

  new bootstrap.Modal(modal).show();
}

/** Gibt ein farbiges Badge für den Mail-Status zurück. */
function _mailLogStatusBadge(status) {
  const map = {
    'gesendet':  '<span class="badge bg-success">✅ Gesendet</span>',
    'fehler':    '<span class="badge bg-danger">❌ Fehler</span>',
    'simuliert': '<span class="badge bg-warning text-dark">🧪 Simuliert</span>',
  };
  return map[status] || `<span class="badge bg-secondary">${escapeHtml(status || '–')}</span>`;
}

/** Gibt ein Emoji-Label für das Herkunftsmodul zurück. */
function _mailLogModuleLabel(ref) {
  const map = {
    'rechnung':     '💶 Rechnung',
    'mietvertrag':  '🏠 Mietvertrag',
    'jahresbeitrag':'📋 Jahresbeitrag',
    'mahnung':      '⚠️ Mahnung',
    'anlasse':      '📅 Anlässe',
    'vermietung':   '🔑 Vermietung',
    'mitglieder':   '👥 Mitglieder',
    'sonstige':     '📁 Sonstige',
    'unbekannt':    '❓ Unbekannt',
  };
  return map[ref] || escapeHtml(ref || '–');
}

