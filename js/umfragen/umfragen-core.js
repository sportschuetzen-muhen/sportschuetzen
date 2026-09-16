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

// === POLL-OPTIONEN PARSER (Tolerant für echtes JSON und Sheet-Map-Formate) ===
function parsePollOptions(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map(item => {
      if (typeof item === 'string') {
        const p = parsePollOptions(item);
        return p[0] || null;
      }
      return item;
    }).filter(Boolean);
  }
  if (typeof raw === 'object' && raw !== null) {
    return [raw];
  }

  const str = String(raw).trim();
  if (!str || str === '[]' || str === '{}') return [];

  // 1. Reguläres JSON.parse
  try {
    const jsonRes = JSON.parse(str);
    if (Array.isArray(jsonRes)) return jsonRes;
    if (typeof jsonRes === 'object' && jsonRes !== null) return [jsonRes];
  } catch(e) {}

  // 2. Fallback für Map/Key-Value Formate wie {start=10:24, datum=2026-09-15, id=omttnl8qz, ende=12:24}
  try {
    const matches = str.match(/\{[^}]+\}/g);
    if (matches && matches.length > 0) {
      const result = [];
      matches.forEach(item => {
        const clean = item.replace(/[{}]/g, '').trim();
        const obj = {};
        clean.split(',').forEach(part => {
          const eqIdx = part.indexOf('=');
          if (eqIdx > -1) {
            const k = part.substring(0, eqIdx).trim();
            const v = part.substring(eqIdx + 1).trim();
            if (k) obj[k] = v;
          }
        });
        if (Object.keys(obj).length > 0) {
          if (!obj.id) obj.id = 'opt_' + Math.random().toString(36).substring(2, 9);
          result.push(obj);
        }
      });
      if (result.length > 0) return result;
    }
  } catch(fallbackErr) {}

  return [];
}
window.parsePollOptions = parsePollOptions;

function formatSwissDate(dateVal) {
    if (!dateVal) return '-';
    let str = dateVal.toString().trim();
    if (!str) return '-';

    // 1. Reines Datum (YYYY-MM-DD) ohne Zeitzone splitten, um Verschiebungen zu verhindern
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const p = str.split('-');
        return `${p[2]}.${p[1]}.${p[0]}`;
    }

    // 2. Schweizer Format direkt zurückgeben
    const dmy = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
    if (dmy) {
        return `${dmy[1].padStart(2, '0')}.${dmy[2].padStart(2, '0')}.${dmy[3]}`;
    }

    // 3. Konkreter Zeitpunkt mit ISO "T" (Zeitzone erwünscht)
    if (str.includes('T')) {
        let d = new Date(str);
        if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}.${month}.${year}`;
        }
    }

    // Fallback
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}.${month}.${year}`;
    }

    return str;
}

function formatSwissDateWithWeekday(dateVal) {
    if (!dateVal) return '-';
    let str = dateVal.toString().trim();
    if (!str) return '-';

    let day = 0, month = 0, year = 0;

    // 1. Reines Datum YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const p = str.split('-');
        year = parseInt(p[0], 10);
        month = parseInt(p[1], 10) - 1;
        day = parseInt(p[2], 10);
    } 
    // 2. Schweizer Format DD.MM.YYYY
    else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(str)) {
        const p = str.split('.');
        day = parseInt(p[0], 10);
        month = parseInt(p[1], 10) - 1;
        year = parseInt(p[2], 10);
    } 
    // 3. Konkreter Zeitpunkt mit ISO
    else {
        let dParsed = new Date(str);
        if (!isNaN(dParsed.getTime())) {
            day = dParsed.getDate();
            month = dParsed.getMonth();
            year = dParsed.getFullYear();
        }
    }

    if (day && year) {
        // Fixierung auf 12:00 Uhr schützt vor jeglicher Zeitzonenverschiebung
        const d = new Date(year, month, day, 12, 0, 0);
        const weekdays = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        const wday = weekdays[d.getDay()];
        const dd = String(day).padStart(2, '0');
        const mm = String(month + 1).padStart(2, '0');
        return `${wday}, ${dd}.${mm}.${year}`;
    }

    return str;
}

function generateICSContent(title, dateVal, timeStr, location, description) {
    let day = 0, month = 0, year = 0;
    let str = (dateVal || '').toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const p = str.split('-');
        year = parseInt(p[0], 10);
        month = parseInt(p[1], 10) - 1;
        day = parseInt(p[2], 10);
    } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(str)) {
        const p = str.split('.');
        day = parseInt(p[0], 10);
        month = parseInt(p[1], 10) - 1;
        year = parseInt(p[2], 10);
    }

    let startHour = 19, startMin = 0;
    if (timeStr && timeStr.includes(':')) {
        const tParts = timeStr.split(':');
        startHour = parseInt(tParts[0], 10) || 19;
        startMin = parseInt(tParts[1], 10) || 0;
    }

    if (!year || !day) {
        const now = new Date();
        year = now.getFullYear();
        month = now.getMonth();
        day = now.getDate();
    }

    const dtStart = new Date(year, month, day, startHour, startMin, 0);
    const dtEnd = new Date(dtStart.getTime() + (2 * 3600 * 1000));

    function pad(n) { return String(n).padStart(2, '0'); }
    function toICSDate(d) {
        return `${d.getFullYear()}${pad(d.getMonth()+1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
    }

    const cleanTitle = (title || 'Sportschützen Anlass').replace(/[;\r\n]/g, ' ');
    const cleanLoc = (location || 'Schützenhaus Muhen').replace(/[;\r\n]/g, ' ');
    const cleanDesc = (description || 'Vereinsanlass Sportschützen Muhen').replace(/[\r\n]+/g, '\\n');

    return [
        'BEGIN:VCALENDAR',
        'VERSION:2.0',
        'PRODID:-//Sportschuetzen Muhen//Event Calendar//DE',
        'CALSCALE:GREGORIAN',
        'METHOD:PUBLISH',
        'BEGIN:VEVENT',
        `SUMMARY:${cleanTitle}`,
        `DESCRIPTION:${cleanDesc}`,
        `LOCATION:${cleanLoc}`,
        `DTSTART:${toICSDate(dtStart)}`,
        `DTEND:${toICSDate(dtEnd)}`,
        'BEGIN:VALARM',
        'TRIGGER:-P1D',
        'ACTION:DISPLAY',
        `DESCRIPTION:Erinnerung (1 Tag vorher): ${cleanTitle}`,
        'END:VALARM',
        'BEGIN:VALARM',
        'TRIGGER:-PT1H',
        'ACTION:DISPLAY',
        `DESCRIPTION:Erinnerung (1 Stunde vorher): ${cleanTitle}`,
        'END:VALARM',
        'END:VEVENT',
        'END:VCALENDAR'
    ].join('\r\n');
}

function downloadEventICS(title, dateVal, timeStr, location, description) {
    const icsData = generateICSContent(title, dateVal, timeStr, location, description);
    const blob = new Blob([icsData], { type: 'text/calendar;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    const filename = (title || 'event').toLowerCase().replace(/[^a-z0-9]/g, '_') + '.ics';
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function generateGoogleCalendarUrl(title, dateVal, timeStr, location, description) {
    let day = 0, month = 0, year = 0;
    let str = (dateVal || '').toString().trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const p = str.split('-');
        year = parseInt(p[0], 10);
        month = parseInt(p[1], 10) - 1;
        day = parseInt(p[2], 10);
    } else if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(str)) {
        const p = str.split('.');
        day = parseInt(p[0], 10);
        month = parseInt(p[1], 10) - 1;
        year = parseInt(p[2], 10);
    }
    let startHour = 19, startMin = 0;
    if (timeStr && timeStr.includes(':')) {
        const tParts = timeStr.split(':');
        startHour = parseInt(tParts[0], 10) || 19;
        startMin = parseInt(tParts[1], 10) || 0;
    }
    if (!year || !day) return '#';

    function pad(n) { return String(n).padStart(2, '0'); }
    const dtStart = new Date(year, month, day, startHour, startMin, 0);
    const dtEnd = new Date(dtStart.getTime() + (2 * 3600 * 1000));

    const startISO = `${dtStart.getFullYear()}${pad(dtStart.getMonth()+1)}${pad(dtStart.getDate())}T${pad(dtStart.getHours())}${pad(dtStart.getMinutes())}00`;
    const endISO = `${dtEnd.getFullYear()}${pad(dtEnd.getMonth()+1)}${pad(dtEnd.getDate())}T${pad(dtEnd.getHours())}${pad(dtEnd.getMinutes())}00`;

    const textEnc = encodeURIComponent(title || 'Sportschützen Anlass');
    const descEnc = encodeURIComponent(description || 'Vereinsanlass Sportschützen Muhen (Erinnerung 1 Tag & 1 Std. vorher)');
    const locEnc = encodeURIComponent(location || 'Schützenhaus Muhen');

    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${textEnc}&dates=${startISO}/${endISO}&details=${descEnc}&location=${locEnc}`;
}

function formatISODate(dateVal) {
    if (!dateVal) return '';
    let str = dateVal.toString().trim();
    if (!str) return '';

    // 1. Bereits im ISO-Format
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;

    // 2. Schweizer Format DD.MM.YYYY
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(str)) {
        const p = str.split('.');
        return `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
    }

    // 3. ISO mit "T" (z.B. 2026-08-12T19:30:00+02:00) ➔ Einfach vorne abschneiden!
    if (str.includes('T')) {
        return str.split('T')[0];
    }

    // Fallback
    let d = new Date(str);
    if (!isNaN(d.getTime())) {
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    return str;
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

    const rawEvents = Array.isArray(data) ? data : (data.events || []);
    umfragenState = rawEvents.map(e => ({
      ...e,
      options: parsePollOptions(e.options)
    }));
    renderUmfragenUI(container);
    // HINWEIS: preloadUmfragenAllDetails deaktiviert, da Teilnehmer und Historie on-demand geladen werden
    // setTimeout(preloadUmfragenAllDetails, 50);
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
