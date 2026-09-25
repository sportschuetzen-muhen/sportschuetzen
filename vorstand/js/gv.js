// === MODUL: GV & PRÄSENZ (SUPABASE-FIRST & DUAL-WRITE) ===

let gvState = null;
let originalGvState = null;

function getGVSupabaseClient() {
  if (typeof window !== 'undefined' && window.supabaseClient) {
    return window.supabaseClient;
  }
  if (typeof supabaseClient !== 'undefined' && supabaseClient) {
    return supabaseClient;
  }
  return null;
}

function getGVState() {
  if (typeof gvState !== 'undefined' && gvState) {
    window.gvState = gvState;
    return gvState;
  }
  if (window.gvState) {
    gvState = window.gvState;
    return window.gvState;
  }
  return null;
}

async function loadGVData(force = false) {
  const container = document.getElementById('gv-container');
  if(!container) return;

  if (!force && gvState && document.getElementById('gv-list')) {
    console.log("⚡ loadGVData: Lade aus lokalem Cache...");
    return;
  }
  
  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade GV Daten...</div>
    </div>
  `;

  const sb = getGVSupabaseClient();

  // 1. Supabase-First Laderoutine
  if (sb) {
    try {
      const year = new Date().getFullYear();
      const [gvRes, vorstandRes] = await Promise.all([
        sb.from('gv_instances').select('*').order('gv_year', { ascending: false }).limit(1),
        sb.from('members').select('id, vorname, nachname, email, vorstandsfunktion').not('vorstandsfunktion', 'is', null)
      ]);

      if (!gvRes.error && gvRes.data && gvRes.data.length > 0) {
        const row = gvRes.data[0];
        console.log("⚡ [GV] Stammdaten erfolgreich aus Supabase geladen:", row.gv_number + ". GV (" + row.gv_year + ")");

        const platzhalter = [];
        const pushPh = (k, v, desc = '') => {
          platzhalter.push({ platzhaltername: k, bezeichnung_app: k, inhalt: v || '', erklaerung: desc });
        };

        pushPh('Jahr der GV', String(row.gv_year || year));
        pushPh('Nummer der GV', String(row.gv_number || '100'));
        pushPh('Datum der GV', row.event_date ? new Date(row.event_date).toLocaleDateString('de-CH') : '');
        pushPh('Uhrzeit der GV', row.event_time ? row.event_time.slice(0, 5) : '19:00');
        pushPh('Abmeldedatum', row.abmelde_schluss ? new Date(row.abmelde_schluss).toLocaleDateString('de-CH') : '');
        pushPh('Mahndatum', row.mahn_datum ? new Date(row.mahn_datum).toLocaleDateString('de-CH') : '');
        pushPh('Wahljahr', row.is_wahljahr ? 'Ja' : 'Nein');
        pushPh('Verknüpfter Termin Event-ID', row.linked_event_id || '');
        pushPh('Link GV-Protokoll', row.protocol_doc_url || '');
        pushPh('Link Jahresrechnung', row.rechnung_doc_url || '');
        pushPh('Link Budget', row.budget_doc_url || '');
        pushPh('Link Traktandenliste', row.traktanden_doc_url || '');
        pushPh('Mail Pruefbericht', row.pruefbericht_mail || '');
        pushPh('Mail Jahresrechnung', row.rechnung_mail || '');
        pushPh('Mail GV-Protokoll', row.protokoll_mail || '');

        if (row.custom_placeholders && typeof row.custom_placeholders === 'object') {
          Object.keys(row.custom_placeholders).forEach(k => {
            pushPh(k, String(row.custom_placeholders[k]));
          });
        }

        let vorstandMembers = [];
        if (!vorstandRes.error && vorstandRes.data) {
          vorstandMembers = vorstandRes.data.map(m => ({
            name: `${m.nachname} ${m.vorname}`.trim(),
            email: m.email || '',
            funktion: m.vorstandsfunktion || ''
          })).filter(x => x.email);
        }

        gvState = {
          _supabaseId: row.id,
          gv_year: row.gv_year,
          gv_number: row.gv_number,
          linked_event: row.linked_event_id || '',
          is_wahljahr: !!row.is_wahljahr,
          platzhalter: platzhalter,
          vorstandMembers: vorstandMembers
        };
        window.gvState = gvState;
        originalGvState = JSON.parse(JSON.stringify(gvState));

        renderGVUI(container);
        return;
      }
    } catch (sbErr) {
      console.warn("⚠️ [GV] Supabase Ladefehler, falle zurück auf Google Apps Script:", sbErr);
    }
  }

  // 2. Fallback Google Apps Script
  try {
    const [resAdmin, resVorstand] = await Promise.all([
      apiFetch('termine', 'action=loadAdminData'),
      apiFetch('mitglieder', 'action=getVorstand')
    ]);
    const textAdmin = await resAdmin.text();
    try {
      gvState = JSON.parse(textAdmin);
    } catch(err) {
      console.error("Non-JSON Server response in loadGVData:", textAdmin);
      throw new Error("Ungültige Antwort vom Server (Google Apps Script).");
    }
    window.gvState = gvState;
    try {
      const vorstandData = await resVorstand.json();
      if(vorstandData.success) {
        gvState.vorstandMembers = vorstandData.data;
      } else {
        gvState.vorstandMembers = [];
      }
    } catch(e) { gvState.vorstandMembers = []; }

    originalGvState = JSON.parse(JSON.stringify(gvState));
    
    renderGVUI(container);
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${escapeHtml(e.message)}</div>`;
  }
}

function renderGVUI(container) {
  container.innerHTML = `
    <div class="row g-3">
        <div class="col-md-12 write-protected">
             <div class="card p-3 mb-3">
                <h5 class="card-title">🚀 Tools</h5>
                <div class="d-flex gap-2 flex-wrap align-items-center">
                    <div class="form-check form-switch d-flex align-items-center me-2 pe-2 border-end" style="margin-bottom: 0; min-height: auto;">
                        <input class="form-check-input me-2" type="checkbox" id="gv-wahljahr-switch" style="cursor: pointer;">
                        <label class="form-check-label small fw-bold text-muted" for="gv-wahljahr-switch" style="cursor: pointer; user-select: none;">Wahljahr</label>
                    </div>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('genPDF')">📄 Einladungs-PDF</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendMails')">📧 GV Mails senden</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendReminders')">🔔 Mahnungen senden</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendSummary')">📊 Übersicht senden</button>
                    <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendPraesenz')">📝 Präsenzliste senden</button>
                </div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card p-3">
                <h5 class="card-title">Stammdaten / Platzhalter</h5>
                <div id="gv-list"></div>
            </div>
        </div>
        <div class="col-md-6">
            <div class="card p-3">
                <h5 class="card-title">Präsenz / Anmeldungen (Eventplaner)</h5>
                <div class="mb-2">
                    <label class="form-label small">Verknüpftes Event wählen:</label>
                    <select class="form-select form-select-sm gv-event-selector" id="gv-event-selector" onchange="loadGVParticipants(this.value)">
                        <option value="">-- Lade Events... --</option>
                    </select>
                </div>
                <div class="table-responsive" style="max-height: 430px;">
                    <table class="table table-sm table-striped">
                        <thead>
                            <tr>
                                <th style="cursor: pointer;" onclick="sortGvTable('name')">Name ↕</th>
                                <th style="cursor: pointer;" onclick="sortGvTable('status')">Teilnahme ↕</th>
                            </tr>
                        </thead>
                        <tbody id="gv-anmelde-body" class="gv-anmelde-body">
                            <tr><td colspan="2" class="text-center text-muted">Bitte Event auswählen</td></tr>
                        </tbody>
                    </table>
                </div>
                <div id="gv-anmelde-summary" class="mt-3 gv-anmelde-summary"></div>
            </div>
        </div>
    </div>
  `;
  renderGVList();
  fetchGVEvents();
}

function renderGVList() {
  const list = document.getElementById('gv-list');
  if (!list || !gvState || !gvState.platzhalter) return;

  const pickPlaceholder = (label) => {
    const l = String(label || '').toLowerCase();
    if (l.includes('datum') && l.includes('gv') && l.includes('vorjahr')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('abmeldung')) return 'dd.mm.jjjj';
    if (l.includes('mahndatum')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('gv')) return 'dd.mm.jjjj';
    if (l.includes('zeit') && l.includes('gv')) return 'hh:mm';
    return '';
  };

  const isMultiLine = (label) => {
    const l = String(label || '').toLowerCase();
    return l.includes('budget') || l.includes('einladungstext') || l.includes('beschreibung');
  };
  const isMailField = (label) => String(label || '').toLowerCase().includes('mail');

  // Reuse logic from terming.js to format email
  const members = getGVMemberMails();

  list.innerHTML = gvState.platzhalter.map((p, i) => {
    const label = p.bezeichnung_app || p.platzhaltername || '';
    const ph = pickPlaceholder(label);
    const value = p.inhalt || '';

    if (isMultiLine(label)) {
      return `
        <div class="mb-3">
          <label class="form-label small fw-bold mb-1">${escapeHtml(label)}</label>
          <textarea class="form-control form-control-sm write-protected" rows="5"
            placeholder="Mehrzeiliger Text…"
            onchange="gvState.platzhalter[${i}].inhalt=this.value">${escapeHtml(value)}</textarea>
        </div>
      `;
    }

    if (isMailField(label)) {
      const mails = value.split(';').map(x => x.trim()).filter(Boolean);
      return `
        <div class="mb-3 border-bottom pb-3">
          <label class="form-label small fw-bold mb-1">${escapeHtml(label)} <span class="text-muted fw-normal" style="font-size:0.8em;">(nur Vorstandsmitglieder)</span></label>
          <div class="tag-box mb-2" style="display:flex; flex-wrap:wrap; gap:6px; padding:6px; border:1px solid #ccc; border-radius:8px; min-height:40px;">
            ${mails.length ? mails.map(m => `
                <span style="background:#e9f2ff; color:#0d6efd; padding:2px 8px; border-radius:10px; font-size:.85rem;">
                  ${escapeHtml(m)} <span style="color:#dc3545; cursor:pointer;" class="write-protected" onclick="removeGVMail(${i}, '${escapeJs(m)}')">×</span>
                </span>
              `).join('') : '<span class="text-muted small">Keine</span>'}
          </div>
          <select class="form-select form-select-sm write-protected" onchange="addGVMail(${i}, this.value); this.value=''">
            <option value="">+ Empfänger hinzufügen</option>
            ${members.map(mm => `<option value="${escapeHtml(mm.email)}">${escapeHtml(mm.name)}</option>`).join('')}
          </select>
        </div>
      `;
    }

    const isDateField = ph === 'dd.mm.jjjj';
    const displayValue = isDateField ? isoToDisplay(value) : value;
    const isDocAttachment = ['dokument', 'anhänge', 'einladung', 'protokoll', 'jahresbericht'].some(t => label.toLowerCase().includes(t));

    if (isDocAttachment) {
      let docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-paperclip text-primary me-1"></i> Wird beim Mailversand als Anhang mitgeschickt.</div>';
      const lLower = label.toLowerCase();
      if (lLower.includes('einladung')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-file-pdf text-danger me-1"></i> Haupt-Einladungsdokument (PDF oder Google Doc) als E-Mail-Anhang.</div>';
      } else if (lLower.includes('anhänge')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-paperclip text-primary me-1"></i> Weitere Beilagen (z. B. Statuten-Entwurf, Reglemente). Kommagetrennt für mehrere Dateien.</div>';
      } else if (lLower.includes('protokoll')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-file-word text-info me-1"></i> Protokoll der Vorjahres-GV (Word .docx oder PDF) als E-Mail-Anhang.</div>';
      } else if (lLower.includes('jahresbericht')) {
          docHint = '<div class="form-text text-muted" style="font-size:0.75rem;"><i class="fas fa-file-alt text-success me-1"></i> Jahresbericht des Präsidenten als E-Mail-Anhang.</div>';
      }

      return `
        <div class="mb-3">
          <label class="form-label small fw-bold mb-1">${escapeHtml(label)} <span class="badge bg-primary text-white ms-1" style="font-size:0.65rem;"><i class="fas fa-paperclip me-1"></i> E-Mail-Anhang</span></label>
          <div class="input-group input-group-sm">
            <input type="text" id="gv-doc-input-${i}" class="form-control form-control-sm write-protected"
              value="${escapeHtml(displayValue)}"
              placeholder="${escapeHtml(ph || 'Drive ID / Link eintragen oder Datei uploaden...')}"
              onchange="gvState.platzhalter[${i}].inhalt = this.value">
            <button class="btn btn-outline-primary write-protected" type="button" onclick="document.getElementById('gv-file-upload-${i}').click()">
              <i class="fas fa-cloud-upload-alt me-1"></i> Upload
            </button>
          </div>
          <input type="file" id="gv-file-upload-${i}" class="d-none" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" multiple onchange="uploadGVDocumentFile(this.files, ${i}, 'gv-doc-input-${i}', 'gv-doc-status-${i}')">
          <div id="gv-doc-status-${i}" class="small mt-1 text-muted"></div>
          ${docHint}
        </div>
      `;
    }

    return `
      <div class="mb-2">
        <label class="form-label small fw-bold mb-0">${escapeHtml(label)}</label>
        <input type="text" class="form-control form-control-sm write-protected"
          value="${escapeHtml(displayValue)}"
          placeholder="${escapeHtml(ph)}"
          onchange="gvState.platzhalter[${i}].inhalt = ${isDateField} ? displayToIso(this.value) : this.value">
      </div>
    `;
  }).join('');
}

async function fetchGVEvents() {
    const selectors = document.querySelectorAll('.gv-event-selector, #gv-event-selector');
    try {
        const supa = (typeof getPollSupabaseClient === 'function') ? getPollSupabaseClient() : (window.supabaseClient || null);
        let events = [];
        if (supa) {
            const { data, error } = await supa.from('poll_events').select('*').order('datum', { ascending: false });
            if (!error && Array.isArray(data)) events = data;
        }
        
        const html = '<option value="">-- Bitte wählen --</option>' + 
            events.map(e => `<option value="${escapeHtml(e.id)}" ${gvState.linked_event === e.id ? 'selected' : ''}>${escapeHtml(e.title)} (${formatSwissDate(e.datum)})</option>`).join('');
            
        selectors.forEach(selector => {
            selector.innerHTML = html;
        });
            
        if(gvState.linked_event) {
            loadGVParticipants(gvState.linked_event);
        }
    } catch(e) {
        selectors.forEach(selector => {
            selector.innerHTML = '<option value="">Fehler beim Laden</option>';
        });
    }
}

async function loadGVParticipants(eventId) {
    if(!eventId) return;
    
    // Speichere die Auswahl im State
    if (gvState) {
        gvState.linked_event = eventId;
    }
    if (typeof window.markUnsaved === 'function') window.markUnsaved();
    
    // Synchronisiere alle Dropdowns
    const selectors = document.querySelectorAll('.gv-event-selector, #gv-event-selector');
    selectors.forEach(selector => {
        if (selector.value !== eventId) {
            selector.value = eventId;
        }
    });
    
    const tbodies = document.querySelectorAll('.gv-anmelde-body, #gv-anmelde-body');
    if(tbodies.length === 0) return;

    const hasCache = window._gvParticipantsCache && window._gvParticipantsCache[eventId];
    if (!hasCache) {
        tbodies.forEach(tbody => {
            tbody.innerHTML = '<tr><td colspan="2" class="text-center"><div class="spinner-border spinner-border-sm text-primary"></div></td></tr>';
        });
    }
    
    try {
        let pData;
        const sb = getGVSupabaseClient();

        if (hasCache) {
            console.log("⚡ loadGVParticipants: Verwende Cache...");
            pData = window._gvParticipantsCache[eventId];
        } else if (sb) {
            // ⚡ Supabase-First: Sub-Sekunden-Berechnung aus members & poll_responses
            console.log("⚡ [GV] Lade Teilnehmer und RSVPs direkt aus Supabase für Event:", eventId);
            const [membersRes, responsesRes] = await Promise.all([
                sb.from('members').select('id, vorname, nachname, status, email, phone').order('nachname', { ascending: true }),
                sb.from('poll_responses').select('*').eq('event_id', eventId)
            ]);

            if (!membersRes.error && !responsesRes.error && membersRes.data) {
                const members = membersRes.data;
                const responses = responsesRes.data || [];
                const respMap = {};
                responses.forEach(r => {
                    const key = r.member_id || (r.email ? r.email.toLowerCase().trim() : '') || (r.name ? r.name.toLowerCase().trim() : '');
                    if (key) respMap[key] = r;
                });

                pData = members.map(m => {
                    const fullName = `${m.nachname} ${m.vorname}`.trim();
                    const memberKey = m.id;
                    const emailKey = m.email ? m.email.toLowerCase().trim() : '';
                    const nameKey = fullName.toLowerCase();

                    const r = respMap[memberKey] || respMap[emailKey] || respMap[nameKey];
                    const rawStatus = r ? String(r.status || '').toLowerCase() : '';
                    let status = 'offen';
                    if (rawStatus === 'ja' || rawStatus === 'yes' || rawStatus === 'teilnahme') status = 'ja';
                    else if (rawStatus === 'nein' || rawStatus === 'no' || rawStatus === 'absage') status = 'nein';

                    const isStimmberechtigt = !m.status || (m.status.toLowerCase().includes('aktiv') || m.status.toLowerCase().includes('ehren'));

                    return {
                        id: m.id,
                        name: fullName,
                        status: status,
                        essen: (r && (r.meal_option === 'standard' || r.guest_count > 0 || r.essen > 0)) ? (r.guest_count || 1) : 0,
                        vegi: (r && (r.meal_option === 'vegi' || r.vegi > 0)) ? 1 : 0,
                        grund: r ? (r.reason || r.grund || r.notes || '') : '',
                        is_stimmberechtigt: isStimmberechtigt,
                        member_status: m.status || 'Aktiv'
                    };
                });

                window._gvParticipantsCache = window._gvParticipantsCache || {};
                window._gvParticipantsCache[eventId] = pData;
            } else {
                throw new Error(membersRes.error?.message || responsesRes.error?.message || "Fehler beim Laden aus Supabase");
            }
        } else {
            // Fallback GAS
            const res = await apiFetch('termine', { action: 'runTool', tool: 'getGVStatus', eventId: eventId }, 'POST');
            const result = await res.json();
            if (!result.success) throw new Error(result.error || "Fehler beim Laden");
            pData = result.data || [];
            window._gvParticipantsCache = window._gvParticipantsCache || {};
            window._gvParticipantsCache[eventId] = pData;
        }
        
        window.currentGvData = pData;
        window.gvSortDir = { name: 1, status: 1 };
        renderGvTableBody();
        
    } catch(e) {
        tbodies.forEach(tbody => {
            tbody.innerHTML = `<tr><td colspan="2" class="text-danger">Fehler: ${escapeHtml(e.message)}</td></tr>`;
        });
    }
}

function sortGvTable(field) {
    if (!window.currentGvData) return;
    window.gvSortDir[field] *= -1;
    const dir = window.gvSortDir[field];
    
    window.currentGvData.sort((a, b) => {
        let valA = String(a[field]).toLowerCase();
        let valB = String(b[field]).toLowerCase();
        if (valA < valB) return -1 * dir;
        if (valA > valB) return 1 * dir;
        return 0;
    });
    renderGvTableBody();
}

function renderGvTableBody() {
    const tbodies = document.querySelectorAll('.gv-anmelde-body, #gv-anmelde-body');
    const summaryDivs = document.querySelectorAll('.gv-anmelde-summary, #gv-anmelde-summary');
    if (tbodies.length === 0 || !window.currentGvData) return;
    
    if(window.currentGvData.length === 0) {
        tbodies.forEach(tb => {
            tb.innerHTML = '<tr><td colspan="2" class="text-center text-muted">Keine Daten gefunden.</td></tr>';
        });
        summaryDivs.forEach(sd => {
            sd.innerHTML = '';
        });
        return;
    }
    
    let countJa = 0;
    let countNein = 0;
    let countOffen = 0;
    let countEssen = 0;
    let countVegi = 0;

    const rowsHtml = window.currentGvData.map(a => {
        let badgeStr = '';
        if (a.status === 'ja') {
            let essenInfo = '';
            if (Number(a.essen) > 0 || Number(a.vegi) > 0) {
                let parts = [];
                if (Number(a.essen) > 0) parts.push(`${a.essen} Std`);
                if (Number(a.vegi) > 0) parts.push(`${a.vegi} Vegi`);
                essenInfo = ` (+Essen: ${parts.join(', ')})`;
            }
            badgeStr = `<span class="badge bg-success">Ja</span>${essenInfo}`;
            countJa++;
            if(a.essen > 0) countEssen += Number(a.essen);
            if(a.vegi > 0) countVegi += Number(a.vegi);
        }
        else if (a.status === 'nein') {
            const grundText = a.grund || a.reason ? ` <small class="text-muted fst-italic">💬 (${escapeHtml(a.grund || a.reason)})</small>` : '';
            badgeStr = `<span class="badge bg-danger">Nein</span>${grundText}`;
            countNein++;
        }
        else {
            badgeStr = `<span class="badge bg-secondary">Offen</span>`;
            countOffen++;
        }
        
        return `
        <tr>
            <td>${escapeHtml(a.name)}</td>
            <td>${badgeStr}</td>
        </tr>`;
    }).join('');

    tbodies.forEach(tb => {
        tb.innerHTML = rowsHtml;
    });

    const summaryHtml = `
        <div class="d-flex justify-content-between align-items-center bg-light p-2 rounded border mt-2">
            <span class="text-success fw-bold" style="font-size:0.85rem;"><i class="fas fa-check-circle"></i> Zugesagt: ${countJa}</span>
            <span class="text-danger fw-bold" style="font-size:0.85rem;"><i class="fas fa-times-circle"></i> Abgesagt: ${countNein}</span>
            <span class="text-secondary fw-bold" style="font-size:0.85rem;"><i class="fas fa-question-circle"></i> Offen: ${countOffen}</span>
            <span class="text-info fw-bold" style="font-size:0.85rem;"><i class="fas fa-utensils"></i> Essen Total: ${countEssen + countVegi} (Standard: ${countEssen}, Vegi: ${countVegi})</span>
        </div>
    `;

    summaryDivs.forEach(sd => {
        sd.innerHTML = summaryHtml;
    });
}

function getGVMemberMails() {
  if (gvState && gvState.vorstandMembers && gvState.vorstandMembers.length > 0) {
    return gvState.vorstandMembers;
  }
  // Fallback to legacy
  const arr = (gvState.members || []).map(m => ({
    name: (m.nachname + " " + m.vorname).trim() || m.name || m.email,
    email: m.e_mail || m.email || m.mailadresse
  })).filter(x => x.email);
  arr.sort((a,b) => a.name.localeCompare(b.name));
  return arr;
}
function addGVMail(idx, email) {
  if (!email) return;
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x=>x.trim()).filter(Boolean);
  if (!current.includes(email)) current.push(email);
  gvState.platzhalter[idx].inhalt = current.join('; ');
  renderGVList();
}
function removeGVMail(idx, email) {
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x=>x.trim()).filter(Boolean);
  gvState.platzhalter[idx].inhalt = current.filter(x => x !== email).join('; ');
  renderGVList();
}

async function runGVTool(toolName) {
    if (toolName === 'sendMails') {
        let hasDoc = false;
        const state = getGVState();
        if (state && Array.isArray(state.platzhalter)) {
            const item = state.platzhalter.find(p => {
                const name = String(p.platzhaltername || p.Platzhaltername || p[0] || '').toLowerCase();
                const appName = String(p.bezeichnung_app || p.Bezeichnung_App || '').toLowerCase();
                return name.includes('aktuelle_gv_einladung_dokument_id') || name.includes('einladung_dokument') || appName.includes('einladung');
            });
            if (item) {
                const val = String(item.inhalt || item.Inhalt || item[1] || '').trim();
                if (val) hasDoc = true;
            }
        }
        if (!hasDoc) {
            if (!confirm("⚠️ Achtung: Es ist kein Einladungs-PDF als Anhang hinterlegt.\n\nMöchtest du die Einladungs-Mails trotzdem OHNE PDF-Anhang versenden?")) {
                return;
            }
        } else {
            if (!confirm("Möchtest du die GV-Einladungs-Mails inkl. PDF-Anhang jetzt versenden?")) return;
        }
    } else {
        if(!confirm('Tool "'+toolName+'" starten?')) return;
    }

    try {
        let evId = "";
        const dropdown = document.getElementById('gv-event-selector');
        if(dropdown && dropdown.value) {
            evId = dropdown.value;
        }

        let payload = { action: 'runTool', tool: toolName, eventId: evId, user: localStorage.getItem('portal_user') };

        if (toolName === 'genPDF') {
            const sw1 = document.getElementById('gv-wahljahr-switch');
            const sw2 = document.getElementById('gv-wahljahr-switch-embedded');
            payload.isElectionYear = (sw1 && sw1.checked) || (sw2 && sw2.checked) || false;
        }

        // Pass participants data if it's sendSummary, sendPraesenz, or sendReminders
        if (toolName === 'sendSummary' || toolName === 'sendPraesenz' || toolName === 'sendReminders') {
            if (window.currentGvData) {
                payload.participants = window.currentGvData;
            }
        }

        const res = await apiFetch('termine', '', {
            method: 'POST', body: JSON.stringify(payload)
        });
        const data = await res.json();
        alert(data.success ? "✅ " + data.msg : "❌ Fehler: " + data.error);
    } catch(e) { alert("Netzwerkfehler: " + e); }
}

async function saveGVData(silent = false) {
  if (!silent && !confirm("GV-Änderungen speichern?")) return;
  const user = localStorage.getItem('portal_user') || "Admin";
  const stateToSave = getGVState();
  if (!stateToSave || !stateToSave.platzhalter) {
    if (!silent) alert("Fehler: Keine GV-Daten vorhanden.");
    return;
  }

  const sb = getGVSupabaseClient();

  // 1. Supabase-First Speicherung
  if (sb) {
    try {
      const getVal = (name) => {
        const item = stateToSave.platzhalter.find(p => (p.platzhaltername === name || p.bezeichnung_app === name));
        return item ? item.inhalt : null;
      };

      const parseDate = (dStr) => {
        if (!dStr) return null;
        if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
        const parts = dStr.split('.');
        if (parts.length === 3) {
          const d = parts[0].padStart(2, '0');
          const m = parts[1].padStart(2, '0');
          const y = parts[2];
          return `${y}-${m}-${d}`;
        }
        return null;
      };

      const customObj = {};
      stateToSave.platzhalter.forEach(p => {
        const k = p.platzhaltername || p.bezeichnung_app;
        if (k && !['Jahr der GV','Nummer der GV','Datum der GV','Uhrzeit der GV','Abmeldedatum','Mahndatum','Wahljahr','Verknüpfter Termin Event-ID','Link GV-Protokoll','Link Jahresrechnung','Link Budget','Link Traktandenliste','Mail Pruefbericht','Mail Jahresrechnung','Mail GV-Protokoll'].includes(k)) {
          customObj[k] = p.inhalt;
        }
      });

      const year = parseInt(getVal('Jahr der GV')) || new Date().getFullYear();
      const number = parseInt(getVal('Nummer der GV')) || 100;
      const eventDate = parseDate(getVal('Datum der GV'));
      const eventTime = getVal('Uhrzeit der GV') || '19:00';
      const abmeldeDate = parseDate(getVal('Abmeldedatum'));
      const mahnDate = parseDate(getVal('Mahndatum'));
      const isWahljahr = (getVal('Wahljahr') || '').toLowerCase().includes('ja') || !!stateToSave.is_wahljahr;
      const linkedEventId = getVal('Verknüpfter Termin Event-ID') || stateToSave.linked_event || null;

      const record = {
        gv_year: year,
        gv_number: number,
        event_date: eventDate,
        event_time: eventTime.length === 5 ? `${eventTime}:00` : eventTime,
        abmelde_schluss: abmeldeDate,
        mahn_datum: mahnDate,
        is_wahljahr: isWahljahr,
        linked_event_id: linkedEventId,
        protocol_doc_url: getVal('Link GV-Protokoll'),
        rechnung_doc_url: getVal('Link Jahresrechnung'),
        budget_doc_url: getVal('Link Budget'),
        traktanden_doc_url: getVal('Link Traktandenliste'),
        pruefbericht_mail: getVal('Mail Pruefbericht'),
        rechnung_mail: getVal('Mail Jahresrechnung'),
        protokoll_mail: getVal('Mail GV-Protokoll'),
        custom_placeholders: customObj,
        updated_at: new Date().toISOString()
      };

      const { data, error } = await sb.from('gv_instances').upsert(record, { onConflict: 'gv_year' }).select();
      if (error) throw error;

      console.log("⚡ [GV] Erfolgreich in Supabase gv_instances gespeichert:", data);
      if (typeof window.clearUnsaved === 'function') window.clearUnsaved();
      if (!silent) alert("✅ GV-Daten erfolgreich in Supabase gespeichert!");

      // 2. Asynchroner Non-Blocking Dual-Write zu Google Apps Script (DEAKTIVIERT - Supabase ist Single Source of Truth)
      /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
      const payload = {
        action: "saveAdminData",
        user: user,
        termine: stateToSave.termine || [],
        platzhalter: stateToSave.platzhalter,
        app_info: stateToSave.app_info || {},
        dropdowns: stateToSave.dropdowns || {},
        logDetails: "GV-Daten via Supabase aktualisiert (Dual-Write)"
      };

      apiFetch('termine', '', { method: 'POST', body: JSON.stringify(payload) })
        .then(res => res.json())
        .then(gasData => console.log("📡 [GV Dual-Write] Google Apps Script synchronisiert:", gasData))
        .catch(gasErr => console.warn("⚠️ [GV Dual-Write] Warnung: Google Apps Script Sync fehlgeschlagen (Supabase war erfolgreich):", gasErr));
      ------------------------------------------------------- */

      return;
    } catch (sbErr) {
      console.warn("⚠️ [GV] Supabase-Speichern fehlgeschlagen, falle zurück auf Google Apps Script:", sbErr);
      if (!silent) alert("⚠️ Supabase-Speichern fehlgeschlagen: " + sbErr.message + "\nVersuche Fallback auf Google Apps Script...");
    }
  }

  // 3. Fallback Google Apps Script
  const payload = {
    action: "saveAdminData",
    user: user,
    termine: stateToSave.termine,
    platzhalter: stateToSave.platzhalter,
    app_info: stateToSave.app_info,
    dropdowns: stateToSave.dropdowns,
    logDetails: "GV-Daten aktualisiert"
  };
  try {
    const res = await apiFetch('termine', '', { method: 'POST', body: JSON.stringify(payload) });
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch(e) { data = { error: "Ungueltige Server-Antwort" }; }
    
    if (data.status === 'success' || data.success) {
        if (typeof window.clearUnsaved === 'function') window.clearUnsaved();
        if (!silent) alert("✅ In Google Sheets gespeichert!");
    } else {
        if (!silent) alert("Fehler beim Speichern: " + (data.error || data.message || "Unbekannt"));
    }
  } catch(e) {
    if (!silent) alert("Netzwerk/Skript-Fehler: " + e);
  }
}

async function uploadGVDocumentFile(fileOrFileList, idx, inputId, statusId) {
    if (!fileOrFileList) return;
    const files = (fileOrFileList instanceof FileList || Array.isArray(fileOrFileList))
        ? Array.from(fileOrFileList)
        : [fileOrFileList];

    if (files.length === 0) return;

    const inputEl = document.getElementById(inputId);
    const statusEl = document.getElementById(statusId);

    // Reset hidden file input so re-selecting the same file always triggers onchange
    const fileInputId = inputId.replace('gv-doc-input', 'gv-file-upload');
    const fileInputEl = document.getElementById(fileInputId);
    if (fileInputEl) fileInputEl.value = '';

    if (statusEl) {
        statusEl.innerHTML = `<span class="text-primary"><i class="fas fa-spinner fa-spin me-1"></i> Lade ${files.length} Datei(en) hoch nach Google Drive...</span>`;
    }

    const state = getGVState();
    const item = (state && Array.isArray(state.platzhalter) && state.platzhalter[idx])
        ? state.platzhalter[idx]
        : null;

    const label = item ? (item.bezeichnung_app || item.platzhaltername || '') : '';
    const isMulti = label.toLowerCase().includes('anhänge');

    let uploadedIds = [];
    let uploadedNames = [];
    let errors = [];

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(file);
            });

            const res = await apiFetch('termine', '', {
                method: 'POST',
                body: JSON.stringify({
                    action: 'uploadGVDocument',
                    fileName: file.name,
                    mimeType: file.type || 'application/pdf',
                    base64: base64,
                    user: localStorage.getItem('portal_user') || 'Admin'
                })
            });
            const data = await res.json();

            if (data.success && data.fileId) {
                uploadedIds.push(data.fileId);
                uploadedNames.push(data.fileName || file.name);
            } else {
                errors.push(`${file.name}: ${data.error || 'Fehler'}`);
            }
        } catch(err) {
            errors.push(`${file.name}: ${err.message || 'Netzwerkfehler'}`);
        }
    }

    if (uploadedIds.length > 0) {
        let currentIds = [];
        let currentNames = [];

        if (item && item.inhalt) {
            currentIds = item.inhalt.split(',').map(x => x.trim()).filter(Boolean);
        } else if (inputEl && inputEl.value.trim()) {
            currentIds = inputEl.value.split(',').map(x => x.trim()).filter(Boolean);
        }

        const existingNamesStr = item ? (item.erklaerung || item.erklärung || item.erkl_rung || '') : '';
        if (existingNamesStr) {
            currentNames = existingNamesStr.split(';').map(x => x.trim()).filter(Boolean);
        }

        if (isMulti) {
            uploadedIds.forEach((id, nIdx) => {
                if (!currentIds.includes(id)) {
                    currentIds.push(id);
                    currentNames.push(uploadedNames[nIdx]);
                }
            });
        } else {
            currentIds = [uploadedIds[uploadedIds.length - 1]];
            currentNames = [uploadedNames[uploadedNames.length - 1]];
        }

        const finalIdsString = currentIds.join(', ');
        const finalNamesString = currentNames.join('; ');

        if (item) {
            item.inhalt = finalIdsString;
            item.erklaerung = finalNamesString;
            item.erklärung = finalNamesString;
            item.erkl_rung = finalNamesString;
        }
        if (inputEl) {
            inputEl.value = finalIdsString;
        }

        if (statusEl) {
            const badgesHtml = renderGVFileBadges(idx, finalIdsString, finalNamesString, inputId, statusId);
            statusEl.innerHTML = `${badgesHtml}
            <div class="text-primary small mt-1"><i class="fas fa-spinner fa-spin me-1"></i> Speichere automatisch in Google Sheets...</div>`;
        }

        // Automatisches Speichern in Google Sheets im Hintergrund!
        await saveGVData(true);

        if (statusEl) {
            const badgesHtml = renderGVFileBadges(idx, finalIdsString, finalNamesString, inputId, statusId);
            statusEl.innerHTML = `${badgesHtml}
            <div class="text-success small mt-1"><i class="fas fa-check-circle me-1"></i> '${escapeHtml(uploadedNames.join(', '))}' hochgeladen & in Google Sheets gespeichert!</div>`;
        }
    } else if (errors.length > 0 && statusEl) {
        statusEl.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Upload fehlgeschlagen: ${escapeHtml(errors.join('; '))}</span>`;
    }
}

function renderGVFileBadges(idx, idsString, namesString, inputId, statusId) {
    const ids = (idsString || '').split(',').map(x => x.trim()).filter(Boolean);
    const names = (namesString || '').split(';').map(x => x.trim()).filter(Boolean);
    if (ids.length === 0) return '';

    return '<div class="d-flex flex-wrap gap-1 mt-1 mb-1">' + ids.map((id, fIdx) => {
        const name = names[fIdx] || ('Datei ' + (fIdx + 1));
        return `<span class="badge bg-light text-dark border p-1.5 d-inline-flex align-items-center me-1 mb-1" style="font-size:0.82rem;">
            <i class="fas fa-file-pdf text-danger me-1"></i>
            <strong class="me-1" title="ID: ${escapeHtml(id)}">${escapeHtml(name)}</strong>
            <span class="text-danger ms-1 write-protected" style="cursor:pointer;font-weight:bold;" title="Datei entfernen" onclick="removeGVAttachment(${idx}, '${escapeJs(id)}', '${inputId}', '${statusId}')">&times;</span>
        </span>`;
    }).join('') + '</div>';
}

async function removeGVAttachment(idx, fileIdToRemove, inputId, statusId) {
    const state = getGVState();
    if (!state || !state.platzhalter || !state.platzhalter[idx]) return;
    const item = state.platzhalter[idx];

    let ids = (item.inhalt || '').split(',').map(x => x.trim()).filter(Boolean);
    let names = (item.erklaerung || item.erklärung || item.erkl_rung || '').split(';').map(x => x.trim()).filter(Boolean);

    const remIdx = ids.indexOf(fileIdToRemove);
    if (remIdx !== -1) {
        ids.splice(remIdx, 1);
        if (names[remIdx] !== undefined) {
            names.splice(remIdx, 1);
        }
    }

    const finalIds = ids.join(', ');
    const finalNames = names.join('; ');

    item.inhalt = finalIds;
    item.erklaerung = finalNames;
    item.erklärung = finalNames;
    item.erkl_rung = finalNames;

    const inputEl = document.getElementById(inputId);
    if (inputEl) inputEl.value = finalIds;

    const statusEl = document.getElementById(statusId);
    if (statusEl) {
        statusEl.innerHTML = renderGVFileBadges(idx, finalIds, finalNames, inputId, statusId);
    }

    await saveGVData(true);
}
