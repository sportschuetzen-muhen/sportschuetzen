// === MODUL: LOGINS & SYSTEM LOG ===

let loginsState = null;

async function loadLoginsData() {
  const container = document.getElementById('system-log-container');
  if(!container) return;
  
  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade Protokoll...</div>
    </div>
  `;

  try {
    // 'logins' wird vom Worker auf den 'admin'-Endpunkt gerouted (MODULE_ALIASES)
    const res = await apiFetch('logins', 'action=getLog');
    loginsState = await res.json();
    renderProtokollList(container);
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden: ${escapeHtml(e.message)}</div>`;
  }
}

function renderProtokollList(container) {
     if(!loginsState || !loginsState.protokoll) {
         container.innerHTML = 'Keine Einträge vorhanden.';
         return;
     }
     container.innerHTML = loginsState.protokoll.map(p => `<div><strong>${escapeHtml(p.benutzer)}</strong>: ${escapeHtml(p.details)} <span class="float-end">${p.zeitstempel ? p.zeitstempel.split('T')[0] : ''}</span></div><hr class="my-1">`).join('');
}
