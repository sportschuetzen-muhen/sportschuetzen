// === MODUL: SYSTEM-MAILS ===
// Supabase-First Architektur (Phase 14)
// Liest/schreibt aus public.system_mail_configs.
// Dual-Write: Nach Supabase-Speicherung wird asynchron zu GAS (App_Info) gespiegelt.

let sysMailState = {
  configs: [],   // Zeilen aus public.system_mail_configs
  members: []    // Mitglieder für Dropdown (nicht verstorben, nicht ausgetreten, mit E-Mail)
};
let sysMailOriginal = null; // Deep-Copy für Change-Detection beim Dual-Write

// =========================================================
//  SUPABASE CLIENT HELPER
// =========================================================
function getSysMailSupabaseClient() {
  if (typeof window.getSupabaseClient === 'function') return window.getSupabaseClient();
  return window.supabaseClient || null;
}

// =========================================================
//  DATEN LADEN (Supabase-First)
// =========================================================
async function loadSystemMailsData(force = false) {
  const container = document.getElementById('system-mails-container');
  if (!container) return;

  // RAM-Cache
  if (!force && sysMailState.configs.length > 0 && document.getElementById('sys-mail-list')) {
    console.log('⚡ loadSystemMailsData: Lade aus RAM-Cache...');
    return;
  }

  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade System-Mail-Verteiler...</div>
    </div>
  `;

  const supa = getSysMailSupabaseClient();

  // --- 1. SUPABASE ---
  if (supa) {
    try {
      const [configRes, memberRes] = await Promise.all([
        supa
          .from('system_mail_configs')
          .select('*')
          .order('modul', { ascending: true })
          .order('sort_order', { ascending: true }),
        supa
          .from('members')
          .select('person_number, first_name, last_name, primary_email')
          .eq('deceased', false)
          .is('club_exit_date', null)
          .not('primary_email', 'is', null)
          .neq('primary_email', '')
          .order('last_name', { ascending: true })
          .order('first_name', { ascending: true })
      ]);

      if (configRes.error) throw configRes.error;

      sysMailState.configs = (configRes.data || []).filter(cfg => cfg.schluessel !== 'Info_Mail_Kassier');
      sysMailState.members = (memberRes.data || []).map(m => ({
        name: `${m.last_name} ${m.first_name}`.trim(),
        email: m.primary_email
      }));
      sysMailOriginal = JSON.parse(JSON.stringify(sysMailState.configs));

      console.log(`✅ ${sysMailState.configs.length} System-Mail-Configs aus Supabase geladen.`);
      renderSystemMailsUI(container);
      return;

    } catch (supaErr) {
      console.warn('⚠️ Supabase fehlgeschlagen, versuche GAS-Fallback:', supaErr);
    }
  }

  // --- 2. GAS-FALLBACK ---
  try {
    const res  = await apiFetch('termine', 'action=loadAdminData');
    const data = await res.json();

    // app_info → configs konvertieren
    sysMailState.configs = (data.app_info || [])
      .filter(info => (info.bezeichnung || info.schluessel) !== 'Info_Mail_Kassier')
      .map((info, i) => ({
      id:          null,
      schluessel:  info.bezeichnung || info.schluessel || `eintrag_${i}`,
      bezeichnung: info.bezeichnung || '',
      mailadresse: info.mailadresse || '',
      modul:       'allgemein',
      beschreibung: '',
      sort_order:  i,
      _fromGAS:    true
    }));
    sysMailState.members = (data.members || []).map(m => ({
      name:  (m.nachname + ' ' + m.vorname).trim() || m.email,
      email: m.e_mail || m.email || m.mailadresse || ''
    })).filter(x => x.email);
    sysMailOriginal = JSON.parse(JSON.stringify(sysMailState.configs));

    console.log('✅ System-Mails via GAS-Fallback geladen.');
    renderSystemMailsUI(container);
  } catch (gasErr) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${escapeHtml(gasErr.message)}</div>`;
  }
}

// =========================================================
//  RENDER
// =========================================================
function renderSystemMailsUI(container) {
  // Module gruppieren
  const groups = {};
  for (const cfg of sysMailState.configs) {
    const modul = cfg.modul || 'allgemein';
    if (!groups[modul]) groups[modul] = [];
    groups[modul].push(cfg);
  }

  const modulLabels = {
    jahresmeisterschaft: '🏆 Jahresmeisterschaft',
    vermietung:          '🏠 Vermietung',
    gv:                  '📋 Generalversammlung',
    termine:             '📅 Termine / Jahresprogramm',
    allgemein:           '⚙️ Allgemein'
  };

  const groupOrder = ['jahresmeisterschaft', 'vermietung', 'gv', 'termine', 'allgemein'];
  const allModuls  = [...new Set([...groupOrder, ...Object.keys(groups)])];

  let html = `
    <div class="d-flex justify-content-between align-items-center mb-3">
      <h5 class="mb-0">📬 System-Mail-Verteiler</h5>
      <button class="btn btn-sm btn-success write-protected" onclick="saveSystemMailsData()">
        💾 Speichern
      </button>
    </div>
    <p class="text-muted small mb-3">
      Verwalte die Empfänger-Listen für automatische System-Benachrichtigungen.
      Gespeichert wird in <strong>Supabase</strong> und automatisch zu Google Sheets gespiegelt.
    </p>
    <div id="sys-mail-list">
  `;

  for (const modul of allModuls) {
    if (!groups[modul]) continue;
    html += `
      <div class="mb-4">
        <h6 class="fw-bold border-bottom pb-1 mb-3">${escapeHtml(modulLabels[modul] || modul)}</h6>
    `;
    for (const cfg of groups[modul]) {
      const idx   = sysMailState.configs.indexOf(cfg);
      const mails = (cfg.mailadresse || '').split(';').map(x => x.trim()).filter(Boolean);
      html += `
        <div class="mb-3 ps-2">
          <label class="form-label small fw-semibold mb-1">
            ${escapeHtml(cfg.bezeichnung || cfg.schluessel)}
            ${cfg.beschreibung ? `<span class="text-muted fw-normal">– ${escapeHtml(cfg.beschreibung)}</span>` : ''}
          </label>
          <div class="tag-box mb-1"
               style="display:flex;flex-wrap:wrap;gap:5px;padding:6px;border:1px solid #ccc;border-radius:8px;min-height:38px;">
            ${mails.length
              ? mails.map(m => `
                  <span style="background:#e9f2ff;color:#0d6efd;padding:2px 8px;border-radius:10px;font-size:.82rem;">
                    ${escapeHtml(m)}
                    <span style="color:#dc3545;cursor:pointer;" class="write-protected"
                          onclick="sysMailRemove(${idx},'${escapeJs(m)}')">×</span>
                  </span>`).join('')
              : '<span class="text-muted small">Keine Empfänger</span>'}
          </div>
          <select class="form-select form-select-sm write-protected"
                  style="max-width:340px;"
                  onchange="sysMailAdd(${idx}, this.value); this.value=''">
            <option value="">+ Empfänger aus Mitgliederliste hinzufügen</option>
            ${sysMailState.members.map(mm =>
                `<option value="${escapeHtml(mm.email)}">${escapeHtml(mm.name)} (${escapeHtml(mm.email)})</option>`
              ).join('')}
          </select>
        </div>
      `;
    }
    html += `</div>`;
  }

  html += `</div>`;
  container.innerHTML = html;
}

// =========================================================
//  INTERAKTION
// =========================================================
function sysMailAdd(idx, email) {
  if (!email) return;
  if (typeof window.markUnsaved === 'function') window.markUnsaved();
  const current = (sysMailState.configs[idx].mailadresse || '')
    .split(';').map(x => x.trim()).filter(Boolean);
  if (!current.includes(email)) current.push(email);
  sysMailState.configs[idx].mailadresse = current.join('; ');
  renderSystemMailsUI(document.getElementById('system-mails-container'));
}

function sysMailRemove(idx, email) {
  if (typeof window.markUnsaved === 'function') window.markUnsaved();
  const current = (sysMailState.configs[idx].mailadresse || '')
    .split(';').map(x => x.trim()).filter(Boolean);
  sysMailState.configs[idx].mailadresse = current.filter(x => x !== email).join('; ');
  renderSystemMailsUI(document.getElementById('system-mails-container'));
}

// =========================================================
//  SPEICHERN (Supabase-First + Dual-Write zu GAS)
// =========================================================
async function saveSystemMailsData() {
  if (!confirm('System-Mail-Verteiler speichern?')) return;

  const supa = getSysMailSupabaseClient();
  const user = localStorage.getItem('portal_user') || 'Admin';

  // 1. SUPABASE UPSERT
  if (supa) {
    try {
      const payload = sysMailState.configs.map(cfg => ({
        id:          cfg.id || undefined,
        schluessel:  cfg.schluessel,
        bezeichnung: cfg.bezeichnung,
        mailadresse: cfg.mailadresse || '',
        modul:       cfg.modul || 'allgemein',
        beschreibung: cfg.beschreibung || '',
        sort_order:  cfg.sort_order ?? 0,
        updated_at:  new Date().toISOString()
      }));

      const { error } = await supa
        .from('system_mail_configs')
        .upsert(payload, { onConflict: 'schluessel' });

      if (error) throw error;

      // Sicherstellen, dass veralteter Schlüssel Info_Mail_Kassier aus Supabase entfernt wird
      await supa
        .from('system_mail_configs')
        .delete()
        .eq('schluessel', 'Info_Mail_Kassier');

      console.log('✅ system_mail_configs erfolgreich in Supabase gespeichert.');

    } catch (supaErr) {
      alert('Fehler beim Speichern in Supabase: ' + supaErr.message);
      return;
    }
  }

  // 2. DUAL-WRITE: Asynchron zu Google Apps Script (App_Info-Sheet) spiegeln (DEAKTIVIERT - Supabase ist Single Source of Truth)
  /* --- ZUM REAKTIVIEREN DIESEN BLOCK EINKOMMENTIEREN ---
  try {
    const appInfoPayload = sysMailState.configs.map(cfg => ({
      bezeichnung: cfg.schluessel,  // Spalte A = schluessel (GAS-Kompatibilität)
      mailadresse: cfg.mailadresse || ''
    }));

    const gasPayload = {
      action:     'saveAdminData',
      user:       user,
      app_info:   appInfoPayload,
      logDetails: 'System-Mail-Verteiler aktualisiert (Supabase-Mirror)'
    };

    console.log('📡 Dual-Write zu Google Apps Script (App_Info) wird ausgeführt...');
    apiFetch('termine', '', {
      method: 'POST',
      body:   JSON.stringify(gasPayload)
    }).catch(err => console.warn('⚠️ Asynchroner Dual-Write (App_Info) fehlgeschlagen:', err));

  } catch (dualWriteErr) {
    console.warn('⚠️ Fehler beim Auslösen des Dual-Writes:', dualWriteErr);
  }
  ------------------------------------------------------- */

  if (typeof window.clearUnsaved === 'function') window.clearUnsaved();
  sysMailOriginal = JSON.parse(JSON.stringify(sysMailState.configs));

  alert('✅ System-Mail-Verteiler gespeichert!');
  await loadSystemMailsData(true);
}
