/**
 * termine-core.js
 * Modul: JAHRESPROGRAMM (Termine, Anlässe & Orte) - CORE
 *
 * Supabase Architektur (Single Source of Truth),
 * AppCache-Integration und Stammdaten-Verwaltung.
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
//  DATEN LADEN (Supabase PostgreSQL - Single Source of Truth)
// =========================================================
async function loadTermineData(force = false) {
  const container = document.getElementById('termine-container');
  if (!container) return;

  if (typeof ensureTermineStylesOnce === 'function') {
    ensureTermineStylesOnce();
  }

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

  // 2. Supabase PostgreSQL direkt abfragen
  if (!supa) {
    console.warn('⚠️ Supabase Client nicht verfügbar. Termine können nicht geladen werden.');
    container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i>Supabase Client nicht verfügbar.</div>`;
    showTermineOverlay(false);
    return;
  }

  try {
    const [termRes, locRes, typesRes] = await Promise.all([
      supa.from('termine').select('*').order('datum', { ascending: true, nullsFirst: false }).order('sort_order', { ascending: true }),
      supa.from('termine_locations').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true }),
      supa.from('termine_event_types').select('*').order('sort_order', { ascending: true }).order('name', { ascending: true })
    ]);

    if (termRes.error) throw termRes.error;
    if (locRes.error) throw locRes.error;
    if (typesRes.error) throw typesRes.error;

    const termine = termRes.data || [];
    const locations = locRes.data || [];
    const types = typesRes.data || [];

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
    const syncTime = (window.UIFormatKit && typeof window.UIFormatKit.formatTime === 'function')
      ? window.UIFormatKit.formatTime(new Date())
      : new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
    updateLastSyncLabel('Zuletzt aktualisiert: ' + syncTime);
  } catch (supaErr) {
    console.error('❌ Supabase Abfrage für Termine fehlgeschlagen:', supaErr);
    const errText = (typeof escapeHtml === 'function')
      ? escapeHtml(supaErr.message || String(supaErr))
      : String(supaErr.message || supaErr);
    container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-times-circle me-2"></i>Fehler beim Laden aus Supabase: ${errText}</div>`;
  } finally {
    showTermineOverlay(false);
  }
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
//  SPEICHERN (Supabase PostgreSQL - Single Source of Truth)
// =========================================================
async function saveTermineData() {
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('termine')) {
    if (window.UIConfirmKit) {
      await UIConfirmKit.alert({
        title: 'Keine Berechtigung',
        message: 'Du hast keine Schreibberechtigung für das Jahresprogramm.',
        type: 'danger'
      });
    }
    return;
  }

  const supa = getTermineSupabaseClient();
  if (!supa) {
    if (window.UIConfirmKit) {
      await UIConfirmKit.alert({
        title: 'Verbindungsfehler',
        message: 'Der Supabase-Client ist aktuell nicht verfügbar.',
        type: 'danger'
      });
    }
    return;
  }

  // Pflichtfeld-Prüfung: Termine mit Datum (oder bestehende Einträge) benötigen einen Anlass-Titel (NOT NULL)
  const origIds = new Set((originalAdminState?.termine || []).map(t => String(t.id)));
  const missingTitle = (adminState?.termine || []).find(t => {
    const hasTitle = Boolean(String(t.anlasstitel || '').trim());
    const hasDate = Boolean(String(t.datum || '').trim());
    return !hasTitle && (hasDate || origIds.has(String(t.id)));
  });
  if (missingTitle) {
    if (window.UIConfirmKit) {
      await UIConfirmKit.alert({
        title: 'Pflichtfeld fehlt',
        message: 'Bitte wähle bei jedem erfassten Termin einen Anlass aus, bevor du speicherst.',
        type: 'warning'
      });
    }
    return;
  }

  if (window.UIConfirmKit) {
    const ok = await UIConfirmKit.confirm({
      title: 'Jahresprogramm speichern?',
      message: 'Möchtest du alle Änderungen am Jahresprogramm und den Stammdaten in Supabase speichern?',
      type: 'primary',
      confirmText: 'Speichern',
      cancelText: 'Abbrechen'
    });
    if (!ok) return;
  }

  sortTermineForSave();
  cleanupDropdownsForSave();

  const executeSave = async () => {
    showTermineOverlay(true, 'Speichere Jahresprogramm…');

    try {
      const validTermine = (adminState.termine || []).filter(t => String(t.anlasstitel || '').trim());
      const terminePayload = validTermine.map((t, idx) => mapTerminToSupabase(t, idx));

      // 1. Gelöschte Termine ermitteln und in Supabase entfernen
      if (originalAdminState && Array.isArray(originalAdminState.termine)) {
        const currentIds = new Set(validTermine.map(t => String(t.id)));
        const deletedIds = originalAdminState.termine
          .map(t => String(t.id))
          .filter(id => id && !currentIds.has(id));

        if (deletedIds.length > 0) {
          console.log('🗑️ Lösche Termine aus Supabase:', deletedIds);
          const { error: delTermErr } = await supa.from('termine').delete().in('id', deletedIds);
          if (delTermErr) throw delTermErr;
        }
      }

      if (terminePayload.length > 0) {
        const { error: upsertErr } = await supa.from('termine').upsert(terminePayload, { onConflict: 'id' });
        if (upsertErr) throw upsertErr;
      }

      // 2. Stammdaten: Anlass-Typen synchronisieren (inkl. Löschungen & Deduplizierung)
      const uniqueTypesMap = new Map();
      (adminState.dropdowns?.anlaesse || []).forEach(rawName => {
        const name = String(rawName || '').trim();
        if (name && !uniqueTypesMap.has(name)) {
          uniqueTypesMap.set(name, {
            name,
            category: 'Jahresprogramm',
            sort_order: uniqueTypesMap.size + 1,
            updated_at: new Date().toISOString()
          });
        }
      });

      const deletedTypes = (originalAdminState?.dropdowns?.anlaesse || [])
        .map(n => String(n || '').trim())
        .filter(n => n && !uniqueTypesMap.has(n));
      if (deletedTypes.length > 0) {
        const { error: delTypesErr } = await supa.from('termine_event_types').delete().in('name', deletedTypes);
        if (delTypesErr) throw delTypesErr;
      }

      if (uniqueTypesMap.size > 0) {
        const { error: upsertTypesErr } = await supa
          .from('termine_event_types')
          .upsert(Array.from(uniqueTypesMap.values()), { onConflict: 'name' });
        if (upsertTypesErr) throw upsertTypesErr;
      }

      // 3. Stammdaten: Orte & Maps synchronisieren (inkl. Löschungen & Deduplizierung)
      const uniqueLocsMap = new Map();
      (adminState.dropdowns?.orteMitMaps || []).forEach(pair => {
        const name = String(pair?.[0] || '').trim();
        if (name && !uniqueLocsMap.has(name)) {
          uniqueLocsMap.set(name, {
            name,
            map_link: String(pair?.[1] || '').trim(),
            sort_order: uniqueLocsMap.size + 1,
            updated_at: new Date().toISOString()
          });
        }
      });

      const deletedLocs = (originalAdminState?.dropdowns?.orteMitMaps || [])
        .map(p => String(p?.[0] || '').trim())
        .filter(n => n && !uniqueLocsMap.has(n));
      if (deletedLocs.length > 0) {
        const { error: delLocErr } = await supa.from('termine_locations').delete().in('name', deletedLocs);
        if (delLocErr) throw delLocErr;
      }

      if (uniqueLocsMap.size > 0) {
        const { error: upsertLocErr } = await supa
          .from('termine_locations')
          .upsert(Array.from(uniqueLocsMap.values()), { onConflict: 'name' });
        if (upsertLocErr) throw upsertLocErr;
      }

      adminState._isSupabase = true;
      console.log('✅ Supabase erfolgreich aktualisiert.');

      if (window.clearUnsaved) window.clearUnsaved();
      if (window.AppCache) window.AppCache.invalidate('termine');

      if (typeof showToast === 'function') {
        showToast('✅ Jahresprogramm & Stammdaten erfolgreich gespeichert!');
      } else if (window.UIConfirmKit) {
        await UIConfirmKit.alert({
          title: 'Gespeichert',
          message: 'Jahresprogramm & Stammdaten wurden erfolgreich gespeichert.',
          type: 'info'
        });
      }

      await loadTermineData(true);
    } catch (err) {
      console.error('Fehler beim Speichern:', err);
      if (window.UIConfirmKit) {
        await UIConfirmKit.alert({
          title: 'Fehler beim Speichern',
          message: 'Das Jahresprogramm konnte nicht gespeichert werden: ' + (err.message || err),
          type: 'danger'
        });
      }
    } finally {
      showTermineOverlay(false);
    }
  };

  if (window.UIButtonKit && document.getElementById('btn-save-termine')) {
    await UIButtonKit.withLoading('#btn-save-termine', executeSave, { loadingText: 'Speichere…' });
  } else {
    if (window.updateTermineSaveButtonState) window.updateTermineSaveButtonState(true);
    await executeSave();
  }

  if (window.updateTermineSaveButtonState) window.updateTermineSaveButtonState(false);
}

// =========================================================
//  HELFER-FUNKTIONEN
// =========================================================
function renderTermineContainerShell(container) {
  container.innerHTML = `
    <div id="termine-shell">
      <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
        <div class="small text-muted" id="last-sync">Zuletzt aktualisiert: -</div>
      </div>
      <div id="termine-ui"></div>
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
