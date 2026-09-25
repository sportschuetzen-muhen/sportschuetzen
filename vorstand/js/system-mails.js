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
  if (!supa) {
    container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-circle me-2"></i>Supabase Client nicht verfügbar.</div>`;
    return;
  }

  // --- SUPABASE-FIRST (Single Source of Truth) ---
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
  } catch (supaErr) {
    console.error('❌ Fehler beim Laden der System-Mails aus Supabase:', supaErr);
    container.innerHTML = `
      <div class="alert alert-danger">
        <i class="fas fa-exclamation-triangle me-2"></i>
        <strong>Fehler beim Laden aus Supabase:</strong> ${escapeHtml(supaErr.message || 'Verbindung fehlgeschlagen')}
        <div class="mt-2">
          <button class="btn btn-sm btn-outline-danger" onclick="loadSystemMailsData(true)">
            <i class="fas fa-sync-alt me-1"></i> Erneut versuchen
          </button>
        </div>
      </div>
    `;
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
      Gespeichert wird direkt in <strong>Supabase PostgreSQL</strong> (Single Source of Truth).
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
          <div class="d-flex flex-wrap gap-2 align-items-center mt-1">
            <select class="form-select form-select-sm write-protected"
                    style="max-width:320px;"
                    onchange="sysMailAdd(${idx}, this.value); this.value=''">
              <option value="">+ Empfänger aus Mitgliederliste...</option>
              ${sysMailState.members.map(mm =>
                  `<option value="${escapeHtml(mm.email)}">${escapeHtml(mm.name)} (${escapeHtml(mm.email)})</option>`
                ).join('')}
            </select>
            <div class="input-group input-group-sm write-protected" style="max-width:280px;">
              <input type="email" class="form-control form-control-sm"
                     id="custom-email-${idx}"
                     placeholder="oder manuelle E-Mail"
                     onkeydown="if(event.key==='Enter'){event.preventDefault();sysMailAddCustom(${idx});}">
              <button class="btn btn-outline-secondary" type="button"
                      onclick="sysMailAddCustom(${idx})" title="E-Mail hinzufügen">
                + Hinzufügen
              </button>
            </div>
          </div>
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
  const cleanEmail = email.trim();
  if (!cleanEmail) return;
  if (typeof window.markUnsaved === 'function') window.markUnsaved();
  const current = (sysMailState.configs[idx].mailadresse || '')
    .split(';').map(x => x.trim()).filter(Boolean);
  if (!current.includes(cleanEmail)) current.push(cleanEmail);
  sysMailState.configs[idx].mailadresse = current.join('; ');
  renderSystemMailsUI(document.getElementById('system-mails-container'));
}

function sysMailAddCustom(idx) {
  const input = document.getElementById(`custom-email-${idx}`);
  if (!input) return;
  const val = (input.value || '').trim();
  if (!val || !val.includes('@') || !val.includes('.')) {
    alert('Bitte eine gültige E-Mail-Adresse eingeben.');
    return;
  }
  sysMailAdd(idx, val);
}

function sysMailRemove(idx, email) {
  if (typeof window.markUnsaved === 'function') window.markUnsaved();
  const current = (sysMailState.configs[idx].mailadresse || '')
    .split(';').map(x => x.trim()).filter(Boolean);
  sysMailState.configs[idx].mailadresse = current.filter(x => x !== email).join('; ');
  renderSystemMailsUI(document.getElementById('system-mails-container'));
}

// =========================================================
//  SPEICHERN (Supabase PostgreSQL - Single Source of Truth)
// =========================================================
async function saveSystemMailsData() {
  if (!confirm('System-Mail-Verteiler speichern?')) return;

  const supa = getSysMailSupabaseClient();
  if (!supa) {
    alert('❌ Fehler: Supabase Client ist nicht initialisiert.');
    return;
  }

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

    // Sicherstellen, dass veralteter Schlüssel Info_Mail_Kassier aus Supabase entfernt ist
    await supa
      .from('system_mail_configs')
      .delete()
      .eq('schluessel', 'Info_Mail_Kassier');

    console.log('✅ system_mail_configs erfolgreich in Supabase gespeichert.');

    if (typeof window.clearUnsaved === 'function') window.clearUnsaved();
    sysMailOriginal = JSON.parse(JSON.stringify(sysMailState.configs));

    alert('✅ System-Mail-Verteiler erfolgreich in Supabase gespeichert!');
    await loadSystemMailsData(true);

  } catch (supaErr) {
    console.error('❌ Fehler beim Speichern in Supabase:', supaErr);
    alert('❌ Fehler beim Speichern in Supabase: ' + supaErr.message);
  }
}
