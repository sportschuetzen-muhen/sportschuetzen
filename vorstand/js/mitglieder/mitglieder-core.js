// === SUB-MODUL: MITGLIEDER - CORE ===

window._mglData = window._mglData || [];
window._mglFiltered = window._mglFiltered || [];
window._mglSort = window._mglSort || { field: 'LastName', dir: 'asc' };
window._mglActiveTab = window._mglActiveTab || 'liste';

// Lokale Cache-Variablen für Mitglieder-Details (Lizenzen, Funktionen, Historie)
window._mglLizenzenCache = window._mglLizenzenCache || {};
window._mglFunktionenCache = window._mglFunktionenCache || {};
window._mglHistoryCache = window._mglHistoryCache || {};

async function loadMitgliederData(forceReload = false) {
  const container = document.getElementById('mitglieder-container');
  
  // Wenn kein forceReload und Preload läuft, darauf warten
  if (!forceReload && (!window._mglData || window._mglData.length === 0) && window._mglPreloadPromise) {
    console.log("⏳ loadMitgliederData: Warte auf laufenden Preload im Hintergrund...");
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary"></div>
        <p class="mt-2 text-muted">Lade Mitglieder & Details (Preload im Hintergrund)…</p>
      </div>`;
    try {
      await window._mglPreloadPromise;
    } catch (e) {
      console.error("❌ Fehler beim Warten auf Preload:", e);
    }
  }

  // Wenn Caches bereits geladen sind und kein forceReload erzwungen wird,
  // laden wir direkt und instant aus dem lokalen Speicher!
  if (!forceReload && _mglData && _mglData.length > 0) {
    console.log("⚡ loadMitgliederData: Lade aus lokalem Cache...");
    renderMitgliederView(_mglData);
    mglFilter();
    return;
  }

  container.innerHTML = `
    <div class="text-center py-5">
      <div class="spinner-border text-primary"></div>
      <p class="mt-2 text-muted">Lade Mitglieder & Details…</p>
    </div>`;

  try {
    const [resAll, resLizz, resFn, resHist] = await Promise.all([
      apiFetch('mitglieder', 'action=getAll'),
      apiFetch('mitglieder', 'action=getLizenzen'),
      apiFetch('mitglieder', 'action=getFunktionen'),
      apiFetch('mitglieder', 'action=getHistorie')
    ]);

    // Prüfe Content-Type – wenn HTML kommt, ist das Script nicht korrekt deployed
    const rawText = await resAll.text();

    let data;
    try {
      data = JSON.parse(rawText);
    } catch (_) {
      // HTML zurückgekommen (Google Login-Seite oder GAS-Fehlerseite)
      console.error('❌ Mitglieder API: HTML statt JSON erhalten:', rawText.slice(0, 300));
      container.innerHTML = `
        <div class="alert alert-warning">
          <h5>⚠️ Backend nicht erreichbar</h5>
          <p>Das Google Apps Script für <strong>Mitglieder</strong> gibt kein JSON zurück. 
          Mögliche Ursachen:</p>
          <ul>
            <li>Das Script ist noch nicht als <strong>Web App</strong> deployed</li>
            <li>Die URL im <code>worker.js</code> zeigt noch auf ein Platzhalter-Script</li>
            <li>Das Script hat keinen <code>doGet()</code> implementiert</li>
          </ul>
          <details class="mt-2">
            <summary class="small text-muted">Technische Details</summary>
            <pre class="small mt-2 bg-light p-2 rounded">${escapeHtml(rawText.slice(0, 500))}</pre>
          </details>
        </div>`;
      return;
    }

    if (!data.success) throw new Error(data.error || 'Unbekannter Fehler');

    // Lizenzen indizieren
    try {
      const lizzData = await resLizz.json();
      _mglLizenzenCache = {};
      if (lizzData.success && Array.isArray(lizzData.data)) {
        lizzData.data.forEach(l => {
          const pnKey = String(l.PersonNumber || '').trim();
          if (pnKey) {
            if (!_mglLizenzenCache[pnKey]) _mglLizenzenCache[pnKey] = [];
            _mglLizenzenCache[pnKey].push(l);
          }
        });
      }
    } catch (err) {
      console.error('❌ Fehler beim Parsen der Lizenzen im Cache:', err);
    }

    // Funktionen indizieren
    try {
      const fnData = await resFn.json();
      _mglFunktionenCache = {};
      if (fnData.success && Array.isArray(fnData.data)) {
        fnData.data.forEach(f => {
          const pnKey = String(f.PersonNumber || '').trim();
          if (pnKey) {
            if (!_mglFunktionenCache[pnKey]) _mglFunktionenCache[pnKey] = [];
            _mglFunktionenCache[pnKey].push(f);
          }
        });
      }
    } catch (err) {
      console.error('❌ Fehler beim Parsen der Funktionen im Cache:', err);
    }

    // Historie indizieren
    try {
      const histData = await resHist.json();
      _mglHistoryCache = {};
      if (histData.success && Array.isArray(histData.data)) {
        histData.data.forEach(h => {
          const pnKey = String(h.PersonNumber || '').trim();
          if (pnKey) {
            if (!_mglHistoryCache[pnKey]) _mglHistoryCache[pnKey] = [];
            _mglHistoryCache[pnKey].push(h);
          }
        });
      }
    } catch (err) {
      console.error('❌ Fehler beim Parsen der Historie im Cache:', err);
    }

    _mglData = Array.isArray(data.data) ? data.data : [];
    renderMitgliederView(_mglData);
    mglFilter();
  } catch (e) {
    console.error('❌ loadMitgliederData:', e);
    container.innerHTML = `<div class="alert alert-danger"><strong>Fehler:</strong> ${escapeHtml(e.message)}</div>`;
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
