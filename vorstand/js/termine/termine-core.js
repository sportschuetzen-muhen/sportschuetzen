/**
 * termine-core.js
 * Modul: JAHRESPROGRAMM (Termine, Anlässe & Orte) - CORE
 *
 * Supabase-First Architektur mit Dual-Write zu Google Apps Script,
 * 1-Klick Migration, AppCache-Integration und Stammdaten-Verwaltung.
 */

// Globaler State
let adminState = null;
let originalAdminState = null;

// =========================================================
//  SUPABASE CLIENT ACCESS
// =========================================================
function getTermineSupabaseClient() {
  if (typeof window.getSupabaseClient === 'function') {
    return window.getSupabaseClient();
  }
  return window.supabaseClient || null;
}
window.getTermineSupabaseClient = getTermineSupabaseClient;

// =========================================================
//  DATEN LADEN (Supabase First mit GAS-Fallback)
// =========================================================
async function loadTermineData(force = false) {
  const container = document.getElementById('termine-container');
  if (!container) return;

  if (typeof ensureTermineStylesOnce === 'function') {
    ensureTermineStylesOnce();
  }

  // Flag zurücksetzen damit Events neu gebunden werden
  window.termineEventsBound = false;

  // 1. RAM / AppCache Check
  if (!force) {
    if (adminState && document.getElementById('termine-ui')?.children.length > 0) {
      console.log('⚡ loadTermineData: Lade aus RAM-Cache...');
      return;
    }
    if (window.AppCache) {
      const cached = window.AppCache.get('termine');
      if (cached && typeof cached === 'object') {
        console.log('⚡ loadTermineData: Lade aus AppCache...');
        adminState = cached;
        originalAdminState = JSON.parse(JSON.stringify(adminState));
        renderTermineContainerShell(container);
        renderTermineUI(document.getElementById('termine-ui'));
        return;
      }
    }
  }

  renderTermineContainerShell(container);
  showTermineOverlay(true, 'Lade Jahresprogramm & Stammdaten…');

  const supa = getTermineSupabaseClient();

  // 2. VERSUCH: Supabase PostgreSQL direkt abfragen
  if (supa) {
    try {
      const [termRes, locRes, typesRes] = await Promise.all([
        supa.from('termine').select('*').order('datum', { ascending: true, nullsFirst: false }).order('sort_order', { ascending: true }),
        supa.from('termine_locations').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
        supa.from('termine_event_types').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true })
      ]);

      const termine = termRes.data || [];
      const locations = locRes.data || [];
      const types = typesRes.data || [];

      // Falls Supabase Daten enthält (oder wir bereits aktiv migriert haben)
      if (!termRes.error && termine.length > 0) {
        console.log(`✅ ${termine.length} Termine aus Supabase geladen.`);

        adminState = {
          termine: termine.map(mapTerminFromSupabase),
          dropdowns: {
            anlaesse: types.map(t => t.name).filter(Boolean),
            orteMitMaps: locations.map(l => [l.name || '', l.map_link || '']).filter(p => p[0]),
            kategorien: ['Jahresprogramm', 'Schiesstermine'],
            status: ['fix', 'provisorisch', 'abgesagt']
          },
          platzhalter: [],
          app_info: [],
          _isSupabase: true
        };

        originalAdminState = JSON.parse(JSON.stringify(adminState));

        if (window.AppCache) {
          window.AppCache.set('termine', adminState, 120);
        }

        renderTermineUI(document.getElementById('termine-ui'));
        updateLastSyncLabel('Zuletzt aktualisiert: Supabase Live (' + new Date().toLocaleTimeString() + ')');
        showTermineOverlay(false);
        return;
      } else if (!termRes.error && termine.length === 0) {
        console.warn('⚠️ Supabase Termine noch leer. Bitte Daten importieren (Sheet-Sync Button).');
        container.innerHTML = `<div class="alert alert-warning"><i class="fas fa-exclamation-triangle me-2"></i>Keine Termine in Supabase vorhanden. Bitte über «Sheet-Sync / Import» importieren.</div>`;
        showTermineOverlay(false);
        return;
      }
    } catch (supaErr) {
      console.error('❌ Supabase Abfrage für Termine fehlgeschlagen:', supaErr);
      container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i>Fehler beim Laden aus Supabase: ${supaErr.message}</div>`;
      showTermineOverlay(false);
      return;
    }
  }

  // ──────────────────────────────────────────────────────────────
  // [GAS-FALLBACK DEAKTIVIERT 2026-09-21]
  // Grund: Supabase ist Master. GAS-Read nicht mehr benötigt.
  // Bei Bedarf wieder einkommentieren.
  // ──────────────────────────────────────────────────────────────
  // try {
  //   const res = await apiFetch('termine', 'action=loadAdminData');
  //   adminState = await res.json();
  //   adminState._isSupabase = false;
  //
  //   if (adminState.dropdowns?.orteMitMaps) {
  //     adminState.dropdowns.orteMitMaps = adminState.dropdowns.orteMitMaps
  //       .filter(p => p?.[0]?.trim() || p?.[1]?.trim());
  //   }
  //
  //   originalAdminState = JSON.parse(JSON.stringify(adminState));
  //
  //   if (window.AppCache) {
  //     window.AppCache.set('termine', adminState, 120);
  //   }
  //
  //   renderTermineUI(document.getElementById('termine-ui'));
  //   updateLastSyncLabel('Zuletzt aktualisiert: Google Sheets (' + new Date().toLocaleTimeString() + ')');
  //
  //   // Falls Supabase erreichbar ist, aber noch leer war: 1-Klick Migration anbieten
  //   if (supa && !adminState._isSupabase) {
  //     showMigrationBanner();
  //   }
  // } catch (e) {
  //   container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${e.message}</div>`;
  // } finally {
  //   showTermineOverlay(false);
  // }

  // Kein GAS-Fallback mehr – Supabase ist einzige Datenquelle
  console.warn('⚠️ Supabase Client nicht verfügbar. Termine können nicht geladen werden.');
  container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i>Supabase Client nicht verfügbar.</div>`;
  showTermineOverlay(false);
}

// =========================================================
//  MAPPING FUNKTIONEN
// =========================================================
function mapTerminFromSupabase(r) {
  return {
    id: r.id,
    datum: r.datum || '',
    startzeit: r.startzeit || '',
    endzeit: r.endzeit || '',
    anlasstitel: r.anlasstitel || '',
    ort: r.ort || '',
    kategorie: r.kategorie || 'Jahresprogramm',
    status: r.status || 'provisorisch',
    austragungsorte_map: r.austragungsorte_map || '',
    typ: r.typ || 'verein',
    sort_order: r.sort_order || 0
  };
}

function mapTerminToSupabase(t, index) {
  return {
    id: String(t.id || generateTerminId()),
    datum: t.datum ? isoDate(t.datum) : null,
    startzeit: t.startzeit || null,
    endzeit: t.endzeit || null,
    anlasstitel: String(t.anlasstitel || '').trim(),
    ort: String(t.ort || '').trim(),
    kategorie: String(t.kategorie || 'Jahresprogramm').trim(),
    status: String(t.status || 'provisorisch').trim().toLowerCase(),
    austragungsorte_map: String(t.austragungsorte_map || '').trim(),
    typ: String(t.typ || 'verein').trim(),
    sort_order: (t.sort_order !== undefined && t.sort_order !== null) ? Number(t.sort_order) : index,
    updated_at: new Date().toISOString()
  };
}

// =========================================================
//  SPEICHERN (Supabase Master mit Dual-Write zu GAS)
// =========================================================
async function saveTermineData() {
  if (!confirm('Alle Änderungen im Jahresprogramm speichern?')) return;

  sortTermineForSave();
  cleanupDropdownsForSave();

  const user = localStorage.getItem('portal_user') || 'Admin';
  const supa = getTermineSupabaseClient();

  showTermineOverlay(true, 'Speichere Jahresprogramm…');

  const payloadGAS = {
    action: 'saveAdminData',
    user: user,
    termine: adminState.termine,
    platzhalter: adminState.platzhalter || [],
    app_info: adminState.app_info || [],
    dropdowns: adminState.dropdowns,
    logDetails: buildChangeLogDetails()
  };

  try {
    // 1. In Supabase speichern (falls verfügbar)
    if (supa) {
      const validTermine = (adminState.termine || []).filter(t => t.anlasstitel || t.datum);
      const terminePayload = validTermine.map((t, idx) => mapTerminToSupabase(t, idx));

      // Gelöschte Termine ermitteln
      if (originalAdminState && Array.isArray(originalAdminState.termine)) {
        const currentIds = new Set(validTermine.map(t => String(t.id)));
        const deletedIds = originalAdminState.termine
          .map(t => String(t.id))
          .filter(id => id && !currentIds.has(id));

        if (deletedIds.length > 0) {
          console.log('🗑️ Lösche aus Supabase:', deletedIds);
          await supa.from('termine').delete().in('id', deletedIds);
        }
      }

      if (terminePayload.length > 0) {
        const { error: upsertErr } = await supa.from('termine').upsert(terminePayload, { onConflict: 'id' });
        if (upsertErr) throw upsertErr;
      }

      // Stammdaten: Anlass-Typen synchronisieren
      if (adminState.dropdowns?.anlaesse?.length) {
        const typesPayload = adminState.dropdowns.anlaesse
          .filter(Boolean)
          .map((name, idx) => ({
            name: String(name).trim(),
            category: 'Jahresprogramm',
            sort_order: idx + 1,
            updated_at: new Date().toISOString()
          }));
        await supa.from('termine_event_types').upsert(typesPayload, { onConflict: 'name' });
      }

      // Stammdaten: Orte & Maps synchronisieren
      if (adminState.dropdowns?.orteMitMaps?.length) {
        const locPayload = adminState.dropdowns.orteMitMaps
          .filter(p => p[0])
          .map((pair, idx) => ({
            name: String(pair[0]).trim(),
            map_link: String(pair[1] || '').trim(),
            sort_order: idx + 1,
            updated_at: new Date().toISOString()
          }));
        await supa.from('termine_locations').upsert(locPayload, { onConflict: 'name' });
      }

      adminState._isSupabase = true;
      console.log('✅ Supabase erfolgreich aktualisiert.');
    }

    // 2. DUAL-WRITE: Asynchron zu Google Apps Script spiegeln
    try {
      console.log('📡 Dual-Write zu Google Apps Script wird ausgeführt...');
      apiFetch('termine', '', {
        method: 'POST',
        body: JSON.stringify(payloadGAS)
      }).catch(err => console.warn('⚠️ Asynchroner Dual-Write Fehler:', err));
    } catch (gasErr) {
      console.warn('⚠️ Fehler beim Auslösen des Dual-Writes:', gasErr);
    }

    if (window.clearUnsaved) window.clearUnsaved();
    if (window.AppCache) window.AppCache.invalidate('termine');

    alert('✅ Jahresprogramm & Stammdaten erfolgreich gespeichert!');
    await loadTermineData(true);

  } catch (err) {
    console.error('Fehler beim Speichern:', err);
    alert('Fehler beim Speichern: ' + (err.message || err));
  } finally {
    showTermineOverlay(false);
  }
}

// =========================================================
//  1-KLICK IMPORT (Von Google Sheet nach Supabase)
// =========================================================
async function syncTermineFromLegacy() {
  const supa = getTermineSupabaseClient();
  if (!supa) {
    alert('Supabase Client nicht bereit.');
    return;
  }

  if (!confirm('Alle bestehenden Termine und Stammdaten jetzt aus dem Google Sheet nach Supabase importieren?')) return;

  showTermineOverlay(true, 'Importiere Termine nach Supabase…');

  try {
    const res = await apiFetch('termine', 'action=loadAdminData');
    const legacyData = await res.json();

    const termine = (legacyData.termine || []).map((t, idx) => mapTerminToSupabase(t, idx));
    const anlaesse = (legacyData.dropdowns?.anlaesse || []).filter(Boolean).map((name, idx) => ({
      name: String(name).trim(),
      category: 'Jahresprogramm',
      sort_order: idx + 1
    }));
    const orte = (legacyData.dropdowns?.orteMitMaps || []).filter(p => p[0]).map((pair, idx) => ({
      name: String(pair[0]).trim(),
      map_link: String(pair[1] || '').trim(),
      sort_order: idx + 1
    }));

    if (termine.length > 0) {
      const { error: tErr } = await supa.from('termine').upsert(termine, { onConflict: 'id' });
      if (tErr) throw tErr;
    }

    if (anlaesse.length > 0) {
      await supa.from('termine_event_types').upsert(anlaesse, { onConflict: 'name' });
    }

    if (orte.length > 0) {
      await supa.from('termine_locations').upsert(orte, { onConflict: 'name' });
    }

    if (window.AppCache) window.AppCache.invalidate('termine');
    alert(`🎉 Migration erfolgreich!\n\n${termine.length} Termine, ${anlaesse.length} Anlass-Typen und ${orte.length} Orte wurden nach Supabase übertragen.`);
    await loadTermineData(true);

  } catch (err) {
    console.error('Fehler bei Migration:', err);
    alert('Fehler beim Importieren: ' + err.message);
  } finally {
    showTermineOverlay(false);
  }
}
window.syncTermineFromLegacy = syncTermineFromLegacy;

// =========================================================
//  HELFER-FUNKTIONEN
// =========================================================
function renderTermineContainerShell(container) {
  container.innerHTML = `
    <div id="termine-shell">
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div class="small text-muted" id="last-sync">Zuletzt aktualisiert: -</div>
        <div class="d-flex gap-2">
          <button class="btn btn-sm btn-outline-primary" onclick="syncTermineFromLegacy()" title="Bestehende Daten aus Google Sheets nach Supabase synchronisieren">
            <i class="fas fa-sync-alt me-1"></i> Sheet-Sync / Import
          </button>
        </div>
      </div>
      <div id="termine-migration-banner"></div>
      <div id="termine-ui"></div>
    </div>
  `;
}

function showMigrationBanner() {
  const banner = document.getElementById('termine-migration-banner');
  if (!banner) return;
  banner.innerHTML = `
    <div class="alert alert-info border-info d-flex justify-content-between align-items-center flex-wrap gap-2 my-2 py-2 px-3 rounded-3 shadow-sm">
      <div>
        <strong class="text-primary"><i class="fas fa-database me-2"></i>Supabase-Migration bereit:</strong>
        Aktuell werden die Daten noch aus Google Sheets geladen. Du kannst alle Termine, Anlässe & Orte jetzt mit 1 Klick nach Supabase übernehmen!
      </div>
      <button class="btn btn-sm btn-primary fw-bold" onclick="syncTermineFromLegacy()">
        <i class="fas fa-cloud-upload-alt me-1"></i> Jetzt nach Supabase migrieren
      </button>
    </div>
  `;
}

function updateLastSyncLabel(text) {
  const last = document.getElementById('last-sync');
  if (last) last.innerText = text;
}

function generateTerminId() {
  return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

function formatTime(v) {
  if (!v) return '';
  const s = String(v).trim();
  if (/^\d{2}:\d{2}:\d{2}$/.test(s)) return s.slice(0, 5);
  return s;
}

function isoDate(v) {
  if (!v) return '';
  try {
    if (String(v).match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
      const [day, month, year] = String(v).split('.');
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }
    const s = String(v);
    return s.includes('T') ? s.split('T')[0] : s;
  } catch (e) {
    return v;
  }
}

function applyDefaultsOnDateSetById(id) {
  const idx = adminState.termine.findIndex(t => String(t.id) === String(id));
  if (idx < 0) return;
  const t = adminState.termine[idx];
  if (!t.datum) return;
  if (!t.startzeit) t.startzeit = '19:00';
  if (!t.endzeit) t.endzeit = '22:00';
  if (!t.status) t.status = 'provisorisch';
  if (!t.kategorie) t.kategorie = 'Jahresprogramm';
}

function sortTermineForSave() {
  if (!adminState?.termine) return;
  adminState.termine.forEach((t, idx) => {
    if (t.sort_order === undefined || t.sort_order === null) {
      t.sort_order = idx;
    }
  });
}

function cleanupDropdownsForSave() {
  if (!adminState?.dropdowns) return;
  adminState.dropdowns.anlaesse = (adminState.dropdowns.anlaesse || [])
    .map(x => String(x || '').trim())
    .filter(Boolean);

  adminState.dropdowns.orteMitMaps = (adminState.dropdowns.orteMitMaps || [])
    .map(p => [String(p?.[0] || '').trim(), String(p?.[1] || '').trim()])
    .filter(p => p[0]);
}

function buildChangeLogDetails() {
  if (!originalAdminState) return 'Daten aktualisiert';
  const changed = [];
  if (JSON.stringify(adminState.termine) !== JSON.stringify(originalAdminState.termine)) changed.push('Termine');
  if (JSON.stringify(adminState.dropdowns) !== JSON.stringify(originalAdminState.dropdowns)) changed.push('Stammdaten');
  return changed.length ? ('Geändert: ' + changed.join(', ')) : 'Speichern ohne Änderungen';
}
