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

function getPollSupabaseClient() {
    if (typeof window.getSupabaseClient === 'function') {
        return window.getSupabaseClient();
    }
    return window.supabaseClient || null;
}
window.getPollSupabaseClient = getPollSupabaseClient;

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

  // 1. VERSUCH: Nativ aus Supabase laden (sehr schnell)
  const supa = getPollSupabaseClient();
  if (supa) {
    try {
        const { data, error } = await supa
            .from('poll_events')
            .select('*')
            .order('datum', { ascending: false });
        
        if (!error && Array.isArray(data) && data.length > 0) {
            umfragenState = data.map(e => ({
                id: String(e.id),
                title: e.title || '',
                datum: e.datum || '',
                gruppe: e.gruppe || 'aktiv',
                schiessanlass: isTrue(e.schiessanlass),
                aktiv: isTrue(e.aktiv),
                showparticipants: isTrue(e.showparticipants),
                frage_begleitung: isTrue(e.frage_begleitung),
                frage_essen: isTrue(e.frage_essen),
                frage_grund: isTrue(e.frage_grund),
                dokument_url: e.dokument_url || '',
                details: e.details || '',
                options: parsePollOptions(e.options)
            }));
            console.log(`✅ ${umfragenState.length} Umfragen & Events aus Supabase geladen.`);
            renderUmfragenUI(container);
            return;
        } else if (error) {
            console.error("Supabase poll_events Abfragefehler:", error.message);
            container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Fehler beim Laden der Events aus Supabase: ${escapeHtml(error.message)}</div>`;
            return;
        }
    } catch (supaErr) {
        console.error("Supabase Abfrage fehlgeschlagen:", supaErr);
        container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Verbindungsfehler zu Supabase: ${escapeHtml(supaErr.message)}</div>`;
        return;
    }
  } else {
    container.innerHTML = `<div class="alert alert-danger"><i class="fas fa-exclamation-triangle me-2"></i>Supabase-Client nicht initialisiert.</div>`;
    return;
  }
}

// Legacy-Funktion (Migration abgeschlossen - keine GAS-Verbindung mehr)
function syncPollsFromLegacy() {
    alert("Google Sheet Migration ist abgeschlossen. Daten werden direkt über Supabase verwaltet.");
}
window.syncPollsFromLegacy = syncPollsFromLegacy;

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

// === HINTERGRUND-PRELOADER FÜR UMFRAGEN-DETAILS (DIREKT AUS SUPABASE) ===
async function preloadUmfragenAllDetails() {
    console.log("🕒 Starte Hintergrund-Preloading für alle Umfragen-Details aus Supabase...");
    try {
        // 1. Adress-Lookup im Hintergrund vorverlegen
        await ensureMembersLookup();

        const supa = (typeof getPollSupabaseClient === 'function') ? getPollSupabaseClient() : (window.supabaseClient || null);
        if (!supa) return;

        // 2. Historie & Tracking Logs vorverlegen direkt aus Supabase
        const hasLogs = rawResponsesLog.length > 0 && rawViewsLog.length > 0;
        if (!hasLogs) {
            try {
                const [resLog, resViews] = await Promise.all([
                    supa.from('poll_responses_log').select('*').order('zeitstempel', { ascending: false }).limit(200),
                    supa.from('poll_views').select('*').order('zeitpunkt', { ascending: false }).limit(200)
                ]);
                if (!resLog.error && !resViews.error) {
                    rawResponsesLog = (resLog.data || []).map(l => ({
                        eventid: l.event_id,
                        lizenz: l.lizenz,
                        attending: l.action !== 'reset_to_open',
                        count: l.count,
                        essen: l.essen,
                        vegi: l.vegi,
                        grund: l.grund,
                        timestamp: l.zeitstempel
                    }));
                    rawViewsLog = (resViews.data || []).map(v => ({
                        eventid: v.event_id,
                        lizenz: v.lizenz,
                        zeitpunkt: v.zeitpunkt,
                        info: v.info
                    }));

                    const parseTime = (t) => t ? new Date(t).getTime() : 0;
                    rawResponsesLog.sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp));
                    rawViewsLog.sort((a, b) => parseTime(b.zeitpunkt || b.timestamp) - parseTime(a.zeitpunkt || a.timestamp));
                    console.log("✅ Historie & Tracking Logs aus Supabase im Hintergrund geladen.");

                    if (document.getElementById('hist-rsvp-body') && document.getElementById('hist-rsvp-body').innerHTML.includes('Lade')) {
                        filterHistorieData();
                    }
                }
            } catch (supaLogErr) {
                console.warn("Supabase Tracking-Log Preload Warnung:", supaLogErr);
            }
        }

        // 3. Teilnehmer für alle Events im Hintergrund direkt via Supabase vorverlegen
        const events = umfragenState || [];
        window._umfragenParticipantsCache = window._umfragenParticipantsCache || {};

        const promises = events.map(async (e) => {
            const eventId = e.id;
            if (!eventId) return;

            if (!window._umfragenParticipantsCache[eventId]) {
                try {
                    const { data, error } = await supa
                        .from('poll_responses')
                        .select('*')
                        .eq('event_id', String(eventId))
                        .eq('attending', true);
                    if (!error && Array.isArray(data)) {
                        const pData = data.map(r => {
                            let liz = String(r.lizenz || '').trim();
                            let m = (membersLookup && (membersLookup[liz] || membersLookup[liz.padStart(6, '0')]));
                            let memberName = m ? `${m.LastName || ''} ${m.FirstName || ''}`.trim() : `Lizenz ${liz}`;
                            return {
                                lizenz: liz,
                                name: memberName,
                                count: parseInt(r.count) || 1,
                                essen: parseInt(r.essen) || 0,
                                vegi: parseInt(r.vegi) || 0,
                                grund: r.grund || '',
                                optionids: r.optionids || ''
                            };
                        });
                        window._umfragenParticipantsCache[eventId] = pData;
                    }
                } catch (err) {
                    console.warn(`Fehler beim Preload der Teilnehmer für Event ${eventId}:`, err);
                }
            }
        });

        await Promise.all(promises);
        console.log("✅ Hintergrund-Preloading für Umfragen vollständig abgeschlossen!");

    } catch (err) {
        console.warn("Fehler beim Preload von Umfragen-Details:", err);
    }
}
