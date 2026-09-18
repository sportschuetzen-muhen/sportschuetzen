// === SUB-MODUL: MITGLIEDER - CORE ===

window._mglData = window._mglData || [];
window._mglFiltered = window._mglFiltered || [];
window._mglSort = window._mglSort || { field: 'LastName', dir: 'asc' };
window._mglActiveTab = window._mglActiveTab || 'liste';

// Lokale Cache-Variablen für Mitglieder-Details (Lizenzen, Funktionen, Historie)
window._mglLizenzenCache = window._mglLizenzenCache || {};
window._mglFunktionenCache = window._mglFunktionenCache || {};
window._mglHistoryCache = window._mglHistoryCache || {};

// Globaler Singleton-Promise zur Vermeidung paralleler Anfragen
window._mglLoadPromise = null;

// Zentraler, deduplizierter Loader für Mitgliederdaten (ohne parallele Mammut-Calls)
window.ensureMitgliederLoaded = async function(forceReload = false) {
  // 1. Bereits im RAM vorhanden?
  if (!forceReload && Array.isArray(window._mglData) && window._mglData.length > 0) {
    return window._mglData;
  }

  // 2. Blitzschnell aus AppCache (localStorage) laden (0 ms Wartezeit)
  if (!forceReload && window.AppCache) {
    const cached = window.AppCache.get('mitglieder');
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      window._mglData = cached.data;
      if (cached.lizenzen) window._mglLizenzenCache = cached.lizenzen;
      if (cached.funktionen) window._mglFunktionenCache = cached.funktionen;
      if (cached.historie) window._mglHistoryCache = cached.historie;
      return window._mglData;
    }
  }

  // 3. Läuft bereits ein Netzwerk-Request? Genau denselben Promise mitbenutzen!
  if (window._mglLoadPromise) {
    return window._mglLoadPromise;
  }

  // 4. Einzelner, zielgerichteter API-Call NUR für Mitglieder (keine Mammut-Parallelen!)
  window._mglLoadPromise = (async () => {
    try {
      console.log("📡 ensureMitgliederLoaded: Rufe Mitgliederliste (action=getAll) ab...");
      const res = await apiFetch('mitglieder', 'action=getAll');
      const rawText = await res.text();

      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch (jsonErr) {
        console.warn('⚠️ Mitglieder API: HTML statt JSON erhalten (GAS Login oder Quota):', rawText.slice(0, 180));
      }

      if (data && data.success && Array.isArray(data.data)) {
        window._mglData = data.data;
        if (window.AppCache) {
          const prev = window.AppCache.get('mitglieder') || {};
          window.AppCache.set('mitglieder', {
            ...prev,
            data: window._mglData
          }, 120);
        }
        // Event auslösen für geöffnete Rechnungs-Modals / Dropdowns
        window.dispatchEvent(new CustomEvent('mitglieder-loaded', { detail: window._mglData }));
        return window._mglData;
      }

      // Fallback: Wenn Server HTML liefert, prüfe ob alte gecachte Daten existieren
      if (window.AppCache) {
        const fallback = window.AppCache.get('mitglieder');
        if (fallback && Array.isArray(fallback.data) && fallback.data.length > 0) {
          console.info("ℹ️ Verwende gecachte Mitglieder aus AppCache als Ausweichdaten.");
          window._mglData = fallback.data;
          window.dispatchEvent(new CustomEvent('mitglieder-loaded', { detail: window._mglData }));
          return window._mglData;
        }
      }

      // Weiterer Fallback: Jahresbeitrag-Mitgliederliste
      if (Array.isArray(window._jbMembers) && window._jbMembers.length > 0) {
        window._mglData = window._jbMembers;
        window.dispatchEvent(new CustomEvent('mitglieder-loaded', { detail: window._mglData }));
        return window._mglData;
      }

      if (data && !data.success) {
        throw new Error(data.error || 'Server meldete success: false');
      }
    } catch (e) {
      console.error('❌ ensureMitgliederLoaded Fehler:', e);
    } finally {
      window._mglLoadPromise = null;
    }

    return window._mglData || [];
  })();

  return window._mglLoadPromise;
};

async function loadMitgliederData(forceReload = false) {
  const container = document.getElementById('mitglieder-container');
  
  // 1. Schneller Vorab-Check (RAM oder AppCache)
  if (!forceReload) {
    if (window._mglData && window._mglData.length > 0) {
      console.log("⚡ loadMitgliederData: Lade aus RAM-Cache...");
      if (container) {
        renderMitgliederView(window._mglData);
        if (typeof mglFilter === 'function') mglFilter();
      }
      return;
    }
    if (window.AppCache) {
      const cached = window.AppCache.get('mitglieder');
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        console.log("⚡ loadMitgliederData: Lade ohne Netzwerk-Wartezeit aus AppCache (localStorage)...");
        window._mglData = cached.data;
        window._mglLizenzenCache = cached.lizenzen || {};
        window._mglFunktionenCache = cached.funktionen || {};
        window._mglHistoryCache = cached.historie || {};
        if (container) {
          renderMitgliederView(window._mglData);
          if (typeof mglFilter === 'function') mglFilter();
        }
        return;
      }
    }
  }

  if (container) {
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary"></div>
        <p class="mt-2 text-muted">Lade Mitglieder…</p>
      </div>`;
  }

  try {
    // 2. Mitgliederliste abrufen (dedupliziert, einzelner fokussierter Call)
    const list = await window.ensureMitgliederLoaded(forceReload);

    if (!list || list.length === 0) {
      if (container) {
        container.innerHTML = `
          <div class="alert alert-warning">
            <h5>⚠️ Mitglieder konnten nicht geladen werden</h5>
            <p>Das Google Apps Script Backend antwortete nicht rechtzeitig oder lieferte ein ungültiges Format.</p>
            <button class="btn btn-sm btn-outline-primary mt-2" onclick="loadMitgliederData(true)">Erneut versuchen</button>
          </div>`;
      }
      return;
    }

    // Mitglieder sofort anzeigen!
    if (container) {
      renderMitgliederView(window._mglData);
      if (typeof mglFilter === 'function') mglFilter();
    }

    // 3. Sekundäre Detail-Caches (Lizenzen, Funktionen, Historie)
    // UNTERBINDUNG PARALLELER CALLS: Sequentiell und non-blocking im Hintergrund laden
    (async () => {
      try {
        // 3a. Lizenzen
        if (!window._mglLizenzenCache || Object.keys(window._mglLizenzenCache).length === 0 || forceReload) {
          try {
            const resLizz = await apiFetch('mitglieder', 'action=getLizenzen');
            const lizzData = await resLizz.json();
            if (lizzData && lizzData.success && Array.isArray(lizzData.data)) {
              window._mglLizenzenCache = {};
              lizzData.data.forEach(l => {
                const pnKey = String(l.PersonNumber || '').trim();
                if (pnKey) {
                  if (!window._mglLizenzenCache[pnKey]) window._mglLizenzenCache[pnKey] = [];
                  window._mglLizenzenCache[pnKey].push(l);
                }
              });
            }
          } catch (err) {
            console.warn('⚠️ Lizenzen-Cache Hintergrund-Laden:', err);
          }
        }

        // 3b. Funktionen
        if (!window._mglFunktionenCache || Object.keys(window._mglFunktionenCache).length === 0 || forceReload) {
          try {
            const resFn = await apiFetch('mitglieder', 'action=getFunktionen');
            const fnData = await resFn.json();
            if (fnData && fnData.success && Array.isArray(fnData.data)) {
              window._mglFunktionenCache = {};
              fnData.data.forEach(f => {
                const pnKey = String(f.PersonNumber || '').trim();
                if (pnKey) {
                  if (!window._mglFunktionenCache[pnKey]) window._mglFunktionenCache[pnKey] = [];
                  window._mglFunktionenCache[pnKey].push(f);
                }
              });
            }
          } catch (err) {
            console.warn('⚠️ Funktionen-Cache Hintergrund-Laden:', err);
          }
        }

        // 3c. Historie
        if (!window._mglHistoryCache || Object.keys(window._mglHistoryCache).length === 0 || forceReload) {
          try {
            const resHist = await apiFetch('mitglieder', 'action=getHistorie');
            const histData = await resHist.json();
            if (histData && histData.success && Array.isArray(histData.data)) {
              window._mglHistoryCache = {};
              histData.data.forEach(h => {
                const pnKey = String(h.PersonNumber || '').trim();
                if (pnKey) {
                  if (!window._mglHistoryCache[pnKey]) window._mglHistoryCache[pnKey] = [];
                  window._mglHistoryCache[pnKey].push(h);
                }
              });
            }
          } catch (err) {
            console.warn('⚠️ Historie-Cache Hintergrund-Laden:', err);
          }
        }

        // Im AppCache mit Details speichern
        if (window.AppCache) {
          window.AppCache.set('mitglieder', {
            data: window._mglData,
            lizenzen: window._mglLizenzenCache,
            funktionen: window._mglFunktionenCache,
            historie: window._mglHistoryCache
          }, 120);
        }
      } catch (secErr) {
        console.warn('⚠️ Detail-Caches Hintergrund-Laden:', secErr);
      }
    })();

  } catch (e) {
    console.error('❌ loadMitgliederData:', e);
    if (container) {
      container.innerHTML = `<div class="alert alert-danger"><strong>Fehler:</strong> ${escapeHtml(e.message)}</div>`;
    }
  }
}

// === UTILS ===
function mglFmtDate(val) {
  if (!val || val === '' || val === '–') return '–';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('de-CH');
}

function mglFmtDateIso(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d) ? '' : d.toISOString().split('T')[0];
}
