// vorstand/js/jahresbeitrag/jahresbeitrag-schnellerfassung.js
// ============================================================
// TAB 2: ACCESS-STYLE SCHNELLERFASSUNG RENDER
// ============================================================
function jbGetDefaultAccountForExtra(key, fallback) {
  const g = (window._jbGebuehren || []).find(x => {
    const k = String(x.key || '').trim().toUpperCase();
    return k === key || k === key.replace(/^Z0*/, 'Z');
  });
  if (g) {
    const k = String(g['Haben-Konto-Jahresbeitrag-Buchhaltung'] || g['Vorgeschlagenes Haben-Konto'] || g.konto_haben || g.konto || '').trim();
    if (k) return k;
  }
  return fallback;
}

// Stellt sicher, dass bereits verrechnete Gruppen- & Einzelgewinne (Konto 1301) beim Speichern in der Schnellerfassung erhalten bleiben
async function jbAppendPreserved1301Credits(supa, pn, year, calc) {
  const verified1301Links = [];
  if (!supa || !pn || !calc || !Array.isArray(calc.positions)) return verified1301Links;

  try {
    const { data: gcmRows } = await supa
      .from('group_competition_members')
      .select('id, betrag, anteil_gruppe, anteil_einzel, stich_name, status, payout_method, contribution_position_id, competition:group_competitions!inner(jahr, gruppe_name, anlass_name, anlass_typ)')
      .eq('person_number', parseInt(pn, 10))
      .eq('payout_method', 'jahresbeitrag')
      .or('status.eq.verrechnet,contribution_position_id.not.is.null')
      .eq('competition.jahr', Number(year));

    if (Array.isArray(gcmRows) && gcmRows.length > 0) {
      const push1301 = (gcmId, desc, rawAmt) => {
        const amt = -Math.abs(Number(rawAmt || 0));
        if (amt === 0) return;
        if (!calc.positions.some(p => (p.key === '1301' || p.konto === '1301') && p.name === desc)) {
          calc.positions.push({
            name: desc,
            betrag: amt,
            typ: 'Credit',
            key: '1301',
            konto: '1301'
          });
        }
        verified1301Links.push({ gcmId, desc });
      };

      gcmRows.forEach(gw => {
        const comp = gw.competition || {};
        const typ = comp.anlass_typ || 'gruppe';
        const isFullySettled = gw.status === 'verrechnet';
        const grpAmt = Number(gw.anteil_gruppe || 0);
        const einzelAmt = Number(gw.anteil_einzel || 0);
        const stichSuffix = gw.stich_name ? ` (${gw.stich_name})` : '';

        if (!isFullySettled) {
          // Nur bereits in den Jahresbeitrag übertragene Gruppenanteile erhalten, falls Einzel noch offen ist
          if (gw.contribution_position_id && grpAmt > 0 && typ !== 'einzel') {
            push1301(gw.id, `Gutschrift Gruppengewinn: ${comp.gruppe_name || 'Gruppe'} (${comp.anlass_name || 'Schiessen'})`, grpAmt);
          }
          return;
        }

        if (typ === 'kombiniert') {
          if (grpAmt > 0) {
            push1301(gw.id, `Gutschrift Gruppengewinn: ${comp.gruppe_name || 'Gruppe'} (${comp.anlass_name || 'Schiessen'})`, grpAmt);
          }
          if (einzelAmt > 0) {
            push1301(gw.id, `Gutschrift Einzelgewinn${stichSuffix}: ${comp.anlass_name || 'Schiessen'}`, einzelAmt);
          }
        } else if (typ === 'einzel') {
          push1301(gw.id, `Gutschrift Einzelgewinn${stichSuffix}: ${comp.anlass_name || 'Schiessen'}`, einzelAmt || gw.betrag);
        } else {
          push1301(gw.id, `Gutschrift Gruppengewinn: ${comp.gruppe_name || 'Gruppe'} (${comp.anlass_name || 'Schiessen'})`, gw.betrag);
        }
      });

      const rawSum = calc.positions.reduce((s, p) => s + Number(p.betrag || 0), 0);
      const hasJanitor = calc.positions.some(p => p.key === 'RA002');
      calc.total = hasJanitor ? rawSum : Math.max(0, rawSum);
    }
  } catch (gwErr) {
    console.warn('[Schnellerfassung] Hinweis beim Abgleich der Schützengewinne (1301):', gwErr);
  }
  return verified1301Links;
}

function renderSchnellerfassungTab() {
  return `
    <div class="row g-3 border rounded bg-white p-2" style="min-height: calc(100vh - 215px);">
      
      <!-- Linke Seitenleiste: Mitgliederliste -->
      <div class="col-md-3 border-end d-flex flex-column p-2 bg-light rounded-start" style="height: calc(100vh - 225px); min-height: 520px; position: sticky; top: 10px;">
        <div class="mb-2">
          <input type="text" class="form-control form-control-sm" id="jbEntrySearch" 
                 placeholder="🔍 Suchen (Name / ID)…" oninput="jbEntrySearchFilter(this.value)" onkeydown="jbHandleSidebarKeyDown(event)">
          <div class="text-muted small mt-1 px-1" style="font-size: 11px;">
            <i class="fas fa-keyboard me-1"></i> Tipp: Pfeiltasten (▲/▼) wechseln Schütze
          </div>
        </div>

        <!-- Sortierung für Sidebar -->
        <div class="d-flex mb-2 bg-white p-0.5 rounded border" style="gap: 2px;">
          <button class="btn btn-xs flex-fill py-1 rounded transition border-0 fs-7 ${_jbSidebarSort === 'name' ? 'btn-primary text-white' : 'bg-transparent text-muted'}" 
                  onclick="jbSortSidebar('name')" style="font-size: 10px; padding: 2px;">ABC</button>
          <button class="btn btn-xs flex-fill py-1 rounded transition border-0 fs-7 ${_jbSidebarSort === 'status' ? 'btn-primary text-white' : 'bg-transparent text-muted'}" 
                  onclick="jbSortSidebar('status')" style="font-size: 10px; padding: 2px;">Status</button>
          <button class="btn btn-xs flex-fill py-1 rounded transition border-0 fs-7 ${_jbSidebarSort === 'modified' ? 'btn-primary text-white' : 'bg-transparent text-muted'}" 
                  onclick="jbSortSidebar('modified')" style="font-size: 10px; padding: 2px;">Geändert</button>
        </div>
        
        <!-- Auto-Save Status Container -->
        <div id="jbAutoSaveStatus" class="mb-2 text-center py-1.5 px-2 bg-light border rounded text-muted small" style="font-size: 11px;">
          <i class="fas fa-shield-alt text-success me-1"></i>Auto-Save aktiv
        </div>

        <div class="list-group flex-fill overflow-y-auto border rounded bg-white" id="jbEntryMemberList">
          <!-- Dynamisch geladen -->
        </div>
      </div>

      <!-- Rechte Arbeitsfläche: Details & Erfassung -->
      <div class="col-md-9 p-3 d-flex flex-column" id="jbEntryWorkspace" style="min-height: calc(100vh - 225px);">
        <div class="text-center my-auto text-muted py-5">
          <i class="fas fa-users fa-3x mb-3 text-primary" style="opacity: 0.3;"></i>
          <h5>Wähle ein Mitglied aus der linken Liste aus</h5>
          <p class="small">Nutze die Liste oder die Pfeiltasten (▲/▼) zur schnellen Navigation.</p>
        </div>
      </div>

      ${typeof window.jbGetKontenDatalistHtml === 'function' ? window.jbGetKontenDatalistHtml('jb-konten-datalist') : ''}
    </div>
  `;
}

// ============================================================
// SCHNELLERFASSUNG WORKSPACE CONTROLS & LOGIC
// ============================================================

// 1. Liste rendern
function jbRenderEntryList() {
  const listEl = document.getElementById('jbEntryMemberList');
  if (!listEl) return;
  const savedScroll = listEl.scrollTop;

  const search = _jbEntrySearch.toLowerCase().trim();
  const filtered = _jbMembers.filter(m => {
    const name = `${m.FirstName || ''} ${m.LastName || ''} ${m.PersonNumber || ''}`.toLowerCase();
    return !search || name.includes(search);
  });

  listEl.innerHTML = filtered.map(m => {
    const activeClass = String(_jbSelectedMemberPN) === String(m.PersonNumber) ? 'active border-primary bg-primary text-white' : '';
    const statusText = m._istEhren ? '🏆 Ehren' : (m._istPassiv ? '💤 Passiv' : '🎯 Aktiv');
    const isModified = _jbLocalBulkChanges[String(m.PersonNumber)] !== undefined;
    const modifiedBadge = isModified ? `<span class="badge bg-warning text-dark ms-1" style="font-size: 9px;">Geändert</span>` : '';
    
    // Berechne Live-Total für die Sidebar
    const header = _jbData.find(x => String(x.PersonNumber).trim() === String(m.PersonNumber).trim());
    let liveTotal = header ? Number(header.Gesamt || 0) : 0;
    if (isModified) {
      const calc = jbCalculateLiveTotal(m, _jbLocalBulkChanges[String(m.PersonNumber)]);
      liveTotal = calc.total;
    }
    const totalText = `CHF ${liveTotal.toFixed(2)}`;

    let itemClass = 'list-group-item list-group-item-action py-2 px-3 border-bottom d-flex justify-content-between align-items-center';
    let itemStyle = 'outline: none; transition: var(--transition);';
    
    if (activeClass) {
      itemClass += ' active border-primary bg-primary text-white';
    } else if (isModified) {
      itemClass += ' border-start border-4 border-warning';
      itemStyle += ' background-color: #fffbeb;'; // Soft pastell yellow/orange background
    }

    const esc = (s) => (typeof escHtml === 'function')
      ? escHtml(s)
      : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const pnAttr = String(m.PersonNumber || '').replace(/[^a-zA-Z0-9_-]/g, '');

    return `
      <button class="${itemClass}" style="${itemStyle}" 
              onclick="jbEntrySelectMember('${pnAttr}')">
        <div>
          <div class="fw-semibold" style="font-size: 13px;">${esc(m.FirstName || '')} ${esc(m.LastName || '')} ${modifiedBadge}</div>
          <div class="small text-muted" style="font-size: 11px; ${activeClass ? 'color: #cbd5e1 !important;' : ''}">
            ${esc(m.PersonNumber || '')} · <strong class="${activeClass ? 'text-white' : 'text-primary'}">${totalText}</strong>
          </div>
        </div>
        <span class="badge ${activeClass ? 'bg-white text-primary' : 'bg-secondary'} rounded-pill" style="font-size: 10px;">${statusText}</span>
      </button>
    `;
  }).join('');

  if (savedScroll > 0) {
    listEl.scrollTop = savedScroll;
  }
}

// 2. Suche in der Seitenleiste
function jbEntrySearchFilter(val) {
  _jbEntrySearch = val;
  jbRenderRowsFilter();
}

// Debounce Filter
function jbRenderRowsFilter() {
  jbRenderEntryList();
}

// 3. Schütze auswählen & Initialisieren der Werte
async function jbEntrySelectMember(pn) {
  _jbSelectedMemberPN = pn;
  jbRenderEntryList();

  const workspace = document.getElementById('jbEntryWorkspace');
  workspace.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary" role="status"></div>
      <p class="mt-2 text-muted">Lade Schützen-Details…</p>
    </div>`;

  try {
    const pnClean = String(pn || '').trim();
    const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
    if (!m) throw new Error("Schütze nicht gefunden");

    // Initialisiere lokalen State für Radio-Buttons / Checkboxen (Stichjahr = _jbYear)
    const refYear = (typeof _jbYear !== 'undefined' && _jbYear) ? Number(_jbYear) : new Date().getFullYear();
    const age = m.BirthDate ? (refYear - new Date(m.BirthDate).getFullYear()) : 0;
    const isJunior = age > 0 && age <= 20;
    const hatG50m = (m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || []).some(l => 
      (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate && (l.MembershipCategory || '').toLowerCase().includes('g50')
    );
    const defaultGe = !isJunior && hatG50m && !m._istPassiv;

    _jbParticipationsState = {
      lizenz: m._istPassiv ? 'passiv' : 'verein', // Default
      events: {},
      kk_volksschiessen: 'keine',
      ssv_dez: 'keine',
      kk_grenzland: 'keine',
      kk_verband: false,
      kk_verein: false,
      lg_ag_dez: false,
      lg_ag_dez_auflage: false,
      lg_ch_dez: false,
      lg_ch_dez_auflage: false,
      lg_verband: false,
      lg_verein: false,
      lg_ch_kniend: false,
      schuetzenhaus: defaultGe,
      hausmeister: (m._kategorie || '').toLowerCase().includes('hausmeister')
    };

    // Lizenz-Initialisierung anhand m._lizenzen
    const ownLiz = (m._lizenzen || []).find(l => l.istMuhen);
    if (ownLiz) {
      if (age > 0 && age <= 20) {
        _jbParticipationsState.lizenz = 'junior';
      } else {
        _jbParticipationsState.lizenz = 'verein';
      }
    } else if ((m._lizenzen || []).length > 0) {
      _jbParticipationsState.lizenz = 'fremd';
    } else if (m._istPassiv) {
      _jbParticipationsState.lizenz = 'passiv';
    } else {
      _jbParticipationsState.lizenz = 'keine';
    }

    const varFees = (window._jbGebuehren || []).filter(f => {
      if (f.aktiv === false || f.aktiv === 'false' || f.aktiv === 0 || f.aktiv === '0') return false;
      const kat = String(f.kategorie || '').toLowerCase();
      const uiTyp = String(f.ui_typ || '').toLowerCase();
      const key = String(f.key || '').toUpperCase();
      return uiTyp === 'amount' || kat === 'variabel' || key.startsWith('Z');
    });
    const varFeeKeys = new Set(varFees.map(f => String(f.key || '').trim().toUpperCase()));

    // Teilnahmen in den State einpflegen
    const memberParts = _jbParticipationsCache[pnClean] || [];
    let hasKK002 = false;
    let hasKK003 = false;
    let hasKK004 = false;
    let hasKK005 = false;

    memberParts.forEach(p => {
      const val = Number(p.teilgenommen || 0);
      const k = String(p.eventkey || '').trim().toUpperCase();
      // Variable Zusatzpositionen (Z001, Z002, Z003 etc.) gehören ausschliesslich in extras, nicht in events
      if (k && !varFeeKeys.has(k) && !k.startsWith('Z')) {
        _jbParticipationsState.events[k] = val;
      }
      if (k === 'GE001') {
        _jbParticipationsState.schuetzenhaus = val > 0;
      }
      if (k === 'RA002') {
        _jbParticipationsState.hausmeister = val > 0;
      }
      if (val > 0) {
        // Event Key ermitteln und in State schreiben
        if (k === 'KK001') _jbParticipationsState.kk_grenzland = '1';
        if (k === 'KK002') hasKK002 = true;
        if (k === 'KK003') hasKK003 = true;
        if (k === 'KK004') hasKK004 = true;
        if (k === 'KK005') hasKK005 = true;
        if (k === 'KK006') _jbParticipationsState.kk_verband = true;
        if (k === 'KK007') _jbParticipationsState.kk_verein = true;   // KK007 = Vereinsschiessen
        if (k === 'KK008') _jbParticipationsState.kk_volksschiessen = String(val); // KK008 = Volksschiessen
        
        // 10m
        if (k === 'LG001') _jbParticipationsState.lg_ag_dez = true;
        if (k === 'LG002') _jbParticipationsState.lg_ag_dez_auflage = true;
        if (k === 'LG003') _jbParticipationsState.lg_ch_dez = true;
        if (k === 'LG004') _jbParticipationsState.lg_ch_dez_auflage = true;
        if (k === 'LG005') _jbParticipationsState.lg_verband = true;
        if (k === 'LG006') _jbParticipationsState.lg_verein = true;
        if (k === 'LG007') _jbParticipationsState.lg_ch_kniend = true;
      }
    });

    if (_jbParticipationsState.events['GE001'] === undefined) {
      _jbParticipationsState.events['GE001'] = defaultGe ? 1 : 0;
    }

    if (hasKK005) {
      _jbParticipationsState.ssv_dez = 'sv';
    } else if (isJunior && (hasKK002 || hasKK003 || hasKK004)) {
      _jbParticipationsState.ssv_dez = 'js';
    } else if (hasKK002 && hasKK003 && hasKK004) {
      _jbParticipationsState.ssv_dez = 'liegend_2_3';
    } else if (hasKK002) {
      _jbParticipationsState.ssv_dez = 'liegend';
    } else if (hasKK003) {
      _jbParticipationsState.ssv_dez = '2-stellung';
    } else if (hasKK004) {
      _jbParticipationsState.ssv_dez = '3-stellung';
    }

    // 4. Variable Zusatzpositionen dynamisch aus gebuehren_config & _jbPositionsCache initialisieren
    _jbParticipationsState.extras = {};
    let existingPositions = [];
    if (_jbPositionsCache) {
      const candidateKeys = [`CH-${_jbYear}-${pnClean}`, `${_jbYear}-${pnClean}`, pnClean];
      for (const ck of candidateKeys) {
        if (Array.isArray(_jbPositionsCache[ck]) && _jbPositionsCache[ck].length > 0) {
          existingPositions = _jbPositionsCache[ck];
          break;
        }
      }
    }
    if (existingPositions.length === 0 && Array.isArray(window._jbAllPositions)) {
      existingPositions = window._jbAllPositions.filter(p =>
        String(p.PersonNumber || p.person_number || '').trim() === pnClean &&
        Number(p.year) === Number(_jbYear)
      );
    }

    varFees.forEach(f => {
      const key = String(f.key).toUpperCase();
      const matchingPosList = existingPositions.filter(p => {
        const sf = String(p.source_field || p.sourcefield || p.key || '').trim().toUpperCase();
        return sf === key;
      });
      // Bevorzuge den vom Standardbetrag abweichenden oder letzten gespeicherten Positionseintrag
      const matchedPos = matchingPosList.find(p => Number(p.betrag || 0) !== Number(f.betrag || 0)) || matchingPosList[matchingPosList.length - 1] || null;
      const matchedPart = memberParts.find(p => String(p.eventkey || '').toUpperCase() === key);

      const isActive = Boolean(matchedPos || (matchedPart && Number(matchedPart.teilgenommen || 0) > 0));
      _jbParticipationsState.extras[key] = {
        key: key,
        active: isActive,
        text: matchedPos ? (matchedPos.beschreibung || matchedPos.name) : (f.bezeichnung_frontend || f.bezeichnungfrontend || f.bezeichnung || f.ui_feld || key),
        betrag: matchedPos ? Number(matchedPos.betrag || 0) : Number(f.betrag || 0),
        konto: matchedPos ? (matchedPos.konto || f.konto_haben || f.konto || '8500') : (f.konto_haben || f.konto || '8500'),
        unlocked: false
      };

      if (key === 'Z001') {
        _jbParticipationsState.z1_active = isActive;
        _jbParticipationsState.z1_text = _jbParticipationsState.extras[key].text;
        _jbParticipationsState.z1_betrag = _jbParticipationsState.extras[key].betrag;
        _jbParticipationsState.z1_konto = _jbParticipationsState.extras[key].konto;
      } else if (key === 'Z002') {
        _jbParticipationsState.z2_active = isActive;
        _jbParticipationsState.z2_text = _jbParticipationsState.extras[key].text;
        _jbParticipationsState.z2_betrag = _jbParticipationsState.extras[key].betrag;
        _jbParticipationsState.z2_konto = _jbParticipationsState.extras[key].konto;
      }
    });

    // Falls lokale Änderungen in dieser Session vorhanden sind, sauber über den initialisierten State mergen
    if (_jbLocalBulkChanges[pnClean]) {
      const local = _jbLocalBulkChanges[pnClean];
      ['lizenz', 'kk_volksschiessen', 'ssv_dez', 'kk_grenzland', 'kk_verband', 'kk_verein',
       'lg_ag_dez', 'lg_ag_dez_auflage', 'lg_ch_dez', 'lg_ch_dez_auflage', 'lg_verband', 'lg_verein', 'lg_ch_kniend',
       'schuetzenhaus', 'hausmeister', 'z1_active', 'z1_text', 'z1_betrag', 'z1_konto', 'z2_active', 'z2_text', 'z2_betrag', 'z2_konto'
      ].forEach(fld => {
        if (local[fld] !== undefined) _jbParticipationsState[fld] = local[fld];
      });
      if (local.events && typeof local.events === 'object') {
        Object.entries(local.events).forEach(([ek, ev]) => {
          const ekUp = String(ek).trim().toUpperCase();
          if (!varFeeKeys.has(ekUp) && !ekUp.startsWith('Z')) {
            _jbParticipationsState.events[ekUp] = ev;
          }
        });
      }
      if (local.extras && typeof local.extras === 'object') {
        Object.entries(local.extras).forEach(([ek, exObj]) => {
          const ekUp = String(ek).trim().toUpperCase();
          if (exObj && typeof exObj === 'object') {
            _jbParticipationsState.extras[ekUp] = {
              ...(_jbParticipationsState.extras[ekUp] || {}),
              ...exObj
            };
          }
        });
      }
    }

    jbRenderEntryForm(m);
  } catch(e) {
    workspace.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  }
}

// ============================================================
// DYNAMIC FEE ENGINE & SCHEMA HELPERS
// ============================================================
function jbGetEffectiveFeeItems() {
  const fees = window._jbGebuehren || [];
  
  // Standard-Fallbacks für historisch bestehende Keys ohne explizite UI-Spalten
  const legacyDefaults = {
    'GE001': { ui_gruppe: 'Infrastruktur', ui_feld: 'Schützenhaus-Beitrag', ui_typ: 'checkbox', ui_sort: 10 },
    'KK008': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'KK Volksschiessen', ui_typ: 'counter', ui_sort: 10 },
    'KK002': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 20 },
    'KK003': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 21 },
    'KK004': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 22 },
    'KK005': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'SSV Dezernat', ui_typ: 'singleselect', ui_sort: 23 },
    'KK001': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: 'KK Grenzland', ui_typ: 'checkbox', ui_sort: 30 },
    'KK006': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: '50m Verbandsschiessen', ui_typ: 'checkbox', ui_sort: 40 },
    'KK007': { ui_gruppe: '50m Wettschiessen (KK)', ui_feld: '50m Vereinsschiessen', ui_typ: 'checkbox', ui_sort: 50 },
    'LG001': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m AG DEZ', ui_typ: 'checkbox', ui_sort: 10 },
    'LG002': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m AG DEZ Auflage', ui_typ: 'checkbox', ui_sort: 20 },
    'LG003': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m CH DEZ', ui_typ: 'checkbox', ui_sort: 30 },
    'LG004': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m CH DEZ Auflage', ui_typ: 'checkbox', ui_sort: 40 },
    'LG005': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m Verbandsschiessen', ui_typ: 'checkbox', ui_sort: 50 },
    'LG006': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m Vereinsschiessen', ui_typ: 'checkbox', ui_sort: 60 },
    'LG007': { ui_gruppe: '10m Wettschiessen (LG)', ui_feld: '10m CH Kniendmeisterschaft', ui_typ: 'checkbox', ui_sort: 70 },
    'Z001':  { ui_gruppe: 'Variable Zusatzpositionen', ui_feld: 'Beitrag Vereinsjacke', ui_typ: 'amount', ui_sort: 10 },
    'Z002':  { ui_gruppe: 'Variable Zusatzpositionen', ui_feld: 'Beitrag Eidg. Schützenfest', ui_typ: 'amount', ui_sort: 20 }
  };

  return fees.map(f => {
    const key = String(f.key || '').trim().toUpperCase();
    const d = legacyDefaults[key] || {};
    
    // Check if aktiv is set (default to true if missing/empty)
    const aktiv = f.aktiv !== false && f.aktiv !== 'false' && f.aktiv !== 0 && f.aktiv !== '0';

    let gruppe = (f.ui_gruppe && String(f.ui_gruppe).trim()) || d.ui_gruppe || '';
    if (!gruppe) {
      if (key.startsWith('KK')) gruppe = '50m Wettschiessen (KK)';
      else if (key.startsWith('LG')) gruppe = '10m Wettschiessen (LG)';
      else if (key.startsWith('Z')) gruppe = 'Variable Zusatzpositionen';
      else if (key === 'GE001') gruppe = 'Infrastruktur';
      else gruppe = f.kategorie || 'Sonstige Gebühren';
    }

    let typ = (f.ui_typ && String(f.ui_typ).trim().toLowerCase()) || d.ui_typ || 'checkbox';
    let feld = (f.ui_feld && String(f.ui_feld).trim()) || d.ui_feld || f.bezeichnungfrontend || f.bezeichnung || key;
    let sort = (f.ui_sort !== undefined && f.ui_sort !== null && f.ui_sort !== '') ? Number(f.ui_sort) : (d.ui_sort !== undefined ? d.ui_sort : 99);

    return {
      ...f,
      key,
      aktiv,
      ui_gruppe: gruppe,
      ui_typ: typ,
      ui_feld: feld,
      ui_sort: sort,
      betrag: Number(f.betrag || 0)
    };
  });
}

function jbRenderDynamicFeeGroupsHTML(m, state) {
  const feeItems = jbGetEffectiveFeeItems();
  const events = state.events || {};
  const refYear = (typeof _jbYear !== 'undefined' && _jbYear) ? Number(_jbYear) : new Date().getFullYear();
  const age = m && m.BirthDate ? (refYear - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;

  // Filtere nicht-aktive Gebühren sowie System-Gebühren (JB, LI, RA, GE001, amount/Zusatz)
  const displayItems = feeItems.filter(f => {
    if (!f.aktiv) return false;
    const key = f.key;
    if (key.startsWith('JB') || key.startsWith('LI') || key.startsWith('RA')) return false;
    if (key === 'GE001') return false; // eigenes Schützenhaus-Widget
    if (f.ui_typ === 'amount' || key.startsWith('Z')) return false; // eigene Zusatzpositionen-Card
    const kat = String(f.kategorie || '').toLowerCase();
    if (kat.includes('jahresbeitrag') || kat.includes('lizenz') || kat.includes('rabatt')) return false;

    // Variante A: Zielgruppen-Filter (Alle, Aktive, Junioren)
    const zg = String(f.zielgruppe || '').trim().toLowerCase();
    if (zg === 'junioren' && !isJunior) return false;
    if (zg === 'aktive' && isJunior) return false;

    return true;
  });

  // Gruppieren nach ui_gruppe
  const groups = {};
  displayItems.forEach(item => {
    const grp = item.ui_gruppe || 'Weitere Gebühren';
    if (!groups[grp]) groups[grp] = [];
    groups[grp].push(item);
  });

  let html = '';
  Object.entries(groups).forEach(([groupName, items]) => {
    // Sortieren nach ui_sort, dann key
    items.sort((a, b) => (a.ui_sort || 99) - (b.ui_sort || 99));

    // Icon anhand des Gruppennamens bestimmen
    let icon = 'fa-bullseye text-primary';
    const gLower = groupName.toLowerCase();
    if (gLower.includes('50m') || gLower.includes('kk')) icon = 'fa-bullseye text-danger';
    else if (gLower.includes('10m') || gLower.includes('lg')) icon = 'fa-bullseye text-primary';
    else if (gLower.includes('300m')) icon = 'fa-crosshairs text-success';
    else if (gLower.includes('pistole')) icon = 'fa-shield-alt text-warning';
    else icon = 'fa-trophy text-info';

    let bodyHtml = '';
    const renderedKeys = new Set();

    // Check for SSV Dezernat cluster
    const ssvKeys = ['KK002', 'KK003', 'KK004', 'KK005'];
    const hasSsvKeys = ssvKeys.some(k => items.some(it => it.key === k));

    items.forEach(item => {
      if (renderedKeys.has(item.key)) return;

      if (item.ui_typ === 'counter') {
        renderedKeys.add(item.key);
        const count = Number(events[item.key] || 0);
        bodyHtml += `
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label small fw-semibold text-muted mb-0">${escHtml(item.ui_feld || item.bezeichnungfrontend || item.key)} (${item.key})</label>
              <span class="badge bg-secondary" style="font-size: 10px;">CHF ${item.betrag.toFixed(2)} / Stk.</span>
            </div>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px;">
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 0 ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 0, '${m.PersonNumber}')">Kein Stich</button>
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 1 ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 1, '${m.PersonNumber}')">1 Stich</button>
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 2 ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 2, '${m.PersonNumber}')">2 Stiche</button>
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${count === 3 ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbUpdateEventState('${item.key}', 3, '${m.PersonNumber}')">3 Stiche</button>
            </div>
          </div>
        `;
      } else if (item.ui_typ === 'singleselect') {
        const fieldName = item.ui_feld || 'Auswahl';
        const isSsvCluster = hasSsvKeys && (fieldName === 'SSV Dezernat' || ssvKeys.includes(item.key));
        
        let fieldItems = [];
        if (isSsvCluster) {
          fieldItems = items.filter(it => ssvKeys.includes(it.key));
        } else {
          fieldItems = items.filter(it => it.ui_typ === 'singleselect' && it.ui_feld === fieldName);
        }
        fieldItems.forEach(it => renderedKeys.add(it.key));

        const allKeys = fieldItems.map(it => it.key);
        const allKeysStr = allKeys.join(',');

        if (isSsvCluster) {
          const ssvVal = state.ssv_dez || (
            events['KK005'] ? 'sv' :
            (events['KK002'] && events['KK003'] && events['KK004']) ? 'liegend_2_3' :
            events['KK002'] ? 'liegend' :
            events['KK003'] ? '2-stellung' :
            events['KK004'] ? '3-stellung' : 'keine'
          );
          const ssvSumSelected =
            ssvVal === 'sv' ? Number(fieldItems.find(x => x.key === 'KK005')?.betrag || 0) :
            ssvVal === 'liegend_2_3' ? ['KK002', 'KK003', 'KK004'].reduce((s, k) => s + Number(fieldItems.find(x => x.key === k)?.betrag || 0), 0) :
            ssvVal === 'liegend' ? Number(fieldItems.find(x => x.key === 'KK002')?.betrag || 0) :
            ssvVal === '2-stellung' ? Number(fieldItems.find(x => x.key === 'KK003')?.betrag || 0) :
            ssvVal === '3-stellung' ? Number(fieldItems.find(x => x.key === 'KK004')?.betrag || 0) : 0;
          const ssvPrices = fieldItems.map(x => Number(x.betrag || 0)).filter(n => n > 0);
          const ssvMin = ssvPrices.length ? Math.min(...ssvPrices) : Number(item.betrag || 0);
          const ssvMax = ssvPrices.length ? Math.max(...ssvPrices) : Number(item.betrag || 0);
          const ssvBadgeText = ssvVal !== 'keine'
            ? `CHF ${ssvSumSelected.toFixed(2)}`
            : (ssvMin === ssvMax ? `CHF ${ssvMin.toFixed(2)}` : `CHF ${ssvMin.toFixed(2)}–${ssvMax.toFixed(2)}`);
          bodyHtml += `
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label small fw-semibold text-muted mb-0">SSV dez (KK002/003/004/005)</label>
                <span class="badge bg-secondary" style="font-size: 10px;">${ssvBadgeText}</span>
              </div>
              <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('keine', '${allKeysStr}', '${m.PersonNumber}')">Kein Stich</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'liegend' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK002', '${allKeysStr}', '${m.PersonNumber}')">Liegend</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === '2-stellung' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK003', '${allKeysStr}', '${m.PersonNumber}')">2-Stellung</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === '3-stellung' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK004', '${allKeysStr}', '${m.PersonNumber}')">3-Stellung</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'liegend_2_3' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('liegend_2_3', '${allKeysStr}', '${m.PersonNumber}')">L+2+3 St.</button>
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${ssvVal === 'sv' ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('KK005', '${allKeysStr}', '${m.PersonNumber}')">SV Stich</button>
              </div>
            </div>
          `;
        } else {
          // Generische Einzelauswahl (Radio-Pills)
          const activeItem = fieldItems.find(it => Number(events[it.key] || 0) > 0);
          const activeKey = activeItem ? activeItem.key : 'keine';

          const buttonsHtml = fieldItems.map(it => {
            const isActive = activeKey === it.key;
            return `
              <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${isActive ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                      onclick="jbSelectSingleSelectOption('${it.key}', '${allKeysStr}', '${m.PersonNumber}')"
                      title="${escHtml(it.bezeichnung || '')} (CHF ${it.betrag.toFixed(2)})">
                ${escHtml(it.bezeichnungfrontend || it.bezeichnung || it.key)}
              </button>
            `;
          }).join('');

          bodyHtml += `
            <div class="mb-3">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <label class="form-label small fw-semibold text-muted mb-0">${escHtml(fieldName)}</label>
                <span class="badge bg-secondary" style="font-size: 10px;">Einzelauswahl</span>
              </div>
              <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${activeKey === 'keine' ? 'btn-toggle-active-primary' : 'btn-toggle-inactive'}" 
                        onclick="jbSelectSingleSelectOption('keine', '${allKeysStr}', '${m.PersonNumber}')">Keine</button>
                ${buttonsHtml}
              </div>
            </div>
          `;
        }
      } else if (item.ui_typ === 'multiselect') {
        const fieldName = item.ui_feld || 'Mehrfachauswahl';
        const fieldItems = items.filter(it => it.ui_typ === 'multiselect' && it.ui_feld === fieldName);
        fieldItems.forEach(it => renderedKeys.add(it.key));

        const buttonsHtml = fieldItems.map(it => {
          const isActive = Number(events[it.key] || 0) > 0;
          return `
            <button type="button" class="btn btn-sm flex-fill rounded-2 border-0 py-1.5 ${isActive ? 'btn-toggle-active-accent' : 'btn-toggle-inactive'}" 
                    onclick="jbToggleMultiSelectOption('${it.key}', '${m.PersonNumber}')"
                    title="${escHtml(it.bezeichnung || '')} (CHF ${it.betrag.toFixed(2)})">
              ${isActive ? '<i class="fas fa-check me-1"></i>' : ''}${escHtml(it.bezeichnungfrontend || it.bezeichnung || it.key)}
              <span class="badge ${isActive ? 'bg-white text-dark' : 'bg-secondary'} ms-1" style="font-size: 9px;">CHF ${it.betrag.toFixed(2)}</span>
            </button>
          `;
        }).join('');

        bodyHtml += `
          <div class="mb-3">
            <div class="d-flex justify-content-between align-items-center mb-1">
              <label class="form-label small fw-semibold text-muted mb-0">${escHtml(fieldName)}</label>
              <span class="badge bg-info text-dark" style="font-size: 10px;">Mehrfachauswahl</span>
            </div>
            <div class="d-flex bg-light p-1 rounded-2" style="gap: 5px; flex-wrap: wrap;">
              ${buttonsHtml}
            </div>
          </div>
        `;
      }
    });

    // Verbleibende Checkbox-Elemente in 2-Spalten Grid rendern
    const checkboxItems = items.filter(it => !renderedKeys.has(it.key) && (it.ui_typ === 'checkbox' || !it.ui_typ));
    if (checkboxItems.length > 0) {
      bodyHtml += '<div class="row g-2">';
      checkboxItems.forEach(it => {
        renderedKeys.add(it.key);
        const isChecked = Number(events[it.key] || 0) > 0;
        bodyHtml += `
          <div class="col-6">
            <label class="w-100 p-2 border rounded-2 d-flex align-items-center justify-content-between bg-light" style="cursor: pointer;">
              <div>
                <span class="small fw-semibold text-muted">${escHtml(it.ui_feld || it.bezeichnungfrontend || it.bezeichnung || it.key)}</span>
                <span class="badge bg-secondary ms-1" style="font-size: 9px;">CHF ${it.betrag.toFixed(2)}</span>
              </div>
              <input type="checkbox" class="form-check-input" ${isChecked ? 'checked' : ''} 
                     onchange="jbUpdateEventState('${it.key}', this.checked ? 1 : 0, '${m.PersonNumber}')">
            </label>
          </div>
        `;
      });
      bodyHtml += '</div>';
    }

    html += `
      <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
        <h6 class="text-secondary fw-bold mb-3" style="font-size: 12px; text-transform: uppercase;">
          <i class="fas ${icon} me-2"></i>${escHtml(groupName)}
        </h6>
        ${bodyHtml}
      </div>
    `;
  });

  return html;
}

function jbHasManageAccess() {
  if (typeof hasWriteAccess === 'function') return hasWriteAccess('jahresbeitrag');
  if (typeof Perms !== 'undefined' && typeof Perms.has === 'function') {
    return Perms.has('jahresbeitrag.manage');
  }
  return typeof userHasRole === 'function' ? userHasRole('admin') : false;
}

function jbCheckEntryEditable(pn, showFeedback = true) {
  if (!jbHasManageAccess()) {
    if (showFeedback) showToast('Keine Berechtigung zum Bearbeiten (jahresbeitrag.manage erforderlich).', 'warning');
    return false;
  }
  const lockState = typeof window.jbGetContributionLockState === 'function'
    ? window.jbGetContributionLockState(pn)
    : { isLocked: false };
  if (lockState.isLocked) {
    if (showFeedback) showToast(`Bearbeitungssperre: ${lockState.reason || 'Rechnung bereits versendet oder bezahlt.'}`, 'warning');
    return false;
  }
  return true;
}

window.jbUpdateEventState = function(key, val, pn) {
  const pnClean = String(pn || '').trim();
  if (!jbCheckEntryEditable(pnClean)) return;
  key = String(key).trim().toUpperCase();
  val = Number(val || 0);

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }
  _jbParticipationsState.events[key] = val;

  // Sync to legacy fields if applicable
  if (key === 'GE001') _jbParticipationsState.schuetzenhaus = val > 0;
  if (key === 'KK008') _jbParticipationsState.kk_volksschiessen = val > 0 ? String(val) : 'keine';
  if (key === 'KK006') _jbParticipationsState.kk_verband = val > 0;
  if (key === 'KK007') _jbParticipationsState.kk_verein = val > 0;
  if (key === 'KK001') _jbParticipationsState.kk_grenzland = val > 0 ? '1' : 'keine';
  if (key === 'LG001') _jbParticipationsState.lg_ag_dez = val > 0;
  if (key === 'LG002') _jbParticipationsState.lg_ag_dez_auflage = val > 0;
  if (key === 'LG003') _jbParticipationsState.lg_ch_dez = val > 0;
  if (key === 'LG004') _jbParticipationsState.lg_ch_dez_auflage = val > 0;
  if (key === 'LG005') _jbParticipationsState.lg_verband = val > 0;
  if (key === 'LG006') _jbParticipationsState.lg_verein = val > 0;
  if (key === 'LG007') _jbParticipationsState.lg_ch_kniend = val > 0;

  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };
  _jbLocalBulkChanges[pnClean].extras = JSON.parse(JSON.stringify(_jbParticipationsState.extras || {}));
  _jbLocalBulkChanges[pnClean][key] = val;

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }

  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbRenderEntryForm(m);
  }

  jbTriggerAutoSave(pnClean);
};

window.jbSelectSingleSelectOption = function(activeKey, allKeysStr, pn) {
  const pnClean = String(pn || '').trim();
  if (!jbCheckEntryEditable(pnClean)) return;
  const allKeys = String(allKeysStr || '').split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
  
  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }

  // Deactivate all keys in this group
  allKeys.forEach(k => {
    _jbParticipationsState.events[k] = 0;
  });

  // Activate selected option
  if (activeKey === 'liegend_2_3') {
    _jbParticipationsState.ssv_dez = 'liegend_2_3';
    _jbParticipationsState.events['KK002'] = 1;
    _jbParticipationsState.events['KK003'] = 1;
    _jbParticipationsState.events['KK004'] = 1;
  } else if (activeKey && activeKey !== 'keine') {
    _jbParticipationsState.events[activeKey.toUpperCase()] = 1;
    if (activeKey === 'KK002') _jbParticipationsState.ssv_dez = 'liegend';
    else if (activeKey === 'KK003') _jbParticipationsState.ssv_dez = '2-stellung';
    else if (activeKey === 'KK004') _jbParticipationsState.ssv_dez = '3-stellung';
    else if (activeKey === 'KK005') _jbParticipationsState.ssv_dez = 'sv';
  } else {
    if (allKeys.includes('KK002')) _jbParticipationsState.ssv_dez = 'keine';
  }

  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };
  _jbLocalBulkChanges[pnClean].extras = JSON.parse(JSON.stringify(_jbParticipationsState.extras || {}));
  if (_jbParticipationsState.ssv_dez) _jbLocalBulkChanges[pnClean].ssv_dez = _jbParticipationsState.ssv_dez;

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }

  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbRenderEntryForm(m);
  }

  jbTriggerAutoSave(pnClean);
};

window.jbToggleMultiSelectOption = function(key, pn) {
  const pnClean = String(pn || '').trim();
  key = String(key).trim().toUpperCase();

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }
  const currentVal = Number(_jbParticipationsState.events[key] || 0);
  const newVal = currentVal > 0 ? 0 : 1;
  jbUpdateEventState(key, newVal, pnClean);
};

// Live-Zusammenfassung der linken Spalte gezielt aktualisieren (ohne Re-Render der rechten Spalte)
function jbUpdateLiveSummary(m) {
  if (!m) return;
  const calc = jbCalculateLiveTotal(m, _jbParticipationsState);

  const totalEl = document.getElementById('jbLiveTotal');
  if (totalEl) {
    totalEl.textContent = `CHF ${calc.total.toFixed(2)}`;
  }

  const listEl = document.getElementById('jbLivePositionsList');
  if (listEl) {
    listEl.innerHTML = `
      <div class="fw-bold text-muted small mb-2 text-uppercase" style="font-size: 10px; letter-spacing: 1px;">Postenübersicht</div>
      ${calc.positions.map(p => `
        <div class="d-flex justify-content-between align-items-center py-1 border-bottom" style="font-size: 12px;">
          <span class="text-muted">${p.name}</span>
          <span class="fw-bold ${p.typ === 'Kredit' ? 'text-success' : 'text-dark'}">
            ${p.typ === 'Kredit' ? '-' : ''}CHF ${Math.abs(p.betrag).toFixed(2)}
          </span>
        </div>
      `).join('')}
    `;
  }
}

// 4. Formular für den aktiven Schützen rendern
function jbRenderEntryForm(m) {
  const workspace = document.getElementById('jbEntryWorkspace');
  if (!workspace) return;

  // Scrollposition & aktives Eingabefeld merken, damit Fokus & Ansicht nicht springen
  const rightCol = document.getElementById('jbEntryRightCol');
  const savedScroll = rightCol ? rightCol.scrollTop : 0;
  const focusedEl = document.activeElement;
  const focusedId = (focusedEl && focusedEl.id) ? focusedEl.id : null;
  const cursorStart = (focusedEl && focusedEl.selectionStart !== undefined) ? focusedEl.selectionStart : null;
  const cursorEnd = (focusedEl && focusedEl.selectionEnd !== undefined) ? focusedEl.selectionEnd : null;

  // Live-Berechnung der Summen
  const calc = jbCalculateLiveTotal(m, _jbParticipationsState);
  const refYear = (typeof _jbYear !== 'undefined' && _jbYear) ? Number(_jbYear) : new Date().getFullYear();
  const age = m.BirthDate ? (refYear - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;
  const esc = (s) => (typeof escHtml === 'function')
    ? escHtml(s)
    : String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const pnAttr = String(m.PersonNumber || '').replace(/[^a-zA-Z0-9_-]/g, '');

  const lockState = typeof window.jbGetContributionLockState === 'function'
    ? window.jbGetContributionLockState(m.PersonNumber)
    : { isLocked: false, reason: '' };
  const canManage = jbHasManageAccess();
  const isReadOnly = !canManage || lockState.isLocked;
  const readOnlyBanner = lockState.isLocked
    ? `<div class="alert alert-warning border-warning d-flex align-items-center gap-2 py-2 px-3 mb-3 small">
         <i class="fas fa-lock text-warning"></i>
         <div><strong>Bearbeitungssperre aktiv:</strong> ${esc(lockState.reason || 'Rechnung bereits versendet oder bezahlt.')} Änderungen in der Schnellerfassung sind gesperrt.</div>
       </div>`
    : (!canManage
      ? `<div class="alert alert-info d-flex align-items-center gap-2 py-2 px-3 mb-3 small">
           <i class="fas fa-eye text-info"></i>
           <div>Du hast nur Leserechte (<code>jahresbeitrag.view</code>). Änderungen sind deaktiviert.</div>
         </div>`
      : '');

  const positionsHTML = calc.positions.map(p => {
    const isCredit = p.typ === 'Kredit' || p.typ === 'Credit' || p.betrag < 0;
    return `
    <div class="d-flex justify-content-between align-items-center py-1 border-bottom" style="font-size: 12px;">
      <span class="text-muted">${esc(p.name)}</span>
      <span class="fw-bold ${isCredit ? 'text-success' : 'text-dark'}">
        ${isCredit ? '-' : ''}CHF ${Math.abs(p.betrag).toFixed(2)}
      </span>
    </div>
  `;
  }).join('');

  const errorsHTML = (calc.configErrors && calc.configErrors.length > 0) ? `
    <div class="alert alert-danger p-2 mb-2 rounded-3 border-0 shadow-sm" style="font-size: 11px;">
      <div class="fw-bold mb-1"><i class="fas fa-exclamation-triangle me-1"></i>Konfigurationsfehler:</div>
      <ul class="mb-1 ps-3">
        ${calc.configErrors.map(e => `<li>${esc(e.error)}</li>`).join('')}
      </ul>
      <div class="small fw-semibold text-danger">⚠️ Bitte im Reiter <strong>"Gebühren"</strong> korrigieren.</div>
    </div>
  ` : '';

  const geFee = (window._jbGebuehren || []).find(g => String(g.key || '').trim().toUpperCase() === 'GE001');
  const geTitle = geFee ? (geFee.bezeichnung_frontend || geFee.bezeichnung || 'Schützenhaus-Beitrag') : 'Schützenhaus-Beitrag';
  const geAmt = geFee && geFee.betrag !== undefined && geFee.betrag !== null ? Math.abs(Number(geFee.betrag)).toFixed(2) : null;
  const geLabel = geAmt !== null ? `${esc(geTitle)} (CHF ${geAmt})` : `<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-1"></i>${esc(geTitle)} (Tarif fehlt in Konfiguration!)</span>`;

  const hmFee = (window._jbGebuehren || []).find(g => String(g.key || '').trim().toUpperCase() === 'RA002');
  const hmTitle = hmFee ? (hmFee.bezeichnung_frontend || hmFee.bezeichnung || 'Gutschrift Unterhalt Anlage (Hausmeister)') : 'Gutschrift Unterhalt Anlage (Hausmeister)';
  const hmAmt = hmFee && hmFee.betrag !== undefined && hmFee.betrag !== null ? Math.abs(Number(hmFee.betrag)).toFixed(2) : null;
  const hmSubTitle = hmAmt !== null ? `Entschädigung Hausmeister / Unterhalt (RA002: -CHF ${hmAmt})` : `<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-1"></i>Tarif RA002 fehlt in Konfiguration!</span>`;

  workspace.innerHTML = `
    <div class="row g-4 h-100 flex-fill">
      
      <!-- LINKE SPALTE: Live-Kostenübersicht (Sticky) -->
      <div class="col-md-5 d-flex flex-column" style="position: sticky; top: 10px; height: calc(100vh - 235px); min-height: 480px;">
        <div class="card p-3 shadow-sm border-0 bg-light flex-fill d-flex flex-column rounded-3" style="background: rgba(243, 244, 246, 0.7); backdrop-filter: blur(10px);">
          <div class="mb-3 border-bottom pb-2">
            <h5 class="mb-0 text-primary fw-bold">${esc(m.FirstName || '')} ${esc(m.LastName || '')}</h5>
            <small class="text-muted">${esc(m.PersonNumber || '')} · ${isJunior ? '👦 Junior' : '👤 Erwachsen'}</small>
          </div>

          ${errorsHTML}

          <div class="flex-fill overflow-y-auto mb-3 pe-1" id="jbLivePositionsList" style="max-height: calc(100vh - 430px);">
            <div class="fw-bold text-muted small mb-2 text-uppercase" style="font-size: 10px; letter-spacing: 1px;">Postenübersicht</div>
            ${positionsHTML}
          </div>

          <!-- Total Highlight Box -->
          <div class="p-3 bg-white border border-primary rounded-3 text-center shadow-sm mt-auto">
            <div class="small text-muted fw-semibold">Berechneter Gesamtbetrag</div>
            <div class="fs-2 fw-extrabold text-primary" id="jbLiveTotal">CHF ${calc.total.toFixed(2)}</div>
          </div>
        </div>
      </div>

      <!-- RECHTE SPALTE: Auswahlelemente (Scrollbar mit ausreichend Puffer unten) -->
      <div class="col-md-7 d-flex flex-column overflow-y-auto pr-2 pb-5 mb-4" id="jbEntryRightCol" style="max-height: calc(100vh - 235px); min-height: 480px;">
        ${readOnlyBanner}
        
        <!-- 0. Schnell-Presets (Vorlagen) -->
        <div class="card p-2 border-0 shadow-sm mb-3 rounded-3 bg-light border-start border-4 border-warning">
          <div class="d-flex align-items-center justify-content-between flex-wrap gap-1">
            <span class="small fw-bold text-muted" style="font-size:11px;"><i class="fas fa-bolt text-warning me-1"></i>Schnell-Vorlage:</span>
            <div class="d-flex gap-1">
              <button type="button" class="btn btn-xs btn-outline-primary py-1 px-2 fw-semibold" onclick="jbApplyPreset('aktiv_a', '${pnAttr}')" style="font-size:11px;">⚡ Aktiv A</button>
              <button type="button" class="btn btn-xs btn-outline-primary py-1 px-2 fw-semibold" onclick="jbApplyPreset('aktiv_b', '${pnAttr}')" style="font-size:11px;">⚡ Aktiv B</button>
              <button type="button" class="btn btn-xs btn-outline-secondary py-1 px-2 fw-semibold" onclick="jbApplyPreset('passiv', '${pnAttr}')" style="font-size:11px;">⚡ Passiv</button>
            </div>
          </div>
        </div>

        <!-- 1. Lizenz & Status (abgeleitet aus SSV-Mitgliederstamm) -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="text-secondary fw-bold mb-0" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-id-card me-2"></i>Lizenz &amp; Status (Stammdaten)</h6>
            <span class="badge bg-light text-muted border" style="font-size: 10px;"><i class="fas fa-database me-1"></i>SSV / Mitglieder</span>
          </div>
          <div class="d-flex flex-wrap gap-2 align-items-center bg-light p-2 rounded-2 border">
            <span class="badge ${
              _jbParticipationsState.lizenz === 'junior' ? 'bg-info text-dark' :
              _jbParticipationsState.lizenz === 'verein' ? 'bg-primary' :
              _jbParticipationsState.lizenz === 'passiv' ? 'bg-secondary' : 'bg-warning text-dark'
            }">${
              _jbParticipationsState.lizenz === 'junior' ? 'Jungschütze / Junior (Muhen)' :
              _jbParticipationsState.lizenz === 'verein' ? 'Eigener JB / Lizenz Muhen' :
              _jbParticipationsState.lizenz === 'passiv' ? 'Passivmitglied' :
              _jbParticipationsState.lizenz === 'fremd' ? 'Fremdlizenz (auswärtig)' : 'Ohne Muhen-Lizenz'
            }</span>
            <span class="small text-muted">${esc(m._kategorie || (m._istPassiv ? 'Passiv' : 'Aktiv'))} · Anpassung erfolgt über Stammdaten / SSV-Import</span>
          </div>
        </div>

        <!-- Schützenhaus Infrastrukturbeitrag -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3">
          <h6 class="text-secondary fw-bold mb-2" style="font-size: 12px; text-transform: uppercase;"><i class="fas fa-home me-2 text-success"></i>Infrastrukturbeitrag Schützenhaus</h6>
          <div class="d-flex align-items-center justify-content-between bg-light p-2 rounded-2 border">
            <span class="small fw-semibold text-muted">${geLabel}</span>
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" id="entry_schuetzenhaus" ${
                _jbParticipationsState.schuetzenhaus ? 'checked' : ''
              } onchange="jbConfirmEntrySchuetzenhaus(this, '${pnAttr}')">
            </div>
          </div>
        </div>

        <!-- Hausmeister / Unterhalt Anlage Gutschrift (Option B) -->
        <div class="card p-3 border-0 shadow-sm mb-3 rounded-3 bg-white border-start border-4 border-success">
          <div class="d-flex align-items-center justify-content-between">
            <div>
              <h6 class="text-secondary fw-bold mb-1" style="font-size: 12px; text-transform: uppercase;">
                <i class="fas fa-tools me-2 text-success"></i>${esc(hmTitle)}
              </h6>
              <span class="small fw-semibold text-muted">${hmSubTitle}</span>
            </div>
            <div class="form-check form-switch mb-0">
              <input class="form-check-input" type="checkbox" id="entry_hausmeister" ${
                _jbParticipationsState.hausmeister ? 'checked' : ''
              } onchange="jbUpdateState('hausmeister', this.checked, '${pnAttr}')" style="cursor: pointer; transform: scale(1.15);">
            </div>
          </div>
        </div>

        <!-- 2. Dynamische Wettkämpfe & Gebührengruppen (50m, 10m, weitere) -->
        ${jbRenderDynamicFeeGroupsHTML(m, _jbParticipationsState)}

        <!-- 3. Variable Zusatzpositionen (Freie Beträge) - zu 100% dynamisch aus gebuehren_config -->
        ${jbRenderVariableZusatzHTML(m, _jbParticipationsState)}

        <!-- 5. Speichern & Aktionen (mit großzügigem Abstand nach unten) -->
        <div class="d-flex gap-2 mt-4 pt-2 pb-5">
          <button type="button" class="btn btn-outline-danger px-3" onclick="jbEntryResetForm('${pnAttr}')" ${isReadOnly ? 'disabled' : ''}>
            <i class="fas fa-trash-alt me-1"></i> Zurücksetzen
          </button>
          <button type="button" id="jbEntrySaveNextBtn" class="btn btn-success flex-fill py-2.5 fw-bold shadow-sm" onclick="jbEntrySaveAndNext('${pnAttr}')" ${isReadOnly ? 'disabled' : ''}>
            <i class="fas fa-save me-1"></i> Speichern &amp; Weiter (Nächster Schütze)
          </button>
        </div>

      </div>

    </div>
  `;

  if (isReadOnly) {
    const rightColReadOnly = document.getElementById('jbEntryRightCol');
    if (rightColReadOnly) {
      rightColReadOnly.querySelectorAll('input, select, textarea, button').forEach(el => {
        el.disabled = true;
      });
    }
  }

  // Scrollposition & Fokus wiederherstellen
  const newRightCol = document.getElementById('jbEntryRightCol');
  if (newRightCol && savedScroll > 0) {
    newRightCol.scrollTop = savedScroll;
  }
  if (focusedId) {
    const el = document.getElementById(focusedId);
    if (el) {
      try {
        el.focus({ preventScroll: true });
        if (cursorStart !== null && cursorEnd !== null && el.setSelectionRange) {
          el.setSelectionRange(cursorStart, cursorEnd);
        }
      } catch(e) {}
    }
  }
}

async function jbConfirmEntrySchuetzenhaus(chk, pn) {
  const currentVal = chk.checked;
  const prevVal = !currentVal;
  if (!jbCheckEntryEditable(pn)) {
    chk.checked = prevVal;
    return;
  }

  const ok = await UIConfirmKit.confirm({
    title: 'Infrastrukturbeitrag anpassen?',
    message: 'Möchtest du den Infrastrukturbeitrag Schützenhaus für dieses Mitglied wirklich manuell ändern?',
    type: 'warning',
    confirmText: 'Ändern'
  });

  if (ok) {
    jbUpdateState('schuetzenhaus', currentVal, pn);
  } else {
    chk.checked = prevVal;
  }
}

// 5. State live synchronisieren & direkt in Supabase speichern
async function jbSaveSingleMemberDirect(pnClean) {
  const pn = String(pnClean || '').trim();
  if (!jbHasManageAccess()) {
    throw new Error('Keine Berechtigung zum Speichern (jahresbeitrag.manage erforderlich).');
  }
  const lockState = typeof window.jbGetContributionLockState === 'function'
    ? window.jbGetContributionLockState(pn)
    : { isLocked: false, reason: '' };
  if (lockState.isLocked) {
    throw new Error(lockState.reason || 'Beitrag ist bereits versendet/bezahlt und daher gesperrt.');
  }
  const settings = _jbLocalBulkChanges[pn] || _jbParticipationsState;
  const m = (_jbMemberMap && _jbMemberMap[pn]) || (_jbMembers || []).find(x => String(x.PersonNumber || '').trim() === pn);
  if (!m) return null;

  const events = settings.events ? { ...settings.events } : {};
  if (settings.schuetzenhaus !== undefined) events['GE001'] = settings.schuetzenhaus ? 1 : 0;
  if (settings.hausmeister !== undefined) events['RA002'] = settings.hausmeister ? 1 : 0;
  if (settings.kk_volksschiessen !== undefined) events['KK008'] = settings.kk_volksschiessen === 'keine' ? 0 : Number(settings.kk_volksschiessen);
  if (settings.kk_verein !== undefined) events['KK007'] = settings.kk_verein ? 1 : 0;
  if (settings.kk_verband !== undefined) events['KK006'] = settings.kk_verband ? 1 : 0;
  if (settings.kk_grenzland !== undefined) events['KK001'] = settings.kk_grenzland !== 'keine' ? 1 : 0;
  if (settings.ssv_dez !== undefined) {
    const ssv = settings.ssv_dez;
    events['KK002'] = (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0;
    events['KK003'] = (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
    events['KK004'] = (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
    events['KK005'] = ssv === 'sv' ? 1 : 0;
  }
  if (settings.lg_ag_dez !== undefined) events['LG001'] = settings.lg_ag_dez ? 1 : 0;
  if (settings.lg_ag_dez_auflage !== undefined) events['LG002'] = settings.lg_ag_dez_auflage ? 1 : 0;
  if (settings.lg_ch_dez !== undefined) events['LG003'] = settings.lg_ch_dez ? 1 : 0;
  if (settings.lg_ch_dez_auflage !== undefined) events['LG004'] = settings.lg_ch_dez_auflage ? 1 : 0;
  if (settings.lg_verband !== undefined) events['LG005'] = settings.lg_verband ? 1 : 0;
  if (settings.lg_verein !== undefined) events['LG006'] = settings.lg_verein ? 1 : 0;
  if (settings.lg_ch_kniend !== undefined) events['LG007'] = settings.lg_ch_kniend ? 1 : 0;

  if (settings.extras && typeof settings.extras === 'object') {
    Object.entries(settings.extras).forEach(([ekey, ex]) => {
      events[ekey] = ex && ex.active ? 1 : 0;
    });
  } else {
    if (settings.z1_active !== undefined) events['Z001'] = settings.z1_active ? 1 : 0;
    if (settings.z2_active !== undefined) events['Z002'] = settings.z2_active ? 1 : 0;
  }

  const list = Object.entries(events).map(([eventkey, teilgenommen]) => ({
    pn: pn,
    year: _jbYear,
    eventkey,
    teilgenommen: Number(teilgenommen || 0),
    quelle: 'schnellerfassung'
  }));

  const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
  if (!supa) return null;

  // 1. In member_participations speichern
  if (list.length > 0) {
    const dbParts = list.map(item => ({
      id: `${item.pn}-${item.year}-${item.eventkey}`,
      person_number: item.pn,
      year: Number(item.year),
      event_key: item.eventkey,
      teilgenommen: Number(item.teilgenommen || 0),
      quelle: 'schnellerfassung',
      erfasst_am: new Date().toISOString(),
      erfasst_von: window.currentUser || 'frontend'
    }));
    const { error: partErr } = await supa.from('member_participations').upsert(dbParts, { onConflict: 'person_number,year,event_key' });
    if (partErr) throw new Error('Fehler beim Speichern der Teilnahmen: ' + partErr.message);
  }

  // Memory Participations Cache updaten
  if (!_jbParticipationsCache[pn]) _jbParticipationsCache[pn] = [];
  list.forEach(item => {
    const idx = _jbParticipationsCache[pn].findIndex(p => p.eventkey === item.eventkey && Number(p.year) === Number(item.year));
    if (idx >= 0) {
      _jbParticipationsCache[pn][idx].teilgenommen = item.teilgenommen;
    } else {
      _jbParticipationsCache[pn].push({
        PersonNumber: pn,
        year: item.year,
        eventkey: item.eventkey,
        teilgenommen: item.teilgenommen
      });
    }
  });

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pn, settings);
  }

  // 2. Beitrag live berechnen
  const calc = (typeof jbCalculateLiveTotal === 'function') ? jbCalculateLiveTotal(m, settings) : { total: 0, positions: [] };
  const headId = `CH-${_jbYear}-${pn}`;

  // Sicherstellen, dass bereits verrechnete Gruppen- & Einzelgewinne (Konto 1301) niemals verloren gehen
  const verified1301Links = await jbAppendPreserved1301Credits(supa, pn, _jbYear, calc);
  
  // Vorhandenen Header ermitteln
  let existingHeader = (_jbData || []).find(x => String(x.PersonNumber).trim() === pn);
  const statusToSet = existingHeader?.status === 'bezahlt' ? 'bezahlt' : 'offen';

  const { error: hdrErr } = await supa.from('contributions_header').upsert({
    id: headId,
    person_number: pn,
    year: Number(_jbYear),
    status: statusToSet,
    gesamt: calc.total,
    updated_at: new Date().toISOString()
  }, { onConflict: 'id' });
  if (hdrErr) throw new Error('Fehler beim Speichern des Beitrags-Headers: ' + hdrErr.message);

  // Positionen ersetzen
  const newPos = (calc.positions || []).map((p, idx) => ({
    id: `${headId}-${idx + 1}`,
    header_id: headId,
    person_number: pn,
    year: Number(_jbYear),
    position_nr: idx + 1,
    beschreibung: p.name || 'Position',
    betrag: Number(p.betrag || 0),
    typ: p.typ || 'Debit',
    source_field: p.key || '',
    konto: p.konto || (typeof window.jbResolveAccountForPosition === 'function' ? window.jbResolveAccountForPosition(p.key, p.name) : '3000'),
    last_upd: new Date().toISOString()
  }));

  const { error: delPosErr } = await supa.from('contributions_positions').delete().eq('header_id', headId);
  if (delPosErr) throw new Error('Fehler beim Zurücksetzen der Beitragspositionen: ' + delPosErr.message);
  if (newPos.length > 0) {
    const { error: insPosErr } = await supa.from('contributions_positions').insert(newPos);
    if (insPosErr) throw new Error('Fehler beim Speichern der Beitragspositionen: ' + insPosErr.message);
  }

  // Referenzen in group_competition_members auf die neue Positions-ID aktualisieren
  for (const link of verified1301Links) {
    const matchedNewPos = newPos.find(np => np.konto === '1301' && np.beschreibung === link.desc);
    if (matchedNewPos && link.gcmId) {
      const { error: gcmErr } = await supa.from('group_competition_members').update({ contribution_position_id: matchedNewPos.id }).eq('id', link.gcmId);
      if (gcmErr) throw new Error('Fehler beim Aktualisieren der Gruppenpreis-Referenz: ' + gcmErr.message);
    }
  }

  // Lokale Caches updaten (inkl. kompatibler Felder für alle Reader & _jbAllPositions)
  const cachedNewPos = newPos.map(np => ({
    ...np,
    headerid: np.header_id,
    PersonNumber: np.person_number,
    name: np.beschreibung,
    sourcefield: np.source_field,
    key: np.source_field
  }));
  _jbPositionsCache[headId] = cachedNewPos;
  _jbPositionsCache[`${_jbYear}-${pn}`] = cachedNewPos;
  _jbPositionsCache[String(pn)] = cachedNewPos;
  if (existingHeader?.id) {
    _jbPositionsCache[existingHeader.id] = cachedNewPos;
  }
  if (Array.isArray(window._jbAllPositions)) {
    window._jbAllPositions = window._jbAllPositions.filter(p =>
      !(String(p.headerid || p.header_id || '').trim() === headId ||
        (String(p.PersonNumber || p.person_number || '').trim() === pn && Number(p.year) === Number(_jbYear)))
    );
    window._jbAllPositions.push(...cachedNewPos);
    _jbAllPositions = window._jbAllPositions;
  }
  if (existingHeader) {
    existingHeader.Gesamt = calc.total;
    existingHeader.gesamt = calc.total;
    existingHeader.pdf_url = null; // Cache-Invalidierung für neu berechnete Rechnungen
  }

  // 3. Rechnungsentwurf im RechnungsCore zentral synchronisieren (nur unversendeter Entwurf ohne Zahlungen)
  const invoiceId = existingHeader?.invoiceId || existingHeader?.invoice_id;
  if (invoiceId && typeof window.jbSyncOpenDraftInvoice === 'function') {
    const invPositions = newPos.map((p, idx) => ({
      invoice_id: invoiceId,
      position_nr: idx + 1,
      description: p.beschreibung,
      quantity: 1,
      unit_price: p.betrag,
      amount: p.betrag,
      konto: p.konto || '3000',
      source_field: p.source_field || null
    }));
    const syncRes = await window.jbSyncOpenDraftInvoice(supa, invoiceId, {
      totalAmount: calc.total,
      positions: invPositions,
      headerId: existingHeader?.id || headId,
      backgroundPdf: true
    });
    if (syncRes?.updated && syncRes.pdfUrl && existingHeader) {
      existingHeader.pdf_url = syncRes.pdfUrl;
    }
  }

  jbRenderEntryList();
  return calc;
}
window.jbSaveSingleMemberDirect = jbSaveSingleMemberDirect;

let _jbAutoSaveTimer = null;

function jbTriggerAutoSave(pnClean) {
  const statusEl = document.getElementById('jbAutoSaveStatus');
  if (statusEl) {
    statusEl.innerHTML = `<span class="text-warning fw-semibold"><i class="fas fa-spinner fa-spin me-1"></i>Speichere...</span>`;
  }

  if (_jbAutoSaveTimer) clearTimeout(_jbAutoSaveTimer);

  _jbAutoSaveTimer = setTimeout(async () => {
    try {
      const calc = await jbSaveSingleMemberDirect(pnClean);
      const now = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-success fw-bold"><i class="fas fa-check-circle me-1"></i>Gespeichert (${now})</span>`;
      }
    } catch(err) {
      console.warn("Auto-Save Fehler:", err);
      if (statusEl) {
        statusEl.innerHTML = `<span class="text-danger fw-semibold"><i class="fas fa-exclamation-circle me-1"></i>Speicherfehler</span>`;
      }
    }
  }, 400);
}

function jbApplyPreset(presetType, pn) {
  const pnClean = String(pn || '').trim();
  if (!jbCheckEntryEditable(pnClean)) return;
  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (!m) return;

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }

  if (presetType === 'aktiv_a') {
    _jbParticipationsState.schuetzenhaus = true;
    _jbParticipationsState.kk_volksschiessen = '1';
    _jbParticipationsState.kk_verband = true;
    _jbParticipationsState.kk_verein = true;
    _jbParticipationsState.events['GE001'] = 1;
    _jbParticipationsState.events['KK008'] = 1;
    _jbParticipationsState.events['KK006'] = 1;
    _jbParticipationsState.events['KK007'] = 1;
  } else if (presetType === 'aktiv_b') {
    _jbParticipationsState.schuetzenhaus = true;
    _jbParticipationsState.kk_volksschiessen = '1';
    _jbParticipationsState.kk_verband = false;
    _jbParticipationsState.kk_verein = true;
    _jbParticipationsState.events['GE001'] = 1;
    _jbParticipationsState.events['KK008'] = 1;
    _jbParticipationsState.events['KK006'] = 0;
    _jbParticipationsState.events['KK007'] = 1;
  } else if (presetType === 'passiv') {
    _jbParticipationsState.schuetzenhaus = false;
    _jbParticipationsState.kk_volksschiessen = 'keine';
    _jbParticipationsState.kk_verband = false;
    _jbParticipationsState.kk_verein = false;
    _jbParticipationsState.events['GE001'] = 0;
    _jbParticipationsState.events['KK008'] = 0;
    _jbParticipationsState.events['KK006'] = 0;
    _jbParticipationsState.events['KK007'] = 0;
  }

  _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };
  _jbLocalBulkChanges[pnClean].extras = JSON.parse(JSON.stringify(_jbParticipationsState.extras || {}));

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }
  jbRenderEntryList();
  jbRenderEntryForm(m);
  jbTriggerAutoSave(pnClean);
}

function jbHandleSidebarKeyDown(e) {
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    e.preventDefault();
    const search = _jbEntrySearch.toLowerCase().trim();
    const filtered = _jbMembers.filter(m => {
      const name = `${m.FirstName || ''} ${m.LastName || ''} ${m.PersonNumber || ''}`.toLowerCase();
      return !search || name.includes(search);
    });
    if (!filtered.length) return;
    
    let currentIdx = filtered.findIndex(m => String(m.PersonNumber).trim() === String(_jbSelectedMemberPN).trim());
    if (e.key === 'ArrowDown') {
      currentIdx = currentIdx < filtered.length - 1 ? currentIdx + 1 : 0;
    } else if (e.key === 'ArrowUp') {
      currentIdx = currentIdx > 0 ? currentIdx - 1 : filtered.length - 1;
    }
    
    const nextMem = filtered[currentIdx];
    if (nextMem) {
      jbEntrySelectMember(nextMem.PersonNumber);
    }
  }
}

function jbUpdateState(key, val, pn) {
  const pnClean = String(pn || '').trim();
  if (!jbCheckEntryEditable(pnClean)) return;
  _jbParticipationsState[key] = val;

  if (!_jbParticipationsState.events) {
    _jbParticipationsState.events = {};
  }

  // Sync to events map
  if (key === 'schuetzenhaus') _jbParticipationsState.events['GE001'] = val ? 1 : 0;
  else if (key === 'hausmeister') _jbParticipationsState.events['RA002'] = val ? 1 : 0;
  else if (key === 'kk_volksschiessen') _jbParticipationsState.events['KK008'] = val === 'keine' ? 0 : Number(val);
  else if (key === 'kk_verband') _jbParticipationsState.events['KK006'] = val ? 1 : 0;
  else if (key === 'kk_verein') _jbParticipationsState.events['KK007'] = val ? 1 : 0;
  else if (key === 'kk_grenzland') _jbParticipationsState.events['KK001'] = val !== 'keine' ? 1 : 0;
  else if (key === 'ssv_dez') {
    _jbParticipationsState.events['KK002'] = (val === 'liegend' || val === 'liegend_2_3') ? 1 : 0;
    _jbParticipationsState.events['KK003'] = (val === '2-stellung' || val === 'liegend_2_3') ? 1 : 0;
    _jbParticipationsState.events['KK004'] = (val === '3-stellung' || val === 'liegend_2_3') ? 1 : 0;
    _jbParticipationsState.events['KK005'] = val === 'sv' ? 1 : 0;
  } else if (key === 'lg_ag_dez') _jbParticipationsState.events['LG001'] = val ? 1 : 0;
  else if (key === 'lg_ag_dez_auflage') _jbParticipationsState.events['LG002'] = val ? 1 : 0;
  else if (key === 'lg_ch_dez') _jbParticipationsState.events['LG003'] = val ? 1 : 0;
  else if (key === 'lg_ch_dez_auflage') _jbParticipationsState.events['LG004'] = val ? 1 : 0;
  else if (key === 'lg_verband') _jbParticipationsState.events['LG005'] = val ? 1 : 0;
  else if (key === 'lg_verein') _jbParticipationsState.events['LG006'] = val ? 1 : 0;
  else if (key === 'lg_ch_kniend') _jbParticipationsState.events['LG007'] = val ? 1 : 0;
  
  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  }
  _jbLocalBulkChanges[pnClean][key] = val;
  _jbLocalBulkChanges[pnClean].events = { ..._jbParticipationsState.events };
  _jbLocalBulkChanges[pnClean].extras = JSON.parse(JSON.stringify(_jbParticipationsState.extras || {}));

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }

  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    // Bei Eingabefeldern und Schaltern nur die Live-Summary aktualisieren,
    // damit der Cursor im Feld bleibt und der Fokus/Scroll nicht springt!
    if (key.startsWith('z1_') || key.startsWith('z2_') || key === 'schuetzenhaus') {
      jbUpdateLiveSummary(m);
    } else {
      jbRenderEntryForm(m);
    }
  }

  jbTriggerAutoSave(pnClean);
}

// 6. Formular-Reset
function jbEntryResetForm(pn) {
  const pnClean = String(pn || '').trim();
  if (!jbCheckEntryEditable(pnClean)) return;

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  const refYear = (typeof _jbYear !== 'undefined' && _jbYear) ? Number(_jbYear) : new Date().getFullYear();
  const age = m && m.BirthDate ? (refYear - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;
  const hatG50m = m && (m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || []).some(l => 
    (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate && (l.MembershipCategory || '').toLowerCase().includes('g50')
  );
  const defaultGe = m ? (!isJunior && hatG50m && !m._istPassiv) : false;

  const ownLiz = (m?._lizenzen || []).find(l => l.istMuhen);
  const derivedLizenz = ownLiz
    ? (isJunior ? 'junior' : 'verein')
    : ((m?._lizenzen || []).length > 0 ? 'fremd' : (m?._istPassiv ? 'passiv' : 'keine'));

  _jbParticipationsState = {
    lizenz: derivedLizenz,
    events: {
      'GE001': defaultGe ? 1 : 0
    },
    kk_volksschiessen: 'keine',
    ssv_dez: 'keine',
    kk_grenzland: 'keine',
    kk_verband: false,
    kk_verein: false,
    lg_ag_dez: false,
    lg_ag_dez_auflage: false,
    lg_ch_dez: false,
    lg_ch_dez_auflage: false,
    lg_verband: false,
    lg_verein: false,
    lg_ch_kniend: false,
    schuetzenhaus: defaultGe
  };

  _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  jbUpdateBulkSaveButton();
  jbRenderEntryList();

  if (m) {
    jbRenderEntryForm(m);
  }
  jbTriggerAutoSave(pnClean);
}

// 7. Direkt in Supabase speichern & Automatisch zum nächsten Schützen springen
async function jbEntrySaveAndNext(pn) {
  const pnClean = String(pn || '').trim();
  if (!jbCheckEntryEditable(pnClean)) return;

  const runSave = async () => {
    const calc = await jbSaveSingleMemberDirect(pnClean);
    showToast(`✅ Änderungen für ${pnClean} gespeichert (CHF ${(calc?.total || 0).toFixed(2)})!`);
    jbEntrySelectNext();
  };

  try {
    if (window.UIButtonKit && typeof window.UIButtonKit.withLoading === 'function') {
      await window.UIButtonKit.withLoading('#jbEntrySaveNextBtn', runSave);
    } else {
      await runSave();
    }
  } catch (err) {
    console.error('Fehler beim Speichern:', err);
    await UIConfirmKit.alert({
      title: 'Fehler beim Speichern',
      message: err.message || String(err),
      type: 'danger'
    });
  }
}

function jbEntrySelectNext() {
  const currentIdx = _jbMembers.findIndex(m => String(m.PersonNumber || '').trim() === String(_jbSelectedMemberPN || '').trim());
  if (currentIdx >= 0 && currentIdx < _jbMembers.length - 1) {
    const nextPn = _jbMembers[currentIdx + 1].PersonNumber;
    jbEntrySelectMember(nextPn);
    jbScrollToActiveMember();
  } else {
    showToast("🎉 Letzter Schütze in der Liste erreicht!");
  }
}

function jbEntrySelectPrev() {
  const currentIdx = _jbMembers.findIndex(m => String(m.PersonNumber || '').trim() === String(_jbSelectedMemberPN || '').trim());
  if (currentIdx > 0) {
    const prevPn = _jbMembers[currentIdx - 1].PersonNumber;
    jbEntrySelectMember(prevPn);
    jbScrollToActiveMember();
  }
}

function jbScrollToActiveMember() {
  const listEl = document.getElementById('jbEntryMemberList');
  if (!listEl) return;
  setTimeout(() => {
    const activeItem = listEl.querySelector('.active');
    if (activeItem) {
      activeItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, 100);
}

function jbUpdateBulkSaveButton() {
  const container = document.getElementById('jbBulkSaveContainer');
  const countSpan = document.getElementById('jbBulkSaveCount');
  if (!container) return;

  const count = Object.keys(_jbLocalBulkChanges).length;
  if (count > 0) {
    container.classList.remove('d-none');
    if (countSpan) countSpan.textContent = count;
  } else {
    container.classList.add('d-none');
  }
}

async function jbSaveAllBulkLocalChanges() {
  if (!jbHasManageAccess()) {
    await UIConfirmKit.alert({
      title: 'Keine Berechtigung',
      message: 'Du hast keine Berechtigung zum Speichern (jahresbeitrag.manage erforderlich).',
      type: 'danger'
    });
    return;
  }

  const allKeys = Object.keys(_jbLocalBulkChanges);
  if (allKeys.length === 0) return;

  const unlockedPNs = [];
  const skippedLockedPNs = [];
  allKeys.forEach(pn => {
    const lockState = typeof window.jbGetContributionLockState === 'function'
      ? window.jbGetContributionLockState(pn)
      : { isLocked: false };
    if (lockState.isLocked) skippedLockedPNs.push(pn);
    else unlockedPNs.push(pn);
  });

  if (unlockedPNs.length === 0) {
    await UIConfirmKit.alert({
      title: 'Alle Einträge gesperrt',
      message: 'Alle geänderten Mitglieder haben bereits versendete oder bezahlte Rechnungen und können nicht mehr geändert werden.',
      type: 'warning'
    });
    return;
  }

  const count = unlockedPNs.length;
  const runBulk = async () => {
    showLoadingOverlay(`Speichere Änderungen für ${count} Schützen und berechne Beiträge neu…`);
    const list = [];
    const year = _jbYear;

    unlockedPNs.forEach(pn => {
      const state = _jbLocalBulkChanges[pn] || {};
      const events = state.events ? { ...state.events } : {};

      if (state.schuetzenhaus !== undefined) events['GE001'] = state.schuetzenhaus ? 1 : 0;
      if (state.hausmeister !== undefined) events['RA002'] = state.hausmeister ? 1 : 0;
      if (state.kk_volksschiessen !== undefined) events['KK008'] = state.kk_volksschiessen === 'keine' ? 0 : Number(state.kk_volksschiessen);
      if (state.kk_verein !== undefined) events['KK007'] = state.kk_verein ? 1 : 0;
      if (state.kk_verband !== undefined) events['KK006'] = state.kk_verband ? 1 : 0;
      if (state.kk_grenzland !== undefined) events['KK001'] = state.kk_grenzland !== 'keine' ? 1 : 0;
      if (state.ssv_dez !== undefined) {
        const ssv = state.ssv_dez;
        events['KK002'] = (ssv === 'liegend' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK003'] = (ssv === '2-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK004'] = (ssv === '3-stellung' || ssv === 'liegend_2_3') ? 1 : 0;
        events['KK005'] = ssv === 'sv' ? 1 : 0;
      }
      if (state.lg_ag_dez !== undefined) events['LG001'] = state.lg_ag_dez ? 1 : 0;
      if (state.lg_ag_dez_auflage !== undefined) events['LG002'] = state.lg_ag_dez_auflage ? 1 : 0;
      if (state.lg_ch_dez !== undefined) events['LG003'] = state.lg_ch_dez ? 1 : 0;
      if (state.lg_ch_dez_auflage !== undefined) events['LG004'] = state.lg_ch_dez_auflage ? 1 : 0;
      if (state.lg_verband !== undefined) events['LG005'] = state.lg_verband ? 1 : 0;
      if (state.lg_verein !== undefined) events['LG006'] = state.lg_verein ? 1 : 0;
      if (state.lg_ch_kniend !== undefined) events['LG007'] = state.lg_ch_kniend ? 1 : 0;

      if (state.extras && typeof state.extras === 'object') {
        Object.entries(state.extras).forEach(([ekey, ex]) => {
          events[ekey] = ex && ex.active ? 1 : 0;
        });
      } else {
        if (state.z1_active !== undefined) events['Z001'] = state.z1_active ? 1 : 0;
        if (state.z2_active !== undefined) events['Z002'] = state.z2_active ? 1 : 0;
      }

      Object.entries(events).forEach(([eventkey, teilgenommen]) => {
        list.push({
          pn,
          year,
          eventkey,
          teilgenommen: Number(teilgenommen || 0),
          quelle: 'schnellerfassung'
        });
      });
    });

    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    if (!supa) throw new Error('Supabase Client nicht verfügbar.');

    if (list.length > 0) {
      const dbParts = list.map(item => ({
        id: `${item.pn}-${item.year}-${item.eventkey}`,
        person_number: item.pn,
        year: Number(item.year),
        event_key: item.eventkey,
        teilgenommen: Number(item.teilgenommen || 0),
        quelle: 'schnellerfassung',
        erfasst_am: new Date().toISOString(),
        erfasst_von: window.currentUser || 'frontend'
      }));
      const { error: partErr } = await supa.from('member_participations').upsert(dbParts, { onConflict: 'person_number,year,event_key' });
      if (partErr) throw new Error('Fehler beim Speichern der Teilnahmen: ' + partErr.message);
    }

    for (const pn of unlockedPNs) {
      const m = (_jbMemberMap && _jbMemberMap[pn]) || (_jbMembers || []).find(x => String(x.PersonNumber).trim() === pn);
      if (m && typeof jbCalculateLiveTotal === 'function') {
        const settings = _jbLocalBulkChanges[pn] || {};
        const calc = jbCalculateLiveTotal(m, settings);
        const headId = `CH-${year}-${pn}`;

        const verified1301Links = await jbAppendPreserved1301Credits(supa, pn, year, calc);

        const { error: hdrErr } = await supa.from('contributions_header').upsert({
          id: headId,
          person_number: pn,
          year: Number(year),
          status: 'offen',
          gesamt: calc.total,
          updated_at: new Date().toISOString()
        }, { onConflict: 'person_number,year' });
        if (hdrErr) throw new Error(`Fehler bei Header ${pn}: ${hdrErr.message}`);

        const newPos = calc.positions.map((p, idx) => ({
          id: `${headId}-${idx + 1}`,
          header_id: headId,
          person_number: pn,
          year: Number(year),
          position_nr: idx + 1,
          beschreibung: p.name || 'Position',
          betrag: Number(p.betrag || 0),
          typ: p.typ || 'Debit',
          source_field: p.key || '',
          konto: p.konto || (typeof window.jbResolveAccountForPosition === 'function' ? window.jbResolveAccountForPosition(p.key, p.name) : '3000'),
          last_upd: new Date().toISOString()
        }));

        const { error: delErr } = await supa.from('contributions_positions').delete().eq('header_id', headId);
        if (delErr) throw new Error(`Fehler beim Zurücksetzen der Positionen (${pn}): ${delErr.message}`);
        if (newPos.length > 0) {
          const { error: insErr } = await supa.from('contributions_positions').insert(newPos);
          if (insErr) throw new Error(`Fehler beim Speichern der Positionen (${pn}): ${insErr.message}`);
        }

        for (const link of verified1301Links) {
          const matchedNewPos = newPos.find(np => np.konto === '1301' && np.beschreibung === link.desc);
          if (matchedNewPos && link.gcmId) {
            const { error: gcmErr } = await supa.from('group_competition_members').update({ contribution_position_id: matchedNewPos.id }).eq('id', link.gcmId);
            if (gcmErr) throw new Error(`Fehler bei Gruppenpreis-Verknüpfung (${pn}): ${gcmErr.message}`);
          }
        }
      }
    }

    showToast(
      `🎉 ${count} Schützen erfolgreich gespeichert und Beiträge neu berechnet!` +
      (skippedLockedPNs.length > 0 ? ` (${skippedLockedPNs.length} gesperrte übersprungen)` : '')
    );

    _jbLocalBulkChanges = {};
    jbUpdateBulkSaveButton();
    await loadJahresbeitragData(true, false);

    // Nur offene Rechnungsentwürfe synchronisieren
    for (const pn of unlockedPNs) {
      const cleanPn = pn.trim();
      const updatedHeader = _jbData.find(x => String(x.PersonNumber).trim() === cleanPn);
      if (updatedHeader && updatedHeader.invoiceId) {
        const lockState = typeof window.jbGetContributionLockState === 'function'
          ? window.jbGetContributionLockState(updatedHeader)
          : { isLocked: false };
        if (lockState.isLocked) continue;

        const updatedM = _jbMemberMap[cleanPn] || {};
        const updatedName = updatedM.FirstName ? `${updatedM.FirstName} ${updatedM.LastName}` : cleanPn;
        try {
          if (typeof ensureInvoiceCreatedRemote === 'function') {
            await ensureInvoiceCreatedRemote(updatedHeader, updatedM, updatedName);
          }
        } catch (err) {
          console.error(`⚠️ Fehler bei automatischer Rechnungs-Aktualisierung für ${cleanPn}:`, err);
        }
      }
    }

    if (typeof loadRechnungenData === 'function') {
      await loadRechnungenData(true, true);
    }
    if (typeof jbMergeInvoicesIntoData === 'function') {
      jbMergeInvoicesIntoData(window._jbAllInvoices || []);
    }

    _jbActiveTab = 'overview';
    renderJahresbeitragView();
  };

  try {
    if (window.UIButtonKit && typeof window.UIButtonKit.withLoading === 'function') {
      await window.UIButtonKit.withLoading('#jbBulkSaveContainer button', runBulk);
    } else {
      await runBulk();
    }
  } catch (e) {
    await UIConfirmKit.alert({
      title: 'Fehler beim Speichern',
      message: 'Fehler beim Bulk-Speichern: ' + (e.message || e),
      type: 'danger'
    });
  } finally {
    hideLoadingOverlay();
  }
}

// 8. TASTENSTEUERUNG (Mausrad scrollt die Liste natuerlich)
function jbAddScrollSupport() {
  const listEl = document.getElementById('jbEntryMemberList');
  if (!listEl) return;

  document.onkeydown = function(e) {
    if (_jbActiveTab !== 'entry' || !_jbSelectedMemberPN) return;
    
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'SELECT') return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      jbEntrySelectNext();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      jbEntrySelectPrev();
    }
  };
}

function jbHandleExtraKontoChange(field, rawVal, pn) {
  const code = String(rawVal || '').split('|')[0].trim();
  jbUpdateState(field, code, pn);
  const inputEl = document.getElementById(`${field}_${pn}`);
  if (inputEl) {
    inputEl.value = code;
    inputEl.title = jbGetAccountTitle(code);
  }
}
window.jbHandleExtraKontoChange = jbHandleExtraKontoChange;

function jbGetAccountTitle(code) {
  if (!code) return '';
  const konten = window._bhKontenrahmen || [];
  const acc = konten.find(a => String(a.konto).trim() === String(code).trim());
  return acc ? `${acc.konto} - ${acc.bezeichnung}` : `Konto ${code}`;
}
window.jbGetAccountTitle = jbGetAccountTitle;

function jbApplySidebarSorting() {
  _jbMembers.sort((a, b) => {
    if (_jbSidebarSort === 'modified') {
      const isModA = _jbLocalBulkChanges[String(a.PersonNumber)] !== undefined ? 1 : 0;
      const isModB = _jbLocalBulkChanges[String(b.PersonNumber)] !== undefined ? 1 : 0;
      if (isModA !== isModB) {
        return isModB - isModA;
      }
    }

    if (_jbSidebarSort === 'status') {
      const statA = a._istEhren ? 1 : (a._istPassiv ? 3 : 2);
      const statB = b._istEhren ? 1 : (b._istPassiv ? 3 : 2);
      if (statA !== statB) {
        return statA - statB;
      }
    }

    const nameA = `${a.LastName || ''} ${a.FirstName || ''}`.toLowerCase();
    const nameB = `${b.LastName || ''} ${b.FirstName || ''}`.toLowerCase();
    return nameA.localeCompare(nameB);
  });
}

function jbSortSidebar(col) {
  _jbSidebarSort = col;
  jbApplySidebarSorting();
  jbRenderEntryList();
}

// ============================================================
// DYNAMISCHE VARIABLE ZUSATZPOSITIONEN (100% AUS GEBÜHRENCONFIG)
// ============================================================
function jbRenderVariableZusatzHTML(m, state) {
  const fees = (window._jbGebuehren || []).filter(f => {
    if (f.aktiv === false || f.aktiv === 'false' || f.aktiv === 0 || f.aktiv === '0') return false;
    const kat = String(f.kategorie || '').toLowerCase();
    const uiTyp = String(f.ui_typ || '').toLowerCase();
    const key = String(f.key || '').toUpperCase();
    return uiTyp === 'amount' || kat === 'variabel' || key.startsWith('Z');
  }).sort((a, b) => Number(a.sort_order || a.ui_sort || 10) - Number(b.sort_order || b.ui_sort || 10));

  if (fees.length === 0) return '';

  const extrasState = state.extras || {};

  return `
    <div class="card p-3 border-0 shadow-sm mb-3 rounded-3 bg-white border-start border-4 border-info">
      <div class="d-flex justify-content-between align-items-center mb-2">
        <h6 class="text-secondary fw-bold mb-0" style="font-size: 12px; text-transform: uppercase;">
          <i class="fas fa-plus-circle me-2 text-info"></i>Variable Zusatzpositionen (Freie Beträge)
        </h6>
        <div>
          <button type="button" class="btn btn-xs btn-outline-primary fw-bold me-1" onclick="jbToggleAllAktiveZusatz(true, '${m.PersonNumber}')" style="font-size: 10px;">
            <i class="fas fa-bolt me-1"></i>⚡ Für Aktive (AN)
          </button>
          <button type="button" class="btn btn-xs btn-outline-secondary fw-bold" onclick="jbToggleAllAktiveZusatz(false, '${m.PersonNumber}')" style="font-size: 10px;">
            Alle abwählen
          </button>
        </div>
      </div>
      
      ${fees.map(f => {
        const key = f.key;
        let isActive = false;
        let textVal = f.bezeichnung_frontend || f.bezeichnungfrontend || f.bezeichnung || f.ui_feld || key;
        let betragVal = Number(f.betrag || 0);
        let kontoVal = f.konto_haben || f.konto || '8500';
        let isUnlocked = false;

        if (extrasState[key]) {
          isActive = !!extrasState[key].active;
          if (extrasState[key].text) textVal = extrasState[key].text;
          if (extrasState[key].betrag !== undefined) betragVal = Number(extrasState[key].betrag);
          if (extrasState[key].konto) kontoVal = extrasState[key].konto;
          if (extrasState[key].unlocked) isUnlocked = true;
        } else if (key === 'Z001' && (state.z1_active !== undefined || state.z1_text || state.z1_betrag !== undefined)) {
          isActive = !!state.z1_active;
          if (state.z1_text) textVal = state.z1_text;
          if (state.z1_betrag !== undefined) betragVal = Number(state.z1_betrag);
          if (state.z1_konto) kontoVal = state.z1_konto;
          if (state.z1_unlocked) isUnlocked = true;
        } else if (key === 'Z002' && (state.z2_active !== undefined || state.z2_text || state.z2_betrag !== undefined)) {
          isActive = !!state.z2_active;
          if (state.z2_text) textVal = state.z2_text;
          if (state.z2_betrag !== undefined) betragVal = Number(state.z2_betrag);
          if (state.z2_konto) kontoVal = state.z2_konto;
          if (state.z2_unlocked) isUnlocked = true;
        }

        return `
          <div class="p-2 bg-light rounded-2 border mb-2" id="extra_row_${key}_${m.PersonNumber}">
            <div class="row g-2 align-items-center">
              <div class="col-auto">
                <input class="form-check-input" type="checkbox" id="extra_active_${key}_${m.PersonNumber}" 
                       ${isActive ? 'checked' : ''} 
                       onchange="jbUpdateExtraState('${key}', 'active', this.checked, '${m.PersonNumber}')">
              </div>
              <div class="col">
                <input type="text" class="form-control form-control-sm" id="extra_text_${key}_${m.PersonNumber}"
                       placeholder="Bezeichnung (z. B. ${escHtml(f.bezeichnungfrontend || f.bezeichnung)})" 
                       value="${escHtml(textVal)}" 
                       oninput="jbUpdateExtraState('${key}', 'text', this.value, '${m.PersonNumber}')">
              </div>
              <div class="col-3">
                <div class="input-group input-group-sm">
                  <span class="input-group-text px-1">CHF</span>
                  <input type="number" step="0.05" class="form-control form-control-sm text-end" id="extra_betrag_${key}_${m.PersonNumber}"
                         placeholder="${betragVal.toFixed(2)}" 
                         value="${(!isActive && betragVal === 0) ? '' : betragVal}" 
                         oninput="jbUpdateExtraState('${key}', 'betrag', parseFloat(this.value)||0, '${m.PersonNumber}')">
                </div>
              </div>
              <div class="col-auto">
                <div class="input-group input-group-sm" style="width: 155px;">
                  <input type="text" id="extra_konto_${key}_${m.PersonNumber}" class="form-control form-control-sm font-monospace" 
                         list="jb-konten-datalist"
                         placeholder="Konto..."
                         value="${escHtml(kontoVal)}" 
                         ${isUnlocked ? '' : 'readonly style="background-color: #e9ecef;"'}
                         onchange="jbUpdateExtraState('${key}', 'konto', this.value, '${m.PersonNumber}')"
                         title="${jbGetAccountTitle(kontoVal)}">
                  <button class="btn btn-outline-secondary" type="button" 
                          onclick="jbToggleExtraKontoLock('${key}', '${m.PersonNumber}')" 
                          title="${isUnlocked ? 'Konto sperren' : 'Konto aus Kontenrahmen wählen'}">
                    <i class="fas ${isUnlocked ? 'fa-lock-open text-warning' : 'fa-lock'}"></i>
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}
window.jbRenderVariableZusatzHTML = jbRenderVariableZusatzHTML;

window.jbUpdateExtraState = function(key, field, val, pn) {
  const pnClean = String(pn || '').trim();
  if (!jbCheckEntryEditable(pnClean)) return;
  key = String(key || '').trim().toUpperCase();

  if (!_jbParticipationsState.extras) _jbParticipationsState.extras = {};
  if (!_jbParticipationsState.extras[key]) {
    const f = (window._jbGebuehren || []).find(x => String(x.key || '').trim().toUpperCase() === key);
    _jbParticipationsState.extras[key] = {
      key: key,
      active: false,
      text: f ? (f.bezeichnung_frontend || f.bezeichnungfrontend || f.bezeichnung || f.ui_feld || key) : key,
      betrag: f ? Number(f.betrag || 0) : 0,
      konto: f ? (f.konto_haben || f.konto || '8500') : '8500',
      unlocked: false
    };
  }

  _jbParticipationsState.extras[key][field] = val;

  // Wenn ein individueller Betrag (!== 0) eingetippt wird, die Position automatisch aktivieren,
  // damit der erfasste Betrag garantiert gespeichert wird und nicht verloren geht.
  if (field === 'betrag' && Number(val) !== 0 && !_jbParticipationsState.extras[key].active) {
    _jbParticipationsState.extras[key].active = true;
    const chkEl = document.getElementById(`extra_active_${key}_${pnClean}`);
    if (chkEl) chkEl.checked = true;
  }

  // Abwärtskompatible Brücke für historische z1 und z2
  if (key === 'Z001') {
    _jbParticipationsState.z1_active = _jbParticipationsState.extras[key].active;
    if (field === 'text') _jbParticipationsState.z1_text = val;
    if (field === 'betrag') _jbParticipationsState.z1_betrag = val;
    if (field === 'konto') _jbParticipationsState.z1_konto = val;
    if (field === 'unlocked') _jbParticipationsState.z1_unlocked = val;
  } else if (key === 'Z002') {
    _jbParticipationsState.z2_active = _jbParticipationsState.extras[key].active;
    if (field === 'text') _jbParticipationsState.z2_text = val;
    if (field === 'betrag') _jbParticipationsState.z2_betrag = val;
    if (field === 'konto') _jbParticipationsState.z2_konto = val;
    if (field === 'unlocked') _jbParticipationsState.z2_unlocked = val;
  }

  if (!_jbLocalBulkChanges[pnClean]) {
    _jbLocalBulkChanges[pnClean] = {
      ..._jbParticipationsState,
      events: { ...(_jbParticipationsState.events || {}) },
      extras: JSON.parse(JSON.stringify(_jbParticipationsState.extras || {}))
    };
  }
  if (!_jbLocalBulkChanges[pnClean].extras) {
    _jbLocalBulkChanges[pnClean].extras = {};
  }
  _jbLocalBulkChanges[pnClean].extras[key] = { ..._jbParticipationsState.extras[key] };
  if (key === 'Z001') {
    _jbLocalBulkChanges[pnClean].z1_active = _jbParticipationsState.z1_active;
    _jbLocalBulkChanges[pnClean].z1_text = _jbParticipationsState.z1_text;
    _jbLocalBulkChanges[pnClean].z1_betrag = _jbParticipationsState.z1_betrag;
    _jbLocalBulkChanges[pnClean].z1_konto = _jbParticipationsState.z1_konto;
  } else if (key === 'Z002') {
    _jbLocalBulkChanges[pnClean].z2_active = _jbParticipationsState.z2_active;
    _jbLocalBulkChanges[pnClean].z2_text = _jbParticipationsState.z2_text;
    _jbLocalBulkChanges[pnClean].z2_betrag = _jbParticipationsState.z2_betrag;
    _jbLocalBulkChanges[pnClean].z2_konto = _jbParticipationsState.z2_konto;
  }

  if (typeof jbSyncMemberToCache === 'function') {
    jbSyncMemberToCache(pnClean, _jbParticipationsState);
  }

  jbRenderEntryList();

  const m = _jbMembers.find(x => String(x.PersonNumber || '').trim() === pnClean);
  if (m) {
    jbUpdateLiveSummary(m);
  }

  jbTriggerAutoSave(pnClean);
};

window.jbToggleExtraKontoLock = function(key, pn) {
  const pnClean = String(pn || '').trim();
  key = String(key || '').trim().toUpperCase();

  if (!_jbParticipationsState.extras) _jbParticipationsState.extras = {};
  if (!_jbParticipationsState.extras[key]) {
    const f = (window._jbGebuehren || []).find(x => String(x.key || '').trim().toUpperCase() === key);
    _jbParticipationsState.extras[key] = {
      key: key,
      active: false,
      text: f ? (f.bezeichnung_frontend || f.bezeichnungfrontend || f.bezeichnung || f.ui_feld || key) : key,
      betrag: f ? Number(f.betrag || 0) : 0,
      konto: f ? (f.konto_haben || f.konto || '8500') : '8500',
      unlocked: false
    };
  }

  const current = !!_jbParticipationsState.extras[key].unlocked;
  const next = !current;
  _jbParticipationsState.extras[key].unlocked = next;

  if (!_jbLocalBulkChanges[pnClean]) _jbLocalBulkChanges[pnClean] = { ..._jbParticipationsState };
  if (!_jbLocalBulkChanges[pnClean].extras) _jbLocalBulkChanges[pnClean].extras = {};
  _jbLocalBulkChanges[pnClean].extras[key] = { ..._jbParticipationsState.extras[key] };

  const inputEl = document.getElementById(`extra_konto_${key}_${pnClean}`);
  if (inputEl) {
    if (next) {
      inputEl.removeAttribute('readonly');
      inputEl.style.backgroundColor = '';
      inputEl.focus();
    } else {
      inputEl.setAttribute('readonly', 'readonly');
      inputEl.style.backgroundColor = '#e9ecef';
    }
  }

  if (window.event && window.event.currentTarget) {
    window.event.currentTarget.title = next ? 'Konto sperren' : 'Konto bearbeiten';
    const icon = window.event.currentTarget.querySelector('i');
    if (icon) {
      icon.className = `fas ${next ? 'fa-lock-open text-warning' : 'fa-lock'}`;
    }
  }
};

window.jbToggleKontoLock = function(key, pn) {
  const cleanKey = key.startsWith('z1') ? 'Z001' : (key.startsWith('z2') ? 'Z002' : key);
  window.jbToggleExtraKontoLock(cleanKey, pn);
};

window.jbToggleAllAktiveZusatz = async function(activateState, currentPn) {
  if (!jbHasManageAccess()) {
    await UIConfirmKit.alert({
      title: 'Keine Berechtigung',
      message: 'Du hast keine Berechtigung für diese Massenaktion (jahresbeitrag.manage erforderlich).',
      type: 'danger'
    });
    return;
  }

  // Nimmt die erste aktive Zusatzposition aus gebuehren_config (z.B. Z001)
  const zFee = (window._jbGebuehren || []).find(f => {
    const uiTyp = String(f.ui_typ || '').toLowerCase();
    const kat = String(f.kategorie || '').toLowerCase();
    const k = String(f.key || '').toUpperCase();
    return f.aktiv !== false && (uiTyp === 'amount' || kat === 'variabel' || k.startsWith('Z'));
  });

  const feeKey = zFee ? zFee.key : 'Z001';
  const feeName = zFee ? (zFee.bezeichnung_frontend || zFee.bezeichnungfrontend || zFee.bezeichnung || zFee.ui_feld) : 'Beitrag Vereinsjacke';
  const feeBetrag = zFee ? Number(zFee.betrag || 0) : 60;
  const feeKonto = zFee ? (zFee.konto_haben || zFee.konto || '8500') : '8500';

  const textMsg = activateState ? `für ALLE entsperrten aktiven Schützen aktivieren` : `für ALLE entsperrten Schützen abwählen`;
  const ok = await UIConfirmKit.confirm({
    title: 'Zusatzposition anpassen?',
    message: `Möchtest du die Zusatzposition <strong>${feeKey} (${feeName})</strong> ${textMsg} und die Beiträge sofort in Supabase neu berechnen?`,
    type: 'warning',
    confirmText: activateState ? 'Aktivieren & Speichern' : 'Abwählen & Speichern'
  });

  if (!ok) return;

  const refYear = (typeof _jbYear !== 'undefined' && _jbYear) ? Number(_jbYear) : new Date().getFullYear();
  const affectedPns = [];
  let skippedLocked = 0;

  _jbMembers.forEach(m => {
    const isEhren = m._istEhren || false;
    const isPassiv = m._istPassiv || false;
    const age = m.BirthDate ? (refYear - new Date(m.BirthDate).getFullYear()) : 0;
    const isJunior = age > 0 && age <= 20;

    if (!activateState || (!isPassiv && !isEhren && !isJunior)) {
      const pnClean = String(m.PersonNumber || '').trim();
      const lockState = typeof window.jbGetContributionLockState === 'function'
        ? window.jbGetContributionLockState(pnClean)
        : { isLocked: false };
      if (lockState.isLocked) {
        skippedLocked++;
        return;
      }
      affectedPns.push(pnClean);
    }
  });

  if (affectedPns.length === 0) {
    await UIConfirmKit.alert({
      title: 'Keine bearbeitbaren Mitglieder',
      message: skippedLocked > 0
        ? `Alle betroffenen ${skippedLocked} Schützen haben bereits versendete oder bezahlte Rechnungen und bleiben unverändert.`
        : 'Keine passenden Mitglieder gefunden.',
      type: 'warning'
    });
    return;
  }

  try {
    showLoadingOverlay(`Aktualisiere ${feeKey} für ${affectedPns.length} Schützen in Supabase…`);
    const supa = (typeof getJahresbeitragSupabaseClient === 'function') ? getJahresbeitragSupabaseClient() : null;
    if (!supa) throw new Error('Supabase Client nicht verfügbar.');

    const dbParts = affectedPns.map(pn => ({
      id: `${pn}-${refYear}-${feeKey}`,
      person_number: pn,
      year: refYear,
      event_key: feeKey,
      teilgenommen: activateState ? 1 : 0,
      quelle: 'schnellerfassung',
      erfasst_am: new Date().toISOString(),
      erfasst_von: window.currentUser || 'frontend'
    }));

    for (let i = 0; i < dbParts.length; i += 50) {
      const chunk = dbParts.slice(i, i + 50);
      const { error: partErr } = await supa.from('member_participations').upsert(chunk, { onConflict: 'person_number,year,event_key' });
      if (partErr) throw new Error('Fehler beim Speichern der Teilnahmen: ' + partErr.message);
    }

    const { error: rpcErr } = await supa.rpc('calculate_member_contributions', {
      p_year: refYear,
      p_target_pns: affectedPns
    });
    if (rpcErr) throw new Error('Fehler bei serverseitiger Neuberechnung: ' + rpcErr.message);

    await loadJahresbeitragData(true, false);

    // Offene Entwurfsrechnungen synchronisieren
    for (const pn of affectedPns) {
      const updatedHeader = _jbData.find(x => String(x.PersonNumber).trim() === pn);
      if (updatedHeader && updatedHeader.invoiceId) {
        const lockState = typeof window.jbGetContributionLockState === 'function'
          ? window.jbGetContributionLockState(updatedHeader)
          : { isLocked: false };
        if (lockState.isLocked) continue;
        const updatedM = _jbMemberMap[pn] || {};
        const updatedName = updatedM.FirstName ? `${updatedM.FirstName} ${updatedM.LastName}` : pn;
        if (typeof ensureInvoiceCreatedRemote === 'function') {
          await ensureInvoiceCreatedRemote(updatedHeader, updatedM, updatedName);
        }
      }
    }

    if (currentPn) {
      const currentPnClean = String(currentPn).trim();
      const currentLocked = typeof window.jbGetContributionLockState === 'function'
        ? window.jbGetContributionLockState(currentPnClean).isLocked
        : false;
      if (!currentLocked && affectedPns.includes(currentPnClean)) {
        if (!_jbParticipationsState.extras) _jbParticipationsState.extras = {};
        _jbParticipationsState.extras[feeKey] = {
          key: feeKey,
          active: activateState,
          text: feeName,
          betrag: feeBetrag,
          konto: feeKonto,
          unlocked: false
        };
      }
      await jbEntrySelectMember(currentPnClean);
    }
    jbRenderEntryList();

    showToast(
      `⚡ ${feeName} für ${affectedPns.length} Schützen ${activateState ? 'aktiviert' : 'abgewählt'} & gespeichert.` +
      (skippedLocked > 0 ? ` (${skippedLocked} gesperrte übersprungen)` : ''),
      'success'
    );
  } catch (err) {
    await UIConfirmKit.alert({
      title: 'Fehler bei Massenaktion',
      message: err.message || String(err),
      type: 'danger'
    });
  } finally {
    hideLoadingOverlay();
  }
};
