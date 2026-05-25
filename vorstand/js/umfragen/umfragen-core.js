// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - CORE ===

let umfragenState = null;
let currentEventId = null;
let eventParticipants = [];
let membersLookup = null;
let umfragenSortField = 'datum';
let umfragenSortDir = -1;
let currentGroupEventId = null;
let currentGroupParticipants = [];
let rawResponsesLog = [];
let rawViewsLog = [];
let rawUmfragenMembers = [];

function isTrue(val) {
    if(val === true || val === 1 || String(val).toLowerCase() === 'ja' || String(val).toLowerCase() === 'true') return true;
    return false;
}

async function loadUmfragenData(force = false) {
  const container = document.getElementById('umfragen-container');
  if(!container) return;
  
  if (force) {
    window._umfragenParticipantsCache = {};
    window._gvParticipantsCache = {};
    umfragenState = null;
    gvState = null;
    rawResponsesLog = [];
    rawViewsLog = [];
    rawUmfragenMembers = [];
    if (typeof adminState !== 'undefined') {
      adminState = null;
    }
  }
  
  if (!force && umfragenState && document.getElementById('umfragen-tabs')) {
    console.log("⚡ loadUmfragenData: Lade aus lokalem Cache...");
    return;
  }
  
  container.innerHTML = `
    <div class="text-center p-4 text-muted">
      <div class="spinner-border spinner-border-sm text-primary mb-2"></div>
      <div>Lade Umfragen & Events...</div>
    </div>
  `;

  try {
    // Falls das Backend noch nicht aktualisiert wurde, fangen wir das weich ab
    const res = await apiFetch('umfragen', 'action=getAllEventsAdmin');
    const data = await res.json();
    
    if(data.error) throw new Error(data.error);

    umfragenState = Array.isArray(data) ? data : (data.events || []);
    renderUmfragenUI(container);
    setTimeout(preloadUmfragenAllDetails, 50);
  } catch (e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden (Google Script bereits aktualisiert?): ${escapeHtml(e.message)}</div>`;
  }
}

function getEventIdFromLog(log) {
    if (!log) return '';
    // 1. Direkt prüfen
    if (log.eventid !== undefined) return String(log.eventid);
    if (log.event !== undefined) return String(log.event);
    
    // 2. Alle Keys durchsuchen (case-insensitive, Sonderzeichen ignoriert)
    for (const key of Object.keys(log)) {
        const normalizedKey = key.toLowerCase().trim().replace(/[-_\s]/g, '');
        if (normalizedKey === 'eventid' || normalizedKey === 'event' || normalizedKey === 'anlassid' || normalizedKey === 'anlass') {
            return String(log[key]);
        }
    }
    
    // 3. Fallback: Erster Key (Spalte A), falls nicht einer der bekannten Spalten
    const firstKey = Object.keys(log)[0];
    if (firstKey && !['lizenz', 'zeitpunkt', 'timestamp', 'info', 'teilnahme', 'attending', 'anzahl_teilnehmer', 'count', 'anzahl_essen', 'essen', 'food'].includes(firstKey.toLowerCase().trim())) {
        return String(log[firstKey]);
    }
    return '';
}

// === HINTERGRUND-PRELOADER FÜR UMFRAGEN-DETAILS ===
async function preloadUmfragenAllDetails() {
    console.log("🕒 Starte Hintergrund-Preloading für alle Umfragen-Details...");
    try {
        // 1. Adress-Lookup im Hintergrund vorverlegen
        await ensureMembersLookup();

        // 2. Historie & Tracking Logs vorverlegen
        const hasLogs = rawResponsesLog.length > 0 && rawViewsLog.length > 0;
        if (!hasLogs) {
            Promise.all([
                apiFetch('umfragen', 'action=getResponsesLog').then(r => r.json()),
                apiFetch('umfragen', 'action=getViewsLog').then(r => r.json())
            ]).then(([resLog, resViews]) => {
                rawResponsesLog = Array.isArray(resLog) ? resLog : [];
                rawViewsLog = Array.isArray(resViews) ? resViews : [];
                
                const parseTime = (t) => t ? new Date(t).getTime() : 0;
                rawResponsesLog.sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp));
                rawViewsLog.sort((a, b) => parseTime(b.zeitpunkt || b.timestamp) - parseTime(a.zeitpunkt || a.timestamp));
                console.log("✅ Historie & Tracking Logs im Hintergrund geladen.");
                
                // Falls der User bereits auf dem Tab ist, Daten direkt rendern
                if (document.getElementById('hist-rsvp-body') && document.getElementById('hist-rsvp-body').innerHTML.includes('Lade')) {
                    filterHistorieData();
                }
            }).catch(err => console.warn("Hintergrund-Laden der Historie fehlgeschlagen:", err));
        }

        // 3. Teilnehmer für alle Events im Hintergrund vorverlegen
        const events = umfragenState || [];
        window._umfragenParticipantsCache = window._umfragenParticipantsCache || {};
        window._gvParticipantsCache = window._gvParticipantsCache || {};

        // Wir rufen die Api-Anfragen parallel auf, um eine extrem schnelle Ladezeit zu erreichen
        const promises = events.map(async (e) => {
            const eventId = e.id;
            if (!eventId) return;

            // Teilnehmer preloaden
            if (!window._umfragenParticipantsCache[eventId]) {
                try {
                    const res = await apiFetch('umfragen', `action=getParticipants&eventid=${encodeURIComponent(eventId)}`);
                    const pData = await res.json();
                    window._umfragenParticipantsCache[eventId] = pData;
                    console.log(`✅ Teilnehmer für Event ${eventId} im Hintergrund geladen.`);
                } catch (err) {
                    console.warn(`Fehler beim Preload der Teilnehmer für Event ${eventId}:`, err);
                }
            }

            // GV Status preloaden
            if (!window._gvParticipantsCache[eventId]) {
                try {
                    const res = await apiFetch('termine', { action: 'runTool', tool: 'getGVStatus', eventId: eventId }, 'POST');
                    const result = await res.json();
                    if (result.success) {
                        window._gvParticipantsCache[eventId] = result.data || [];
                        console.log(`✅ GV Status für Event ${eventId} im Hintergrund geladen.`);
                    }
                } catch (err) {
                    console.warn(`Fehler beim Preload des GV Status für Event ${eventId}:`, err);
                }
            }
        });

        await Promise.all(promises);
        console.log("✅ Hintergrund-Preloading für Umfragen vollständig abgeschlossen!");

    } catch (err) {
        console.warn("Fehler beim Preload von Umfragen-Details:", err);
    }
}
