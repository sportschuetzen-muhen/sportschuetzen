// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - GENERALVERSAMMLUNGEN ===

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
      loadedAdminData = await res.json();
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
      let hint = '';
      if (label.toLowerCase().includes('anhänge')) {
          hint = '<div class="form-text text-info" style="font-size:0.75rem;"><i class="fas fa-info-circle"></i> Bei mehreren Anhängen diese mit Komma trennen.</div>';
      }
      fieldHtml = '<div class="mb-2">' +
        '<label class="form-label small fw-bold mb-0">' + escapeHtml(label) + '</label>' +
        '<input type="text" class="form-control form-control-sm write-protected"' +
        ' value="' + escapeHtml(displayValue) + '" placeholder="' + escapeHtml(ph) + '"' +
        ' onchange="gvState.platzhalter[' + i + '].inhalt = ' + (isDateField ? 'displayToIso(this.value)' : 'this.value') + '">' +
        hint +
        '</div>';
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
  const selector = document.getElementById('gv-event-selector');
  if (!selector) return;
  
  // Verwende die bereits geladenen Events aus dem globalen umfragenState,
  // anstatt unnötig erneut eine API-Anfrage ans Backend zu senden!
  const events = umfragenState || [];
  selector.innerHTML = '<option value="">-- Bitte wählen --</option>' +
    events.map(e => '<option value="' + escapeHtml(e.id) + '"' +
      (gvState.linked_event === e.id ? ' selected' : '') + '>' +
      escapeHtml(e.title) + ' (' + (e.datum ? e.datum.split('T')[0] : '') + ')</option>').join('');
  if (gvState.linked_event) {
    loadGVParticipants(gvState.linked_event);
  }
}
