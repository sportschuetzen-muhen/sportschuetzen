// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - GENERALVERSAMMLUNGEN ===

let gvState = null;
let originalGvState = null;

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

/**
 * Wird aufgerufen, wenn Tab 4 "Erweitertes Controlling" geöffnet wird.
 * Lädt die GV-Stammdaten (falls noch nicht geladen) und baut die UI auf.
 */
async function initGVControllingTab() {
  if (gvState) {
    // Daten bereits geladen – nur UI neu rendern
    renderGVListEmbedded();
    fetchGVEventsEmbedded();
    return;
  }

  const listDiv = document.getElementById('gv-list-embedded');
  if (listDiv) {
    listDiv.innerHTML = '<div class="text-center p-3 text-muted"><div class="spinner-border spinner-border-sm text-primary mb-2"></div><div>Lade GV Daten...</div></div>';
  }

  try {
    let loadedAdminData = null;
    let loadedVorstandData = null;

    // Verwende vorverlegte Admin-Daten aus Cache falls vorhanden
    if (typeof adminState !== 'undefined' && adminState) {
      console.log("⚡ initGVControllingTab: Verwende vorverlegte Admin-Daten aus Cache...");
      loadedAdminData = JSON.parse(JSON.stringify(adminState));
    } else {
      const res = await apiFetch('termine', 'action=loadAdminData');
      const text = await res.text();
      try {
        loadedAdminData = JSON.parse(text);
      } catch (err) {
        console.error("Non-JSON Server response:", text);
        throw new Error("Ungültige Antwort vom Server (Google Apps Script). Bitte prüfe das Deployment in Google Apps Script.");
      }
    }

    // Berechne Vorstand aus vorverlegtem Cache falls vorhanden
    if (window._mglData && window._mglFunktionenCache) {
      console.log("⚡ initGVControllingTab: Berechne Vorstand aus vorverlegtem Cache...");
      const vorstandPNs = {};
      Object.entries(window._mglFunktionenCache).forEach(([pn, funcs]) => {
        funcs.forEach(f => {
          if (!String(f.OfficialFunctionExitDate || '').trim()) {
            const cat = String(f.OfficialFunctionCategory || '').toLowerCase();
            if (!cat.includes('hausmeister') && !cat.includes('hauswart')) {
              vorstandPNs[String(pn)] = true;
            }
          }
        });
      });
      loadedVorstandData = window._mglData
        .filter(m => vorstandPNs[String(m.PersonNumber)])
        .map(m => ({
          name: (String(m.FirstName || '') + " " + String(m.LastName || '')).trim() || m.PrimaryEmail,
          email: String(m.PrimaryEmail || m.Email || '').trim()
        }))
        .filter(x => x.email);
      loadedVorstandData.sort((a, b) => a.name.localeCompare(b.name));
    } else {
      const resVorstand = await apiFetch('mitglieder', 'action=getVorstand');
      const vorstandData = await resVorstand.json();
      loadedVorstandData = vorstandData.success ? vorstandData.data : [];
    }

    gvState = loadedAdminData;
    gvState.vorstandMembers = loadedVorstandData;
    originalGvState = JSON.parse(JSON.stringify(gvState));

    renderGVListEmbedded();
    fetchGVEventsEmbedded();
  } catch (e) {
    if (listDiv) {
      listDiv.innerHTML = '<div class="alert alert-danger">Fehler beim Laden: ' + escapeHtml(e.message) + '</div>';
    }
  }
}

/**
 * Rendert die Stammdaten/Platzhalter-Liste in den eingebetteten Container.
 * Wie renderGVList() aus gv.js, aber mit dem Embedded-Container-ID.
 */
function renderGVListEmbedded() {
  const list = document.getElementById('gv-list-embedded');
  if (!list || !gvState || !gvState.platzhalter) return;

  const pickPlaceholder = (label) => {
    const l = String(label || '').toLowerCase();
    if (l.includes('datum') && l.includes('gv') && l.includes('vorjahr')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('abmeldung')) return 'dd.mm.jjjj';
    if (l.includes('mahndatum')) return 'dd.mm.jjjj';
    if (l.includes('datum') && l.includes('gv')) return 'dd.mm.jjjj';
    if (l.includes('zeit') && l.includes('gv')) return 'hh:mm';
    if (l.includes('welche gv')) return '100';
    return '';
  };

  const isBudget = (label) => String(label || '').toLowerCase().includes('budget') || label.toLowerCase().includes('wort');
  const isMailField = (label) => String(label || '').toLowerCase().includes('mail');
  const isAttachment = (label) => ['anhänge', 'einladung', 'protokoll', 'jahresbericht', 'logo'].some(term => label.toLowerCase().includes(term));
  const isPresident = (label) => label.toLowerCase().includes('präsident') && !label.toLowerCase().includes('wort') && !label.toLowerCase().includes('bericht');
  const isTermin = (label) => label.toLowerCase().includes('datum') || label.toLowerCase().includes('zeit');

  const members = typeof getGVMemberMails === 'function' ? getGVMemberMails() : [];

  let htmlTermine = '';
  let htmlAllgemein = '';
  let htmlDocs = '';
  let htmlMails = '';

  gvState.platzhalter.forEach((p, i) => {
    const label = p.bezeichnung_app || p.platzhaltername || '';
    const ph = pickPlaceholder(label);
    const value = p.inhalt || '';
    
    let fieldHtml = '';

    if (isBudget(label)) {
      fieldHtml = '<div class="mb-3">' +
        '<label class="form-label small fw-bold mb-1">' + escapeHtml(label) + '</label>' +
        '<textarea class="form-control form-control-sm write-protected" rows="5" placeholder="Mehrzeiliger Text..." ' +
        'onchange="gvState.platzhalter[' + i + '].inhalt=this.value">' + escapeHtml(value) + '</textarea>' +
        '</div>';
    } else if (isMailField(label)) {
      const mails = value.split(';').map(x => x.trim()).filter(Boolean);
      const tags = mails.length
        ? mails.map(m => '<span style="background:#e9f2ff;color:#0d6efd;padding:2px 8px;border-radius:10px;font-size:.85rem;">' +
            escapeHtml(m) + ' <span style="color:#dc3545;cursor:pointer;" class="write-protected" onclick="removeGVMailEmbedded(' + i + ', \'' + escapeJs(m) + '\')">&times;</span></span>').join('')
        : '<span class="text-muted small">Keine</span>';
      const opts = members.map(mm => '<option value="' + escapeHtml(mm.email) + '">' + escapeHtml(mm.name) + '</option>').join('');
      fieldHtml = '<div class="mb-3 pb-2">' +
        '<label class="form-label small fw-bold mb-1">' + escapeHtml(label) + ' <span class="text-muted fw-normal" style="font-size:0.8em;">(nur Vorstandsmitglieder)</span></label>' +
        '<div class="tag-box mb-2" style="display:flex;flex-wrap:wrap;gap:6px;padding:6px;border:1px solid #ccc;border-radius:8px;min-height:40px;">' + tags + '</div>' +
        '<select class="form-select form-select-sm write-protected" onchange="addGVMailEmbedded(' + i + ', this.value); this.value=\'\'">' +
        '<option value="">+ Empfänger hinzufügen</option>' + opts + '</select></div>';
    } else if (isPresident(label)) {
      const opts = members.map(mm => '<option value="' + escapeHtml(mm.name) + '" ' + (value === mm.name ? 'selected' : '') + '>' + escapeHtml(mm.name) + '</option>').join('');
      fieldHtml = '<div class="mb-2">' +
        '<label class="form-label small fw-bold mb-0">' + escapeHtml(label) + ' <span class="text-muted fw-normal" style="font-size:0.8em;">(nur Vorstandsmitglieder)</span></label>' +
        '<div class="input-group input-group-sm"><input type="text" class="form-control write-protected" value="' + escapeHtml(value) + '" placeholder="Name manuell..." onchange="gvState.platzhalter[' + i + '].inhalt=this.value">' +
        '<select class="form-select write-protected" style="max-width:200px;" onchange="gvState.platzhalter[' + i + '].inhalt=this.value; renderGVListEmbedded();"><option value="">-- Wählen --</option>' + opts + '</select></div>' +
        '</div>';
    } else if (label.toLowerCase() === 'logo') {
      fieldHtml = '<div class="mb-3 border rounded p-2 bg-light">' +
        '<div class="d-flex justify-content-between align-items-center mb-1"><label class="form-label small fw-bold mb-0 text-muted">' + escapeHtml(label) + ' (Geschützt)</label>' +
        '<button class="btn btn-xs btn-outline-secondary py-0" onclick="document.getElementById(\'gv-logo-edit-' + i + '\').classList.toggle(\'d-none\')"><i class="fas fa-lock-open"></i> Ändern</button></div>' +
        '<div id="gv-logo-edit-' + i + '" class="d-none mt-2"><input type="text" class="form-control form-control-sm write-protected" value="' + escapeHtml(value) + '" onchange="gvState.platzhalter[' + i + '].inhalt=this.value"></div>' +
        '</div>';
    } else {
      const isDateField = ph === 'dd.mm.jjjj';
      const displayValue = isDateField ? isoToDisplay(value) : value;
      const isDocAttachment = ['dokument', 'anhänge', 'einladung', 'protokoll', 'jahresbericht'].some(t => label.toLowerCase().includes(t));
      let hint = '';
      if (label.toLowerCase().includes('anhänge')) {
          hint = '<div class="form-text text-info" style="font-size:0.75rem;"><i class="fas fa-info-circle"></i> Bei mehreren Anhängen diese mit Komma trennen.</div>';
      }
      if (isDocAttachment) {
        const fileBadges = typeof renderGVFileBadges === 'function' ? renderGVFileBadges(i, value, p.erklaerung || p.erklärung || p.erkl_rung || '', 'gv-doc-input-emb-' + i, 'gv-doc-status-emb-' + i) : '';
        
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

        fieldHtml = '<div class="mb-3">' +
          '<label class="form-label small fw-bold mb-1">' + escapeHtml(label) + ' <span class="badge bg-primary text-white ms-1" style="font-size:0.65rem;"><i class="fas fa-paperclip me-1"></i> E-Mail-Anhang</span></label>' +
          '<div class="input-group input-group-sm">' +
          '<input type="text" id="gv-doc-input-emb-' + i + '" class="form-control form-control-sm write-protected"' +
          ' value="' + escapeHtml(displayValue) + '" placeholder="' + escapeHtml(ph || 'Drive ID / Link eintragen oder Datei uploaden...') + '"' +
          ' onchange="gvState.platzhalter[' + i + '].inhalt = this.value">' +
          '<button class="btn btn-outline-primary write-protected" type="button" onclick="document.getElementById(\'gv-file-upload-emb-' + i + '\').click()">' +
          '<i class="fas fa-cloud-upload-alt me-1"></i> Upload</button>' +
          '</div>' +
          '<input type="file" id="gv-file-upload-emb-' + i + '" class="d-none" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg" multiple onchange="uploadGVDocumentFile(this.files, ' + i + ', \'gv-doc-input-emb-' + i + '\', \'gv-doc-status-emb-' + i + '\')">' +
          '<div id="gv-doc-status-emb-' + i + '" class="small mt-1 text-muted">' + fileBadges + '</div>' +
          docHint +
          '</div>';
      } else {
        fieldHtml = '<div class="mb-2">' +
          '<label class="form-label small fw-bold mb-0">' + escapeHtml(label) + '</label>' +
          '<input type="text" class="form-control form-control-sm write-protected"' +
          ' value="' + escapeHtml(displayValue) + '" placeholder="' + escapeHtml(ph) + '"' +
          ' onchange="gvState.platzhalter[' + i + '].inhalt = ' + (isDateField ? 'displayToIso(this.value)' : 'this.value') + '">' +
          hint +
          '</div>';
      }
    }

    if (isTermin(label)) {
        htmlTermine += fieldHtml;
    } else if (isAttachment(label)) {
        htmlDocs += fieldHtml;
    } else if (isMailField(label)) {
        htmlMails += fieldHtml;
    } else {
        htmlAllgemein += fieldHtml;
    }
  });

  list.innerHTML = `
    <div class="mb-4">
        <h6 class="border-bottom pb-1 text-primary">Allgemeine Infos</h6>
        ${htmlAllgemein}
    </div>
    <div class="mb-4">
        <h6 class="border-bottom pb-1 text-primary">Termine & Fristen</h6>
        ${htmlTermine}
    </div>
    <div class="mb-4">
        <h6 class="border-bottom pb-1 text-primary">Dokumente & Anhänge</h6>
        <div class="alert alert-info py-2 px-3 mb-3 small border-0 text-dark" style="background:#eef6ff; border-left: 4px solid #0d6efd !important;">
          <i class="fas fa-paperclip text-primary me-1"></i> <strong>E-Mail-Anhänge:</strong> Alle hier hochgeladenen Dokumente (Einladung, Zusatz-Anhänge, Protokoll, Jahresbericht) werden beim Versenden der GV-Einladung automatisch als E-Mail-Anhänge an die Mitglieder verschickt.
        </div>
        ${htmlDocs}
    </div>
    <div class="mb-2">
        <h6 class="border-bottom pb-1 text-primary">Mail-Verteiler</h6>
        ${htmlMails}
    </div>
  `;
}

function addGVMailEmbedded(idx, email) {
  if (!email) return;
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x => x.trim()).filter(Boolean);
  if (!current.includes(email)) current.push(email);
  gvState.platzhalter[idx].inhalt = current.join('; ');
  renderGVListEmbedded();
}

function removeGVMailEmbedded(idx, email) {
  window.markUnsaved();
  const current = (gvState.platzhalter[idx].inhalt || '').split(';').map(x => x.trim()).filter(Boolean);
  gvState.platzhalter[idx].inhalt = current.filter(x => x !== email).join('; ');
  renderGVListEmbedded();
}

function fetchGVEventsEmbedded() {
  const selectors = document.querySelectorAll('.gv-event-selector, #gv-event-selector');
  if (selectors.length === 0) return;
  
  // Nur Events, die KEIN externes Gruppenschiessen sind (z.B. GV, Vereinsanlässe)
  const events = (umfragenState || []).filter(e => !isTrue(e.schiessanlass));
  const html = '<option value="">-- Bitte wählen --</option>' +
    events.map(e => '<option value="' + escapeHtml(e.id) + '"' +
      (gvState.linked_event === e.id ? ' selected' : '') + '>' +
      escapeHtml(e.title) + ' (' + formatSwissDate(e.datum) + ')</option>').join('');
      
  selectors.forEach(selector => {
    selector.innerHTML = html;
  });
  
  if (gvState.linked_event) {
    loadGVParticipants(gvState.linked_event);
  }
}

async function loadGVParticipants(eventId) {
    if(!eventId) return;
    
    // Speichere die Auswahl im State
    if (!gvState) gvState = getGVState() || {};
    gvState.linked_event = eventId;
    window.markUnsaved();
    
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
        if (hasCache) {
            console.log("⚡ loadGVParticipants: Verwende Cache...");
            pData = window._gvParticipantsCache[eventId];
        } else {
            // Wir nutzen die Backend-API "getGVStatus", die uns Ja, Nein und Offen liefert
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

window.gvStatusFilter = 'alle';
window.gvSearchQuery = '';

function reloadGVParticipants() {
    const dropdown = document.getElementById('gv-event-selector') || document.querySelector('.gv-event-selector');
    const evId = dropdown ? dropdown.value : (gvState ? gvState.linked_event : null);
    if (evId) {
        if (window._gvParticipantsCache) delete window._gvParticipantsCache[evId];
        loadGVParticipants(evId);
    }
}

function setGvStatusFilter(status, btn) {
    window.gvStatusFilter = status;
    const group = document.getElementById('gv-status-filter-group');
    if (group) {
        group.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    }
    if (btn) btn.classList.add('active');
    renderGvTableBody();
}

function filterGvTable() {
    const input = document.getElementById('gv-search-input');
    window.gvSearchQuery = input ? input.value.trim().toLowerCase() : '';
    renderGvTableBody();
}

function resolveGvMemberLizenz(item) {
    if (!item) return '';
    if (item.lizenz && String(item.lizenz).trim()) {
        let liz = String(item.lizenz).trim();
        return liz.length <= 6 ? liz.padStart(6, '0') : liz;
    }

    if (window._mglData && Array.isArray(window._mglData)) {
        const itemFull = String(item.name || '').trim().toLowerCase();
        const itemVor = String(item.vorname || '').trim().toLowerCase();
        const itemNach = String(item.nachname || '').trim().toLowerCase();
        
        const matched = window._mglData.find(m => {
            const mNach = String(m.LastName || '').trim().toLowerCase();
            const mVor = String(m.FirstName || '').trim().toLowerCase();
            const mFull = `${mNach} ${mVor}`.trim();
            const mFullAlt = `${mVor} ${mNach}`.trim();
            
            if (itemVor && itemNach && mVor === itemVor && mNach === itemNach) return true;
            if (itemFull && (mFull === itemFull || mFullAlt === itemFull)) return true;
            return false;
        });

        if (matched) {
            const pin = String(matched.AddressNumber || matched.PersonNumber || '').trim();
            if (pin) return pin.length <= 6 ? pin.padStart(6, '0') : pin;
        }
    }

    if (typeof membersLookup !== 'undefined' && membersLookup) {
        for (const key of Object.keys(membersLookup)) {
            const m = membersLookup[key];
            const mFull = `${m.LastName || ''} ${m.FirstName || ''}`.trim().toLowerCase();
            if (mFull === String(item.name || '').trim().toLowerCase()) {
                const pin = String(m.AddressNumber || m.PersonNumber || key).trim();
                return pin.length <= 6 ? pin.padStart(6, '0') : pin;
            }
        }
    }

    return '';
}

function sortGvTable(field) {
    if (!window.currentGvData) return;
    window.gvSortDir = window.gvSortDir || { name: 1, status: 1 };
    window.gvSortDir[field] = (window.gvSortDir[field] || 1) * -1;
    const dir = window.gvSortDir[field];
    
    window.currentGvData.sort((a, b) => {
        let valA = String(a[field] || '').toLowerCase();
        let valB = String(b[field] || '').toLowerCase();
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
    
    if (window.currentGvData.length === 0) {
        tbodies.forEach(tb => {
            tb.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Keine Daten gefunden.</td></tr>';
        });
        summaryDivs.forEach(sd => {
            sd.innerHTML = '';
        });
        return;
    }
    
    // 1. Totale immer über den gesamten Datensatz berechnen
    let countJa = 0;
    let countNein = 0;
    let countOffen = 0;
    let countEssen = 0;
    let countVegi = 0;

    window.currentGvData.forEach(a => {
        const st = String(a.status || '').toLowerCase().trim();
        if (st === 'ja' || st === 'true' || st === '1') {
            countJa++;
            if (Number(a.essen) > 0) countEssen += Number(a.essen);
            if (Number(a.vegi) > 0) countVegi += Number(a.vegi);
        } else if (st === 'nein' || st === 'false' || st === '0') {
            countNein++;
        } else {
            countOffen++;
        }
    });

    // 2. Filter-Buttons beschriften mit Zähler
    const btnAlle = document.getElementById('gv-filter-alle');
    const btnJa = document.getElementById('gv-filter-ja');
    const btnNein = document.getElementById('gv-filter-nein');
    const btnOffen = document.getElementById('gv-filter-offen');
    if (btnAlle) btnAlle.innerText = `Alle (${window.currentGvData.length})`;
    if (btnJa) btnJa.innerText = `Ja (${countJa})`;
    if (btnNein) btnNein.innerText = `Nein (${countNein})`;
    if (btnOffen) btnOffen.innerText = `Offen (${countOffen})`;

    // 3. Daten filtern nach Suchtext und Status
    const query = (window.gvSearchQuery || '').toLowerCase().trim();
    const activeFilter = window.gvStatusFilter || 'alle';

    const filteredData = window.currentGvData.filter(a => {
        const st = String(a.status || '').toLowerCase().trim();
        const normSt = (st === 'ja' || st === 'true' || st === '1') ? 'ja' : ((st === 'nein' || st === 'false' || st === '0') ? 'nein' : 'offen');
        
        if (activeFilter !== 'alle' && normSt !== activeFilter) return false;

        if (query) {
            const nameStr = String(a.name || '').toLowerCase();
            const grundStr = String(a.grund || a.reason || '').toLowerCase();
            if (!nameStr.includes(query) && !grundStr.includes(query)) return false;
        }
        return true;
    });

    if (filteredData.length === 0) {
        tbodies.forEach(tb => {
            tb.innerHTML = '<tr><td colspan="3" class="text-center text-muted py-3">Keine passenden Einträge für diese Filterkriterien.</td></tr>';
        });
    } else {
        const rowsHtml = filteredData.map(a => {
            const st = String(a.status || '').toLowerCase().trim();
            const isJa = (st === 'ja' || st === 'true' || st === '1');
            const isNein = (st === 'nein' || st === 'false' || st === '0');

            let badgeStr = '';
            if (isJa) {
                let essenInfo = '';
                if (Number(a.essen) > 0 || Number(a.vegi) > 0) {
                    let parts = [];
                    if (Number(a.essen) > 0) parts.push(`${a.essen} Std`);
                    if (Number(a.vegi) > 0) parts.push(`${a.vegi} Vegi`);
                    essenInfo = ` <span class="text-dark small ms-1">(Essen: ${parts.join(', ')})</span>`;
                }
                badgeStr = `<span class="badge bg-success">Ja</span>${essenInfo}`;
            } else if (isNein) {
                const rawReason = (a.grund || a.reason || '').toString().trim();
                const grundText = rawReason ? ` <small class="text-muted fst-italic">💬 (${escapeHtml(rawReason)})</small>` : '';
                badgeStr = `<span class="badge bg-danger">Nein</span>${grundText}`;
            } else {
                badgeStr = `<span class="badge bg-secondary">Offen</span>`;
            }

            const escName = escapeJs(a.name);
            
            // Aktionsbuttons
            let actionBtns = '';
            if (!isJa && !isNein) {
                // Status Offen: Schnelle Abmeldung (Mail) + Bearbeiten
                actionBtns = `
                    <div class="d-flex justify-content-end gap-1">
                        <button type="button" class="btn btn-outline-danger btn-xs py-0 px-1.5 write-protected" style="font-size:0.75rem;" title="Direkt als E-Mail-Abmeldung erfassen" onclick="openGvQuickAbmelden('${escName}')">
                            <i class="fas fa-envelope-open-text me-1"></i>Abmelden
                        </button>
                        <button type="button" class="btn btn-outline-secondary btn-xs py-0 px-1 write-protected" style="font-size:0.75rem;" title="Teilnahme manuell erfassen" onclick="openGvEditModal('${escName}')">
                            <i class="fas fa-edit"></i>
                        </button>
                    </div>
                `;
            } else {
                // Bereits beantwortet: Ändern Button
                actionBtns = `
                    <div class="d-flex justify-content-end">
                        <button type="button" class="btn btn-outline-primary btn-xs py-0 px-2 write-protected" style="font-size:0.75rem;" title="Antwort / Essen / Grund anpassen" onclick="openGvEditModal('${escName}')">
                            <i class="fas fa-edit me-1"></i>Ändern
                        </button>
                    </div>
                `;
            }

            return `
            <tr>
                <td><strong>${escapeHtml(a.name)}</strong></td>
                <td>${badgeStr}</td>
                <td class="text-end">${actionBtns}</td>
            </tr>`;
        }).join('');

        tbodies.forEach(tb => {
            tb.innerHTML = rowsHtml;
        });
    }

    const essenSummaryBadge = (countEssen + countVegi > 0)
        ? `<span class="text-info fw-bold" style="font-size:0.85rem;"><i class="fas fa-utensils"></i> Essen Total: ${countEssen + countVegi} (Standard: ${countEssen}, Vegi: ${countVegi})</span>`
        : '';

    const summaryHtml = `
        <div class="d-flex justify-content-between align-items-center bg-light p-2 rounded border mt-2 flex-wrap gap-2">
            <span class="text-success fw-bold" style="font-size:0.85rem;"><i class="fas fa-check-circle"></i> Zugesagt: ${countJa}</span>
            <span class="text-danger fw-bold" style="font-size:0.85rem;"><i class="fas fa-times-circle"></i> Abgesagt: ${countNein}</span>
            <span class="text-secondary fw-bold" style="font-size:0.85rem;"><i class="fas fa-question-circle"></i> Offen: ${countOffen}</span>
            ${essenSummaryBadge}
        </div>
    `;

    summaryDivs.forEach(sd => {
        sd.innerHTML = summaryHtml;
    });
}

function openGvQuickAbmelden(memberName) {
    openGvEditModal(memberName, 'nein', 'Abmeldung via E-Mail');
}

function openGvEditModal(memberName, forceStatus = null, forceReason = null) {
    if (!window.currentGvData) return;
    const member = window.currentGvData.find(m => String(m.name).trim() === String(memberName).trim());
    if (!member) {
        alert("Mitglied konnte nicht gefunden werden: " + memberName);
        return;
    }

    const modalEl = document.getElementById('gv-manual-rsvp-modal');
    if (!modalEl) return;

    // Lizenz ermitteln
    const lizenz = resolveGvMemberLizenz(member);

    document.getElementById('gv-rsvp-member-name').value = member.name;
    document.getElementById('gv-rsvp-member-lizenz').value = lizenz;
    document.getElementById('gv-rsvp-display-name').innerText = member.name;
    document.getElementById('gv-rsvp-display-meta').innerText = lizenz ? `Lizenz / PIN: ${lizenz}` : 'Lizenz: nicht in DB gefunden';

    // Badge für aktuellen Status
    const curBadge = document.getElementById('gv-rsvp-current-badge');
    const curSt = String(member.status || '').toLowerCase().trim();
    if (curSt === 'ja' || curSt === 'true' || curSt === '1') {
        curBadge.innerHTML = '<span class="badge bg-success">Aktuell: Ja</span>';
    } else if (curSt === 'nein' || curSt === 'false' || curSt === '0') {
        curBadge.innerHTML = '<span class="badge bg-danger">Aktuell: Nein</span>';
    } else {
        curBadge.innerHTML = '<span class="badge bg-secondary">Aktuell: Offen</span>';
    }

    // Status vorbelegen
    let targetStatus = forceStatus || (curSt === 'ja' || curSt === 'nein' ? curSt : 'nein');
    
    // Radios setzen
    const radioNein = document.getElementById('gv-radio-nein');
    const radioJa = document.getElementById('gv-radio-ja');
    const radioOffen = document.getElementById('gv-radio-offen');

    if (targetStatus === 'ja') radioJa.checked = true;
    else if (targetStatus === 'offen') radioOffen.checked = true;
    else radioNein.checked = true;

    onGvStatusRadioChanged(targetStatus);

    // Grund vorbelegen
    const presetSelect = document.getElementById('gv-rsvp-reason-preset');
    const customInput = document.getElementById('gv-rsvp-reason-custom');
    const initialReason = forceReason || (member.grund || member.reason || 'Abmeldung via E-Mail');

    let matchedPreset = false;
    for (let opt of presetSelect.options) {
        if (opt.value === initialReason) {
            presetSelect.value = opt.value;
            matchedPreset = true;
            break;
        }
    }
    if (!matchedPreset && initialReason) {
        presetSelect.value = 'custom';
    }
    customInput.value = initialReason;

    // Essenswahl vorbelegen
    document.getElementById('gv-rsvp-count').value = Number(member.count) || 1;
    document.getElementById('gv-rsvp-essen').value = member.essen !== undefined && member.essen !== "" ? Number(member.essen) : 1;
    document.getElementById('gv-rsvp-vegi').value = member.vegi !== undefined && member.vegi !== "" ? Number(member.vegi) : 0;

    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

function onGvStatusRadioChanged(status) {
    const secNein = document.getElementById('gv-rsvp-section-nein');
    const secJa = document.getElementById('gv-rsvp-section-ja');
    const secOffen = document.getElementById('gv-rsvp-section-offen');

    if (secNein) secNein.classList.toggle('d-none', status !== 'nein');
    if (secJa) secJa.classList.toggle('d-none', status !== 'ja');
    if (secOffen) secOffen.classList.toggle('d-none', status !== 'offen');
}

function onGvReasonPresetChanged(presetVal) {
    const customInput = document.getElementById('gv-rsvp-reason-custom');
    if (!customInput) return;
    if (presetVal !== 'custom') {
        customInput.value = presetVal;
    } else {
        customInput.value = '';
        customInput.focus();
    }
}

async function submitGvManualRSVP() {
    const name = document.getElementById('gv-rsvp-member-name').value;
    const lizenz = document.getElementById('gv-rsvp-member-lizenz').value;
    const saveBtn = document.getElementById('gv-rsvp-save-btn');
    const modalEl = document.getElementById('gv-manual-rsvp-modal');

    const state = getGVState();
    const eventId = state ? state.linked_event : null;

    if (!eventId) {
        alert("Fehler: Kein verknüpftes GV-Event ausgewählt.");
        return;
    }
    if (!lizenz) {
        alert(`Fehler: Für '${name}' konnte keine Lizenznummer / PIN gefunden werden. Bitte prüfe die Mitglieder-Datenbank.`);
        return;
    }

    const selectedRadio = document.querySelector('input[name="gv-rsvp-status-radio"]:checked');
    const statusVal = selectedRadio ? selectedRadio.value : 'nein';

    let attendingParam = 'false';
    let countVal = 1;
    let essenVal = 0;
    let vegiVal = 0;
    let grundVal = '';

    if (statusVal === 'ja') {
        attendingParam = 'true';
        countVal = parseInt(document.getElementById('gv-rsvp-count').value, 10) || 1;
        essenVal = parseInt(document.getElementById('gv-rsvp-essen').value, 10) || 0;
        vegiVal = parseInt(document.getElementById('gv-rsvp-vegi').value, 10) || 0;
    } else if (statusVal === 'nein') {
        attendingParam = 'false';
        grundVal = document.getElementById('gv-rsvp-reason-custom').value.trim() || 'Abmeldung';
    } else if (statusVal === 'offen') {
        attendingParam = 'offen'; // bzw. delete
    }

    const originalBtnText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Speichern...';

    try {
        const payload = {
            action: 'setRSVP',
            eventid: String(eventId),
            lizenz: lizenz,
            attending: attendingParam,
            count: countVal,
            essen: essenVal,
            vegi: vegiVal,
            grund: grundVal
        };

        const res = await apiFetch('umfragen', payload, 'POST');
        const data = await res.json();

        if (data.error) {
            throw new Error(data.error);
        }

        // Lokalen State in window.currentGvData aktualisieren
        if (window.currentGvData) {
            const memberItem = window.currentGvData.find(m => String(m.name).trim() === String(name).trim());
            if (memberItem) {
                memberItem.status = (statusVal === 'offen') ? 'offen' : statusVal;
                memberItem.grund = grundVal;
                memberItem.count = countVal;
                memberItem.essen = essenVal;
                memberItem.vegi = vegiVal;
                memberItem.lizenz = lizenz;
            }
        }

        // Cache aktualisieren / invalidieren
        if (window._gvParticipantsCache && window._gvParticipantsCache[eventId]) {
            window._gvParticipantsCache[eventId] = window.currentGvData;
        }

        renderGvTableBody();

        bootstrap.Modal.getInstance(modalEl)?.hide();

        const toastMsg = (statusVal === 'nein')
            ? `✅ '${name}' erfolgreich als abgemeldet erfasst (${grundVal}).`
            : ((statusVal === 'ja') ? `✅ '${name}' erfolgreich angemeldet!` : `✅ Status von '${name}' auf 'Offen' zurückgesetzt.`);
        
        console.log("GV Manual RSVP success:", toastMsg);

    } catch (err) {
        alert("Fehler beim Speichern der Teilnahme: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalBtnText;
    }
}

function getGVMemberMails() {
  if (gvState && gvState.vorstandMembers && gvState.vorstandMembers.length > 0) {
    return gvState.vorstandMembers;
  }
  const arr = (gvState && gvState.members ? gvState.members : []).map(m => ({
    name: (m.nachname + " " + m.vorname).trim() || m.name || m.email,
    email: m.e_mail || m.email || m.mailadresse
  })).filter(x => x.email);
  arr.sort((a,b) => a.name.localeCompare(b.name));
  return arr;
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
  if (!silent && !confirm("GV-Aenderungen speichern?")) return;
  const user = localStorage.getItem('portal_user') || "Admin";
  const stateToSave = getGVState();
  if (!stateToSave || !stateToSave.platzhalter) {
    if (!silent) alert("Fehler: Keine GV-Daten vorhanden.");
    return;
  }
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
        if (!silent) alert("✅ Gespeichert!");
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

// === GV EINLADUNGS-MAIL ASSISTENT & TEXT-GENERATOR ===

function getGVMailTextFromState() {
  const state = getGVState();
  if (!state || !Array.isArray(state.platzhalter)) return "";
  const item = state.platzhalter.find(p => {
    const name = String(p.platzhaltername || p.Platzhaltername || p[0] || '').toLowerCase();
    const appName = String(p.bezeichnung_app || p.Bezeichnung_App || '').toLowerCase();
    return name.includes('mail_einladungstext') || appName.includes('einladungstext');
  });
  return item ? (item.inhalt || item.Inhalt || item[1] || '') : '';
}

function setGVMailTextInState(text) {
  if (!gvState) gvState = getGVState() || {};
  if (!Array.isArray(gvState.platzhalter)) gvState.platzhalter = [];

  let item = gvState.platzhalter.find(p => {
    const name = String(p.platzhaltername || p.Platzhaltername || p[0] || '').toLowerCase();
    const appName = String(p.bezeichnung_app || p.Bezeichnung_App || '').toLowerCase();
    return name.includes('mail_einladungstext') || appName.includes('einladungstext');
  });

  if (item) {
    item.inhalt = text;
  } else {
    gvState.platzhalter.push({
      platzhaltername: "{{Mail_Einladungstext}}",
      bezeichnung_app: "Mail Einladungstext",
      inhalt: text
    });
  }
  window.markUnsaved();
}

function openGVMailWizard() {
  const state = getGVState();
  if (!state) {
    alert("GV-Daten sind noch nicht geladen. Bitte kurz warten oder Seite neu laden.");
    return;
  }

  // Linked Event ermitteln
  let evTitle = "Generalversammlung";
  let evDatum = "";
  let evZeit = "19:30";
  
  if (state.linked_event && Array.isArray(umfragenState)) {
    const ev = umfragenState.find(e => String(e.id) === String(state.linked_event));
    if (ev) {
      evTitle = ev.title || evTitle;
      evDatum = formatSwissDateWithWeekday(ev.datum);
    }
  }

  // Fallback aus Platzhaltern
  if (!evDatum && Array.isArray(state.platzhalter)) {
    const datumItem = state.platzhalter.find(p => String(p.platzhaltername || p.bezeichnung_app || '').toLowerCase().includes('datum'));
    if (datumItem) evDatum = datumItem.inhalt || '';
    const zeitItem = state.platzhalter.find(p => String(p.platzhaltername || p.bezeichnung_app || '').toLowerCase().includes('zeit'));
    if (zeitItem) evZeit = zeitItem.inhalt || '19:30';
  }

  const titleEl = document.getElementById('gv-modal-event-title');
  if (titleEl) titleEl.innerText = evTitle;

  const detailsEl = document.getElementById('gv-modal-event-details');
  if (detailsEl) detailsEl.innerHTML = `📅 <b>Wann:</b> ${escapeHtml(evDatum || 'Datum gemäss Einladung')} um ${escapeHtml(evZeit)} Uhr &nbsp;|&nbsp; 📍 <b>Wo:</b> Schützenhaus Muhen`;

  // Anhang Status prüfen
  let hasDoc = false;
  let docNames = [];
  if (Array.isArray(state.platzhalter)) {
    const docItem = state.platzhalter.find(p => {
      const name = String(p.platzhaltername || p.bezeichnung_app || '').toLowerCase();
      return name.includes('einladung_dokument') || name.includes('aktuelle_gv_einladung');
    });
    if (docItem && docItem.inhalt && docItem.inhalt.trim()) {
      hasDoc = true;
      docNames.push(docItem.erklaerung || 'Einladungs-PDF');
    }
  }

  const statusEl = document.getElementById('gv-modal-attachment-status');
  if (statusEl) {
    if (hasDoc) {
      statusEl.innerHTML = `<span class="badge bg-success py-1.5 px-2.5"><i class="fas fa-check-circle me-1"></i> ${escapeHtml(docNames.join(', '))} angehängt</span>`;
    } else {
      statusEl.innerHTML = `<span class="badge bg-warning text-dark py-1.5 px-2.5"><i class="fas fa-exclamation-triangle me-1"></i> Achtung: Kein Einladungs-PDF hinterlegt</span>`;
    }
  }

  // Text laden
  const savedText = getGVMailTextFromState();
  const textInput = document.getElementById('gv-custom-mailtext');
  if (textInput) {
    textInput.value = savedText || "wir laden dich herzlich zur ordentlichen Generalversammlung der Sportschützen Muhen ein. Alle relevanten Unterlagen, Jahresberichte und die Traktandenliste findest du direkt im Anhang dieser E-Mail sowie in der Web-App:";
  }

  updateGVMailPreview();

  const modalEl = document.getElementById('gv-mail-modal');
  if (modalEl && typeof bootstrap !== 'undefined') {
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
  }
}

function applyGVMailTemplate(type) {
  const textInput = document.getElementById('gv-custom-mailtext');
  if (!textInput) return;

  if (type === 'standard') {
    textInput.value = "wir laden dich herzlich zur ordentlichen Generalversammlung der Sportschützen Muhen ein. Alle relevanten Unterlagen, Jahresberichte und die Traktandenliste findest du direkt im Anhang dieser E-Mail sowie in der Web-App:";
  } else if (type === 'festlich') {
    textInput.value = "ein sportlich erfolgreiches und geselliges Vereinsjahr liegt hinter uns! Wir freuen uns sehr, dich zur diesjährigen Generalversammlung begrüssen zu dürfen und gemeinsam auf die Höhepunkte zurückzublicken sowie das neue Vereinsjahr einzuläuten:";
  } else if (type === 'wahljahr') {
    textInput.value = "wir laden dich herzlich zur ordentlichen Generalversammlung ein. In diesem Vereinsjahr stehen zukunftsweisende Gesamterneuerungswahlen des Vorstands sowie wichtige Weichenstellungen auf der Traktandenliste. Deine Stimme und Teilnahme sind uns besonders wichtig:";
  }

  updateGVMailPreview();
  if (typeof showToast === 'function') showToast("Vorlage übernommen!", "info");
}

function updateGVMailPreview() {
  const textInput = document.getElementById('gv-custom-mailtext');
  const previewBody = document.getElementById('gv-mail-preview-body');
  if (!previewBody) return;

  const rawText = textInput ? textInput.value : "";
  const formattedText = escapeHtml(rawText).replace(/\n/g, "<br>");

  const state = getGVState();
  let evTitle = "Generalversammlung";
  if (state && state.linked_event && Array.isArray(umfragenState)) {
    const ev = umfragenState.find(e => String(e.id) === String(state.linked_event));
    if (ev && ev.title) evTitle = ev.title;
  }

  previewBody.innerHTML = `
    <div style="background: #ffffff; border: 1px solid #dee2e6; border-radius: 8px; padding: 18px; font-family: Arial, sans-serif; color: #2d3748; line-height: 1.6;">
      <div style="display: flex; align-items: center; margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #edf2f7;">
        <img src="https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-512.png" width="36" height="36" style="border-radius: 6px; margin-right: 12px;">
        <div style="font-weight: bold; font-size: 14px; color: #1a365d;">Sportschützen Muhen – Einladung</div>
      </div>
      <div style="font-size: 15px; font-weight: bold; margin-bottom: 10px; color: #1a202c;">Hallo [Vorname],</div>
      <p style="margin-bottom: 15px; font-size: 14px;">${formattedText || '<span class="text-muted fst-italic">[Hier erscheint dein Begleittext]</span>'}</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #0d6efd; padding: 12px 16px; border-radius: 6px; margin-bottom: 15px;">
        <div style="font-weight: bold; color: #c53030; font-size: 15px; margin-bottom: 4px;">🎯 ${escapeHtml(evTitle)}</div>
        <div style="font-size: 13px; margin-bottom: 2px;">📅 <b>Wann:</b> gemäss Programm / 📍 <b>Wo:</b> Schützenhaus Muhen</div>
        <div style="font-size: 13px;">📄 <b>Dokumente:</b> Einladung, Protokoll & Jahresbericht im E-Mail-Anhang</div>
      </div>

      <div style="background-color: #ebf8ff; padding: 10px 14px; border-radius: 6px; border-left: 4px solid #3182ce; font-size: 13px;">
        📱 <b>Rückmeldung:</b> Bitte gib uns deine Zu- oder Absage direkt in der Vereins-Web-App ein.
      </div>
    </div>
  `;
}

async function enhanceGVMailTextWithAI() {
  const textInput = document.getElementById('gv-custom-mailtext');
  if (!textInput || !textInput.value.trim()) {
    if (typeof showToast === 'function') showToast("Bitte zuerst Stichworte oder einen Text eingeben.", "warning");
    return;
  }

  const btn = document.getElementById('btn-gv-ai-enhance');
  const btnText = document.getElementById('gv-ai-btn-text');
  const spinner = document.getElementById('gv-ai-spinner');

  if (btn) btn.disabled = true;
  if (btnText) btnText.classList.add('d-none');
  if (spinner) spinner.classList.remove('d-none');

  try {
    const promptKeywords = `Schreibe einen herzlichen, professionellen und motivierenden Begleittext für die E-Mail-Einladung zur Generalversammlung unseres Schützenvereins (Sportschützen Muhen). Beziehe dich auf diese Notizen: "${textInput.value.trim()}". Schreibe 1-2 Absätze. Keine Anrede (die wird automatisch gesetzt), kein Betreff, nur der direkte Fliesstext.`;

    const res = await apiFetch('news', 'action=generate', {
      method: 'POST',
      body: JSON.stringify({
        keywords: promptKeywords,
        images: [],
        useImageContent: false,
        model: 'gemini-2.5-flash'
      })
    });

    if (!res.ok) throw new Error("KI-Service nicht erreichbar");
    const data = await res.json();
    if (data.html) {
      const cleanText = data.html
        .replace(/<p[^>]*>/gi, '')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .trim();
      
      textInput.value = cleanText;
      updateGVMailPreview();
      if (typeof showToast === 'function') showToast("Text erfolgreich mit KI verfeinert!", "success");
    }
  } catch (err) {
    console.warn("KI-Optimierung Fehler:", err);
    if (typeof showToast === 'function') showToast("KI-Optimierung nicht verfügbar: " + err.message, "warning");
  } finally {
    if (btn) btn.disabled = false;
    if (btnText) btnText.classList.remove('d-none');
    if (spinner) spinner.classList.add('d-none');
  }
}

async function saveGVMailTextOnly() {
  const textInput = document.getElementById('gv-custom-mailtext');
  const text = textInput ? textInput.value.trim() : "";
  if (!text) {
    if (typeof showToast === 'function') showToast("Der Text ist leer.", "warning");
    return;
  }

  setGVMailTextInState(text);
  await saveGVData(false);
  if (typeof showToast === 'function') showToast("Einladungstext in Google Sheets gespeichert!", "success");
}

async function executeGVMailSend() {
  const textInput = document.getElementById('gv-custom-mailtext');
  const text = textInput ? textInput.value.trim() : "";

  if (!text) {
    if (typeof showToast === 'function') showToast("Bitte einen Begleittext für die Einladung eingeben.", "warning");
    return;
  }

  // Anhang prüfen
  const state = getGVState();
  let hasDoc = false;
  if (state && Array.isArray(state.platzhalter)) {
    const item = state.platzhalter.find(p => {
      const name = String(p.platzhaltername || p.bezeichnung_app || '').toLowerCase();
      return name.includes('einladung_dokument') || name.includes('aktuelle_gv_einladung');
    });
    if (item && item.inhalt && item.inhalt.trim()) hasDoc = true;
  }

  if (!hasDoc) {
    if (!confirm("⚠️ Achtung: Es ist kein Einladungs-PDF als Anhang hinterlegt.\n\nMöchtest du die Einladungs-Mails trotzdem OHNE PDF-Anhang an alle Mitglieder versenden?")) {
      return;
    }
  } else {
    if (!confirm("Möchtest du die GV-Einladungs-Mails mit diesem Begleittext jetzt an alle Mitglieder versenden?")) {
      return;
    }
  }

  const sendBtn = document.getElementById('btn-gv-send-now');
  const sendBtnText = document.getElementById('gv-send-btn-text');
  const spinner = document.getElementById('gv-send-spinner');

  if (sendBtn) sendBtn.disabled = true;
  if (sendBtnText) sendBtnText.classList.add('d-none');
  if (spinner) spinner.classList.remove('d-none');

  try {
    // 1. Text im State & Sheets sichern
    setGVMailTextInState(text);
    await saveGVData(true);

    // 2. Mails versenden via Google Apps Script
    let evId = "";
    const dropdown = document.getElementById('gv-event-selector');
    if (dropdown && dropdown.value) evId = dropdown.value;

    const payload = {
      action: 'runTool',
      tool: 'sendMails',
      eventId: evId,
      customText: text,
      user: localStorage.getItem('portal_user') || 'Admin'
    };

    const res = await apiFetch('termine', '', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (data.success) {
      alert("✅ " + (data.msg || "GV-Einladungs-Mails wurden erfolgreich versendet!"));
      const modalEl = document.getElementById('gv-mail-modal');
      if (modalEl && typeof bootstrap !== 'undefined') {
        const inst = bootstrap.Modal.getInstance(modalEl);
        if (inst) inst.hide();
      }
    } else {
      alert("❌ Fehler beim Versenden: " + (data.error || "Unbekannter Fehler"));
    }
  } catch (err) {
    alert("Netzwerk-/Serverfehler: " + err.message);
  } finally {
    if (sendBtn) sendBtn.disabled = false;
    if (sendBtnText) sendBtnText.classList.remove('d-none');
    if (spinner) spinner.classList.add('d-none');
  }
}
