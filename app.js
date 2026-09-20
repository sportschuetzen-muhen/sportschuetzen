const WORKER_TERMINE_URL = "https://termine.dan-hunziker73.workers.dev?action=getTermine";
const EVENTPLANER_URL = "https://github-dropdown-refresh.dan-hunziker73.workers.dev";
const GOOGLE_SCRIPT_URL = `${EVENTPLANER_URL}?action=getHausKalender`;

// --- SUPABASE NATIVE INTEGRATION (Phase 5: Anlässe & Umfragen) ---
const SUPABASE_REST_URL = "http://192.168.68.117:8000/rest/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

async function fetchRSVPEventsFromSupabase(lizenz) {
    if (!lizenz) return null;
    const cleanLizenz = String(lizenz).trim();
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    };
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    try {
        const [resEvents, resResponses] = await Promise.all([
            fetch(`${SUPABASE_REST_URL}/poll_events?select=*&aktiv=eq.true&order=datum.asc`, { headers, signal: controller.signal }),
            fetch(`${SUPABASE_REST_URL}/poll_responses?select=*&lizenz=eq.${encodeURIComponent(cleanLizenz)}`, { headers, signal: controller.signal })
        ]);
        clearTimeout(timeoutId);

        if (!resEvents.ok) return null;
        const events = await resEvents.json();
        if (!Array.isArray(events) || events.length === 0) return null;
        const responses = resResponses.ok ? await resResponses.json() : [];

        const userRespMap = {};
        (responses || []).forEach(r => {
            userRespMap[String(r.event_id)] = r;
        });

        return events.map(e => {
            const uResp = userRespMap[String(e.id)];
            return {
                id: String(e.id),
                title: e.title || '',
                titel: e.title || '',
                datum_iso: e.datum || '',
                gruppe: e.gruppe || 'aktiv',
                schiessanlass: Boolean(e.schiessanlass),
                showParticipants: Boolean(e.showparticipants),
                frage_begleitung: Boolean(e.frage_begleitung),
                frage_essen: Boolean(e.frage_essen),
                frage_grund: Boolean(e.frage_grund),
                dokument_url: e.dokument_url || '',
                details: e.details || '',
                options: Array.isArray(e.options) ? e.options : [],
                attending: uResp ? uResp.attending : null,
                optionids: uResp ? (uResp.optionids || '') : '',
                count: uResp ? (parseInt(uResp.count) || 1) : 1,
                essen: uResp ? (parseInt(uResp.essen) || 0) : 0,
                vegi: uResp ? (parseInt(uResp.vegi) || 0) : 0,
                grund: uResp ? (uResp.grund || '') : ''
            };
        });
    } catch (err) {
        clearTimeout(timeoutId);
        return null;
    }
}

async function saveRSVPToSupabase(eventId, cleanLizenz, attending, count, essen, vegi, grund, optionids) {
    const headers = {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    };
    const body = {
        event_id: String(eventId),
        lizenz: String(cleanLizenz),
        attending: Boolean(attending),
        count: parseInt(count) || 1,
        essen: parseInt(essen) || 0,
        vegi: parseInt(vegi) || 0,
        grund: String(grund || '').trim(),
        optionids: String(optionids || '').trim()
    };
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/poll_responses`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        return res.ok;
    } catch(e) {
        return false;
    }
}

let allTermine = [];
const pollResultsCache = {};
const participantsCache = {};
const openPolls = new Set();
let touchStart = 0;
const spinner = document.getElementById('pull-spinner');

function prefetchParticipants(eventId) {
    if (!eventId || participantsCache[eventId]) return;
    fetch(`${EVENTPLANER_URL}?action=getParticipants&eventid=${encodeURIComponent(eventId)}`)
        .then(r => r.ok ? r.json() : null)
        .then(data => {
            if (Array.isArray(data)) {
                participantsCache[eventId] = data;
            }
        })
        .catch(() => {});
}

// --- EVENT LISTENER ---

// Auto-Update wenn die App wieder geöffnet wird
let lastResume = 0;

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;

    const now = Date.now();
    if (now - lastResume < 1500) return;

    lastResume = now;
    document.dispatchEvent(new CustomEvent("app:resume"));
});


// Pull-to-Refresh Logik
document.addEventListener('touchstart', e => { touchStart = e.touches[0].pageY; }, {passive: true});
document.addEventListener('touchmove', e => {
    const distance = e.touches[0].pageY - touchStart;
    if (window.scrollY <= 0 && distance > 0) {
        spinner.style.top = `${Math.min(distance / 2, 100) - 40}px`;
        spinner.style.transform = `translateX(-50%) scale(${distance > 90 ? 1.2 : 1})`;
    }
}, {passive: true});
document.addEventListener('touchend', e => {
    if (window.scrollY <= 0 && (e.changedTouches[0].pageY - touchStart) > 90) location.reload();
    else spinner.style.top = '-50px';
}, {passive: true});

// --- NAVIGATION ---

function nav(id, title, btn) {
    // 1. Alle Seiten ausblenden
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
    
    // 2. Zielseite einblenden
    const targetPage = document.getElementById(id);
    if (targetPage) {
        targetPage.classList.add('active-page');
    }
    
    // 3. Header-Titel anpassen
    document.getElementById('main-title').textContent = title;
    
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    if (btn) {
        btn.classList.add('active');
    }

    if (id === 'page-upload') {
        const uploadIFrame = document.querySelector('#page-upload iframe');
        if (uploadIFrame) {
            uploadIFrame.contentWindow.location.reload();
        }
    }

    // --- NEU: User Badge nur auf Home ---
    const badge = document.getElementById('user-badge');
    if (badge && localStorage.getItem('sportschuetzen_user')) {
        badge.style.display = (id === 'page-home') ? 'flex' : 'none';
    }

    // --- NEU: URL AKTUALISIEREN FÜR PULL-TO-REFRESH ---
    // Wir ziehen das Kürzel aus der ID (z.B. "page-jm" -> "jm")
    const pageKey = id.replace('page-', '');
    
    // Aktuellen Pfad holen (n_index.html)
    const newPath = window.location.pathname;

    if (pageKey === 'home') {
        // Auf der Startseite entfernen wir den ?page= Parameter
        window.history.replaceState({}, '', newPath);
    } else {
        // Auf Unterseiten setzen wir den passenden Parameter
        window.history.replaceState({}, '', `${newPath}?page=${pageKey}`);
    }
    
    // Nach oben springen
    window.scrollTo(0,0);
}
// Deep Linking Logik (Springe zu Seite via URL ?page=...)
function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('page');

    if (target) {
        const pages = {
            'jm': { id: 'page-jm', title: 'Jahresmeisterschaft', selector: '[onclick*="page-jm"]' },
            'gruppe': { id: 'page-gruppe', title: 'Gruppe & Grenzland', selector: '[onclick*="page-gruppe"]' },
            'mannschaft': { id: 'page-mannschaft', title: 'Mannschaft', selector: '[onclick*="page-mannschaft"]' },
            'upload': { id: 'page-upload', title: 'Upload', selector: '[onclick*="page-upload"]' }
        };

        const config = pages[target];
        if (config) {
            const btn = document.querySelector(config.selector);
            nav(config.id, config.title, btn);
        }
    }
}

// --- DATEN LADEN & RENDERN ---
async function loadTermine() {
    const wrap = document.getElementById("termine");
    const safeFetch = async (url) => {
        try {
            const r = await fetch(url);
            if(!r.ok) return [];
            const d = await r.json();
            return Array.isArray(d) ? d : [];
        } catch(e) { return []; }
    };

    try {
        const userObj = JSON.parse(localStorage.getItem('sportschuetzen_user') || '{}');
        const activeLizenz = userObj.lizenz ? String(userObj.lizenz).padStart(6, '0') : '';

        // --- STALE-WHILE-REVALIDATE: Sofort aus Cache anzeigen (<100ms) ---
        if ((!allTermine || allTermine.length === 0)) {
            try {
                const cachedStr = localStorage.getItem('sportschuetzen_termine_cache');
                if (cachedStr) {
                    const cachedData = JSON.parse(cachedStr);
                    if (Array.isArray(cachedData) && cachedData.length > 0) {
                        allTermine = cachedData;
                        renderTermine(allTermine, activeLizenz);
                    }
                }
            } catch(e) {}
        }

        const [resWorker, resGoogle, supaRSVP] = await Promise.all([
            safeFetch(WORKER_TERMINE_URL),
            safeFetch(GOOGLE_SCRIPT_URL),
            fetchRSVPEventsFromSupabase(activeLizenz)
        ]);

        let resRSVP = supaRSVP;
        if (!resRSVP || resRSVP.length === 0) {
            resRSVP = await safeFetch(`${EVENTPLANER_URL}?action=getRSVPEvents&lizenz=${activeLizenz}`);
        }

        // Titel-Normalisierung sofort sicherstellen (verhindert 'undefined')
        (resRSVP || []).forEach(t => {
            if (!t.titel && t.title) t.titel = t.title;
        });

        // Poll-Ergebnisse ECHT im Hintergrund vorladen (OHNE await - blockiert das Rendern NICHT!)
        const pollEvents = (resRSVP || []).filter(t => t.options && t.options.length > 0);
        if (pollEvents.length > 0) {
            pollEvents.forEach(pe => {
                fetch(`${EVENTPLANER_URL}?action=getPollResults&eventid=${encodeURIComponent(pe.id)}`)
                    .then(r => r.ok ? r.json() : null)
                    .then(data => {
                        if (data && !data.error) {
                            pollResultsCache[pe.id] = data;
                            // Falls bereits eine Poll-Karte im DOM gerendert ist, Resultate sofort auffrischen
                            const fullEvent = allTermine.find(x => String(x.id) === String(pe.id)) || pe;
                            if (!fullEvent.titel && fullEvent.title) fullEvent.titel = fullEvent.title;
                            const cardEl = document.getElementById(`rsvp-${pe.id}`) || document.getElementById(`poll-card-${pe.id}`);
                            if (cardEl && fullEvent.attending !== null && fullEvent.attending !== undefined) {
                                const wasOpen = openPolls.has(String(pe.id)) || document.getElementById(`poll-body-${pe.id}`)?.style.display === 'block';
                                if (wasOpen) openPolls.add(String(pe.id));
                                const tempWrap = document.createElement('div');
                                renderPollCard(fullEvent, tempWrap);
                                if (tempWrap.firstElementChild) {
                                    cardEl.replaceWith(tempWrap.firstElementChild);
                                }
                            }
                        }
                    })
                    .catch(() => {});
            });
        }

        // --- 1. DUBLETTEN-PRÜFUNG: VEREIN VS. HAUSKALENDER ---
        // Vereinsdaten haben Vorrang vor Belegungen aus dem Hauskalender.
        const normalizeDateStr = (obj) => {
            if (!obj) return '';
            const str = (obj.datum_iso || obj.datum || '').toString().trim();
            if (!str) return '';
            if (str.includes('.')) {
                const p = str.split('.');
                if (p.length >= 3) {
                    return `${p[2].trim()}-${p[1].trim().padStart(2, '0')}-${p[0].trim().padStart(2, '0')}`;
                }
            }
            return str.split('T')[0].trim();
        };

        const normalizeTitle = (str) => {
            return (str || '').toLowerCase().replace(/[^a-z0-9äöü]/g, '');
        };

        const merged = [];

        // Zuerst alle Vereinstermine aus dem Jahresprogramm übernehmen
        (resWorker || []).forEach(t => {
            merged.push({ ...t, typ: 'verein' });
        });

        // Hauskalender hinzufügen, ausser derselbe Termin existiert bereits im Vereinsprogramm
        (resGoogle || []).forEach(ext => {
            const extDate = normalizeDateStr(ext);
            const extTitle = normalizeTitle(ext.titel);

            const isDuplicate = merged.some(v => {
                const vDate = normalizeDateStr(v);
                const vTitle = normalizeTitle(v.titel);
                return vDate && vDate === extDate && (
                    vTitle.includes(extTitle.substring(0, 10)) || 
                    extTitle.includes(vTitle.substring(0, 10))
                );
            });

            if (!isDuplicate) {
                merged.push({ ...ext, typ: 'extern' });
            }
        });

        // --- 2. RSVP-VERKNÜPFUNG (EVENTPLANER) ---
        // Verknüpft RSVP-Infos (Zu-/Absagen, Essen) mit bestehenden Terminen, ohne Details (Uhrzeit, Ort) zu verlieren
        (resRSVP || []).forEach(r => {
            const rDate = normalizeDateStr(r);
            const rTitle = normalizeTitle(r.title || r.titel);

            // Prüfen, ob ein passender Termin im Vereinsprogramm existiert
            const existing = merged.find(m => {
                if (m.typ !== 'verein') return false;
                const mDate = normalizeDateStr(m);
                const mTitle = normalizeTitle(m.titel);
                return mDate && mDate === rDate && (
                    mTitle.includes(rTitle.substring(0, 10)) || 
                    rTitle.includes(mTitle.substring(0, 10))
                );
            });

            if (existing) {
                // Bestehenden Termin mit RSVP-Daten anreichern
                existing.isRSVP = true;
                existing.id = r.id; // RSVP-ID für Formular-Aktionen beibehalten
                existing.frage_begleitung = r.frage_begleitung;
                existing.frage_essen = r.frage_essen;
                existing.frage_grund = r.frage_grund;
                existing.options = r.options || [];
                existing.optionids = r.optionids || '';
                existing.attending = r.attending;
                existing.count = r.count;
                existing.essen = r.essen;
                existing.vegi = r.vegi;
                existing.grund = r.grund;
                existing.showParticipants = r.showParticipants;
                if (r.details) existing.details = r.details;
                if (r.dokument_url) existing.dokument_url = r.dokument_url;
            } else {
                // Falls der RSVP-Termin nur im Eventplaner existiert (z.B. Auswärtsschiessen-Umfrage)
                merged.push({
                    ...r,
                    typ: 'verein',
                    isRSVP: true,
                    titel: r.title || r.titel,
                    frage_begleitung: r.frage_begleitung,
                    frage_essen: r.frage_essen,
                    options: r.options || [],
                    optionids: r.optionids || ''
                });
            }
        });

        // --- ROBUSTE DATUMS-PARSING HILFSFUNKTION ---
        const parseEventDate = (obj) => {
            if (!obj) return null;
            let str = (obj.datum_iso || obj.datum || '').toString().trim();
            if (!str) return null;

            // Deutsches Format: DD.MM.YYYY
            if (str.includes('.')) {
                const parts = str.split('.');
                if (parts.length >= 3) {
                    const d = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10) - 1;
                    const y = parseInt(parts[2], 10);
                    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
                }
            }

            // ISO Format: YYYY-MM-DD (z.B. Google Kalender)
            if (str.includes('-')) {
                const datePart = str.split('T')[0];
                const parts = datePart.split('-');
                if (parts.length === 3) {
                    const y = parseInt(parts[0], 10);
                    const m = parseInt(parts[1], 10) - 1;
                    const d = parseInt(parts[2], 10);
                    if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
                }
            }

            const fallback = new Date(str);
            return isNaN(fallback.getTime()) ? null : fallback;
        };

        // --- SORTIERUNG ---
        allTermine = merged.sort((a, b) => {
            const dA = parseEventDate(a);
            const dB = parseEventDate(b);
            const tA = dA ? dA.getTime() : 8640000000000000;
            const tB = dB ? dB.getTime() : 8640000000000000;
            return tA - tB;
        });
        // Präfixe hinzufügen BEVOR vergangene Termine gefiltert werden!
        allTermine = applyRundenPrefix(allTermine);

        // Vergangene Termine entfernen (heute wird noch angezeigt)
        const today = new Date();
        today.setHours(0,0,0,0);

        allTermine = allTermine.filter(t => {
            const dateObj = parseEventDate(t);
            if (!dateObj) return false;

            dateObj.setHours(0,0,0,0);
            return dateObj >= today;
        });

        // Frische Daten im Cache für den nächsten Sofortstart ablegen
        try {
            localStorage.setItem('sportschuetzen_termine_cache', JSON.stringify(allTermine));
        } catch(e) {}

        renderTermine(allTermine, activeLizenz);

    } catch (e) { 
        if (!allTermine || allTermine.length === 0) {
            wrap.innerHTML = "Fehler beim Laden."; 
        }
    }
}


// --- DOKUMENT-URL HILFSFUNKTIONEN (AUCH FÜR DRIVE-IDs) ---
function resolveDocUrl(raw) {
    if (!raw) return '';
    let str = String(raw).trim();
    if (!str) return '';
    // Falls bereits vollständige URL
    if (str.startsWith('http://') || str.startsWith('https://')) {
        return str;
    }
    // Falls reine Google Drive File-ID (z.B. 17XXN4QbHa1Dv2RLnjbs9awhoO0yGcSru)
    return `https://drive.google.com/file/d/${str}/view?usp=sharing`;
}

function buildDocButtonsHtml(t) {
    if (!t.dokument_url) return '';
    const urls = String(t.dokument_url).split(',').map(u => u.trim()).filter(Boolean);
    if (urls.length === 0) return '';

    const isPoll = t.options && t.options.length > 0;
    let html = `<div style="margin-top: 8px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; align-items: center; width: 100%;">`;
    urls.forEach((u, idx) => {
        const fullUrl = resolveDocUrl(u);
        let label = isPoll ? '📄 Schiessplan / Dokument öffnen' : '📄 Dokument / Beilage';
        if (urls.length > 1) {
            if (!isPoll && idx === 0) label = '📄 1. Einladung zur GV';
            else if (!isPoll && idx === 1) label = '📄 2. Protokoll GV';
            else if (!isPoll && idx === 2) label = '📄 3. Jahresbericht';
            else if (isPoll && idx === 0) label = '📄 1. Schiessplan / Beilage';
            else label = `📄 Beilage ${idx + 1}`;
        }
        html += `
            <a href="${fullUrl}" target="_blank" rel="noopener" class="hero-doc-btn" style="margin: 0; width: 85%; max-width: 280px; box-sizing: border-box;">
                ${label}
            </a>
        `;
    });
    html += `</div>`;
    return html;
}

function buildDetailsHtml(t) {
    if (!t.details) return '';
    return `
        <div style="margin-top: 10px; margin-bottom: 10px; width: 100%;">
            <button class="hero-details-toggle" type="button" onclick="const content = document.getElementById('details-content-${t.id}'); content.style.display = content.style.display === 'none' ? 'block' : 'none'; this.textContent = content.style.display === 'none' ? '📝 Details & Infos anzeigen' : '✕ Details ausblenden';">
                📝 Details & Infos anzeigen
            </button>
            <div id="details-content-${t.id}" class="hero-details-content" style="display: none;">
                ${t.details}
            </div>
        </div>
    `;
}

function renderTermine(data, activeLizenz) {
    const wrap = document.getElementById("termine");
    const heroWrap = document.getElementById("hero-rsvps");
    const currentYear = new Date().getFullYear();
    const months = ["Jan.", "Feb.", "März", "April", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
    const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

    const parseEventDate = (obj) => {
        if (!obj) return null;
        let str = (obj.datum_iso || obj.datum || '').toString().trim();
        if (!str) return null;
        if (str.includes('.')) {
            const parts = str.split('.');
            if (parts.length >= 3) {
                const d = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                const y = parseInt(parts[2], 10);
                if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
            }
        }
        if (str.includes('-')) {
            const datePart = str.split('T')[0];
            const parts = datePart.split('-');
            if (parts.length === 3) {
                const y = parseInt(parts[0], 10);
                const m = parseInt(parts[1], 10) - 1;
                const d = parseInt(parts[2], 10);
                if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
            }
        }
        const fallback = new Date(str);
        return isNaN(fallback.getTime()) ? null : fallback;
    };

    wrap.innerHTML = "";
    if (heroWrap) heroWrap.innerHTML = "";
    
    let normalCount = 0;

    data.forEach(t => {
        // "Abgesagt" oder Google-Reinigungs-Termine ignorieren
        if(t.status === "abgesagt") return;
        const isExtern = t.typ === "extern";
        if(isExtern && t.titel.toLowerCase().includes("reinigung")) return;

        // Vorbereitung des Google Maps Links
        const mapQuery = encodeURIComponent(t.map || (t.ort + " Muhen"));
        const mapLink = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
        
        // Datum konvertieren
        const dObj = parseEventDate(t);
        if (!dObj) return; // Ohne Datum kein Eintrag

        const weekday = days[dObj.getDay()];
        const dateDisplay = `${dObj.getDate()}. ${months[dObj.getMonth()]}`;
        const yearVal = dObj.getFullYear();
        const subLine = (yearVal !== currentYear) ? `${weekday} '${yearVal.toString().substring(2)}` : weekday;

        // POLL-KARTE (Auswaertsschiessen mit Optionen)
        if (t.isRSVP && t.options && t.options.length > 0 && heroWrap) {
            renderPollCard(t, heroWrap);
            return;
        }

        // HERO CARD RENDERING
        if (t.isRSVP && heroWrap) {
            const hasAnswered = t.attending === true || t.attending === "true" || t.attending === false || t.attending === "false";
            
            // Tracking: Dem Backend sagen, dass diese Karte gesehen wurde (nur wenn noch nicht geantwortet)
            if (activeLizenz && !hasAnswered) trackRSVPView(t.id, activeLizenz);

            const isAttending = t.attending === true || t.attending === "true";
            
            let onYesClick = `submitRSVP('${t.id}', true)`;
            if (t.frage_begleitung || t.frage_essen) {
                const cCount = (t.count !== undefined && t.count !== null && t.count !== "") ? Number(t.count) : 1;
                const cEssen = (t.essen !== undefined && t.essen !== null && t.essen !== "") ? Number(t.essen) : ((t.food !== undefined && t.food !== null && t.food !== "") ? Number(t.food) : 1);
                const cVegi = (t.vegi !== undefined && t.vegi !== null && t.vegi !== "") ? Number(t.vegi) : 0;
                onYesClick = `openRSVPForm('${t.id}', ${!!t.frage_begleitung}, ${!!t.frage_essen}, ${cCount}, ${cEssen}, ${cVegi})`;
            }

            let onNoClick = `openAbmeldeForm('${t.id}')`;
            if (t.frage_grund === false || t.frage_grund === "false") {
                onNoClick = `submitRSVP('${t.id}', false)`;
            }

            let docButton = '';
            if (t.dokument_url) {
                const urls = t.dokument_url.split(',').map(u => u.trim()).filter(Boolean);
                docButton = `<div style="margin-top: 5px; margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px; align-items: center; width: 100%;">`;
                urls.forEach((url, idx) => {
                    let label = `📄 Dokument / Beilage`;
                    if (urls.length > 1) {
                        if (idx === 0) label = `📄 1. Einladung zur GV`;
                        else if (idx === 1) label = `📄 2. Protokoll GV`;
                        else if (idx === 2) label = `📄 3. Jahresbericht`;
                        else label = `📄 Beilage ${idx + 1}`;
                    } else {
                        label = `📄 Einladung / Dokument öffnen`;
                    }
                    docButton += `
                        <a href="${url}" target="_blank" class="hero-doc-btn" style="margin: 0; width: 85%; max-width: 280px; box-sizing: border-box;">
                             ${label}
                        </a>
                    `;
                });
                docButton += `</div>`;
            }

            let detailsBlock = '';
            if (t.details) {
                detailsBlock = `
                    <div style="margin-top: 10px; margin-bottom: 10px; width: 100%;">
                        <button class="hero-details-toggle" type="button" onclick="const content = document.getElementById('details-content-${t.id}'); content.style.display = content.style.display === 'none' ? 'block' : 'none'; this.textContent = content.style.display === 'none' ? '📝 Details & Traktanden anzeigen' : '✕ Details ausblenden';">
                            📝 Details & Traktanden anzeigen
                        </button>
                        <div id="details-content-${t.id}" class="hero-details-content" style="display: none;">
                            ${t.details}
                        </div>
                    </div>
                `;
            }

            let bodyContent = '';
            
            if (isAttending) {
                bodyContent = `<div class="hero-chip success" style="margin-bottom:0; align-self:center;">✅ Angemeldet</div>`;
                if (t.dokument_url) bodyContent += docButton;
                if (t.details) bodyContent += detailsBlock;
                if (t.frage_begleitung || t.frage_essen) {
                    bodyContent += `<button class="hero-link" style="color:var(--primary); font-weight:bold; margin-top:5px;" onclick="${onYesClick}">Details ändern</button>`;
                }
                bodyContent += `<button class="hero-link" style="margin-top:5px;" onclick="${onNoClick}">Absagen</button>`;

            } else if (hasAnswered && !isAttending) {
                bodyContent = `<div class="hero-chip error" style="align-self:center;">❌ Abgemeldet</div>`;
                if (t.dokument_url) bodyContent += docButton;
                if (t.details) bodyContent += detailsBlock;
                bodyContent += `<button class="hero-link" onclick="${onYesClick}">Doch Anmelden</button>`;
            } else {
                bodyContent = `
                    <h3 style="margin-top:0; color:#1e293b; font-size:1.2rem;">${t.titel}</h3>
                    <p style="color:#64748b; font-size:0.9rem; font-weight:600; margin-bottom:15px;">📅 ${dateDisplay} ${yearVal !== currentYear ? yearVal : ''}</p>
                    ${docButton}
                    ${detailsBlock}
                    <p class="hero-subtitle">Bist du dabei?</p>
                    <div class="hero-actions">
                        <button class="hero-btn success" onclick="${onYesClick}">Ja, sicher</button>
                        <button class="hero-btn error" onclick="${onNoClick}">Nein</button>
                    </div>`;
            }

            if (t.showParticipants) {
                prefetchParticipants(t.id);
                bodyContent += `<button class="hero-link participants" onclick="showParticipants('${t.id}')">👥 Teilnehmer anzeigen</button>`;
            }

            if (hasAnswered) {
                // COMPACT ACCORDION MODE
                heroWrap.innerHTML += `
                <div class="hero-card compact" id="rsvp-${t.id}">
                    <div class="compact-header" onclick="document.getElementById('hero-body-${t.id}').style.display = document.getElementById('hero-body-${t.id}').style.display === 'none' ? 'flex' : 'none'">
                        <div class="compact-info">
                            <strong>${t.titel}</strong>
                            <span>📅 ${dateDisplay}</span>
                        </div>
                        <div class="hero-chip ${isAttending ? 'success' : 'error'}" style="margin:0; padding:6px 12px; font-size:1.2rem;">
                            ${isAttending ? '✅' : '❌'}
                        </div>
                    </div>
                    <div class="compact-body" id="hero-body-${t.id}" style="display:none; flex-direction:column; text-align:center;">
                        ${bodyContent}
                    </div>
                </div>`;
            } else {
                // NORMAL MODE (Unanswered)
                heroWrap.innerHTML += `
                <div class="hero-card" id="rsvp-${t.id}">
                    <div class="hero-card-inner" style="display:flex; flex-direction:column; text-align:center;">
                        ${bodyContent}
                    </div>
                </div>`;
            }
        }

        normalCount++;
        // Render HTML
    wrap.innerHTML += `
        <div class="termin-row ${isExtern ? 'extern' : ''}">
            <div class="termin-date">
                <span class="date-main">${dateDisplay}</span>
                <span class="date-sub">${subLine}</span>
            </div>
            <div class="termin-content">
                <span class="termin-title">${isExtern ? '🏠 ' : ''}${t.titel}</span>
                <div class="termin-meta">
                    <a href="${mapLink}" target="_blank" class="map-link">
                        <span>${isExtern ? 'Schützenhaus' : '📍 ' + (t.ort || 'Muhen')}</span>
                    </a>
                    ${t.start ? `<span>🕒 ${t.start}</span>` : ""}
                </div>
                ${t.status === 'provisorisch' ? '<span class="badge-prov">Provisorisch</span>' : ''}
                ${isExtern ? '<span class="badge-extern">Haus belegt</span>' : ''}
                ${t.isRSVP ? `
                    <span class="badge-prov" style="cursor:pointer; background:${t.attending === true || t.attending === 'true' ? '#dcfce7; color:#15803d; border-color:#bbf7d0;' : (t.attending === false || t.attending === 'false' ? '#fee2e2; color:#b91c1c; border-color:#fecaca;' : '#e0f2fe; color:#0369a1; border-color:#bae6fd;')} font-size:0.75rem; font-weight:600; padding:2px 8px; border-radius:10px;" onclick="document.getElementById('rsvp-${t.id}')?.scrollIntoView({behavior:'smooth'})">
                        ${t.attending === true || t.attending === 'true' ? '✅ Angemeldet' : (t.attending === false || t.attending === 'false' ? '❌ Abgemeldet' : '📩 Anmeldung')}
                    </span>
                ` : ''}
                ${t.dokument_url ? `
                    <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px;">
                        ${t.dokument_url.split(',').map((url, idx, arr) => `
                            <a href="${url.trim()}" target="_blank" class="badge-doc">
                                📄 ${arr.length > 1 ? `Dokument ${idx + 1}` : 'Dokument / Einladung'}
                            </a>
                        `).join('')}
                    </div>` : ''}
            </div>
        </div>`;
    });

    if (normalCount === 0) wrap.innerHTML = "Keine Termine gefunden.";
}

function filterTermine(type, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    
    const userObj = JSON.parse(localStorage.getItem('sportschuetzen_user') || '{}');
    const activeLizenz = userObj.lizenz ? String(userObj.lizenz).padStart(6, '0') : '';

    if(type === 'all') renderTermine(allTermine, activeLizenz);
    else renderTermine(allTermine.filter(t => t.typ === type), activeLizenz);
}

function applyRundenPrefix(termine) {
    const rules = {
        "Gruppenmeisterschaft SSV": 3,
        "Gruppenmeisterschaft AGSV": 3,
        "Grenzland-Cup": 3,
        "Mannschaftsmeisterschaft": 7
    };

    const counters = {};

    return termine.map(t => {
        const title = t.titel.trim();

        // Finals oder Sonderformen NICHT anfassen
        if (title.toLowerCase().startsWith("final")) return t;

        for (const baseTitle in rules) {
            if (title === baseTitle) {
                counters[baseTitle] = (counters[baseTitle] || 0) + 1;

                // Sicherheit: nicht über max. Runden hinaus
                if (counters[baseTitle] <= rules[baseTitle]) {
                    return {
                        ...t,
                        titel: `${counters[baseTitle]}. Runde ${title}`
                    };
                }
            }
        }
        return t;
    });
}


// --- LOGIN LOGIK ---
let allUsers = [];

// --- HASHING FUNKTION (SHA-256) ---
async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function initLogin() {
    const userStr = localStorage.getItem('sportschuetzen_user');
    const wrapper = document.getElementById('app-wrapper');
    const loginOverlay = document.getElementById('login-overlay');

    // SSO-Check: Weiterleitungsparameter von Vereins-Homepage prüfen
    const urlParams = new URLSearchParams(window.location.search);
    const redirectTarget = urlParams.get('redirect') || urlParams.get('returnUrl');

    if (userStr) {
        let user = JSON.parse(userStr);
        // Migration: Falls Lizenz noch nicht sechstellig ist
        if (user.lizenz && user.lizenz.length < 6 && !isNaN(user.lizenz)) {
            user.lizenz = user.lizenz.padStart(6, '0');
            localStorage.setItem('sportschuetzen_user', JSON.stringify(user));
        }
        syncOneSignal(user);

        // Falls von der Website aufgerufen und bereits angemeldet:
        if (redirectTarget) {
            const sessionPayload = {
                id: user.id,
                lizenz: user.lizenz,
                name: user.name,
                vorname: user.vorname,
                nachname: user.nachname,
                role: user.role || 'member',
                ts: Date.now()
            };
            const token = btoa(encodeURIComponent(JSON.stringify(sessionPayload)));
            const sep = redirectTarget.includes('?') ? '&' : '?';
            window.location.href = redirectTarget + sep + 'auth_session=' + encodeURIComponent(token);
            return;
        }

        showApp(user);
    } else {
        if (wrapper) wrapper.style.display = 'none';
        if (loginOverlay) loginOverlay.style.display = 'flex';
        
        // PID aus URL Parameter prüfen (Deep Link Support)
        const params = new URLSearchParams(window.location.search);
        const pidParam = params.get("pid");
        if (pidParam) {
            console.log("PID aus URL erkannt:", pidParam);
            // Wir loggen hier noch nicht ein, da der User erst den Namen wählen muss
            // Aber wir könnten das Feld später vorbefüllen falls nötig.
        }

        // Dropdown-Hilfsfunktion
        const populateDropdown = (users) => {
            const select = document.getElementById('login-user-select');
            if (!select || !Array.isArray(users) || users.length === 0) return;
            const curVal = select.value;
            select.innerHTML = '<option value="">Bitte wählen...</option>';
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                const vName = u.firstname || '';
                const nName = u.lastname || '';
                opt.textContent = (u.type === 'admin' ? `⭐ ${vName}` : `${nName} ${vName}`).trim();
                select.appendChild(opt);
            });
            if (curVal) select.value = curVal;
        };

        // Sofort aus lokalem Cache laden (< 5 ms)
        try {
            const cachedMembers = JSON.parse(localStorage.getItem('sportschuetzen_members_cache') || '[]');
            if (Array.isArray(cachedMembers) && cachedMembers.length > 0) {
                allUsers = cachedMembers;
                populateDropdown(allUsers);
            }
        } catch(e) {}

        try {
            try {
                let r = await fetch(`${EVENTPLANER_URL}?action=getMembers&type=member`);
                if(!r.ok) throw new Error("Backend nicht erreichbar");
                const resData = await r.json();
                if (Array.isArray(resData) && resData.length > 0) {
                    allUsers = resData;
                    try { localStorage.setItem('sportschuetzen_members_cache', JSON.stringify(allUsers)); } catch(_) {}
                    populateDropdown(allUsers);
                } else {
                    throw new Error("Leeres Array vom Worker");
                }
            } catch(e) {
                console.warn("Worker Fallback -> Lade direkt aus Members100...", e);
                try {
                    const fallbackUrl = "https://script.google.com/macros/s/AKfycbyiJBjqfLWYuQeY89s2lKS4DoI6UY45uVAIImTK8vHzhTbDLyKFwcL6RYOrWatMdA8A/exec?action=getMembers&type=member";
                    let r2 = await fetch(fallbackUrl);
                    let raw2 = await r2.json();
                    if (Array.isArray(raw2)) {
                        allUsers = raw2.map(m => ({
                            id: String(m.AddressNumber || m.PersonNumber || '').padStart(6, '0'),
                            personnumber: String(m.PersonNumber || ''),
                            addressnumber: String(m.AddressNumber || '').padStart(6, '0'),
                            lizenz: String(m.AddressNumber || '').padStart(6, '0'),
                            firstname: m.FirstName || '',
                            lastname: m.LastName || '',
                            type: 'member'
                        }));
                    }
                } catch(e2) {
                    console.error("Backend nicht erreichbar:", e2);
                    allUsers = [];
                }
            }
            
            if (!Array.isArray(allUsers)) allUsers = [];
            
            // Sortieren: Admins zuerst, dann Mitglieder nach Nachname
            allUsers.sort((a, b) => {
                if (a.type !== b.type) return a.type === 'admin' ? -1 : 1;
                const nA = a.lastname || a.firstname || '';
                const nB = b.lastname || b.firstname || '';
                return nA.localeCompare(nB);
            });

            const select = document.getElementById('login-user-select');
            if (select) {
                select.innerHTML = '<option value="">Bitte wählen...</option>';
                allUsers.forEach(u => {
                    const opt = document.createElement('option');
                    opt.value = u.id;
                    const vName = u.firstname || '';
                    const nName = u.lastname || '';
                    opt.textContent = (u.type === 'admin' ? `⭐ ${vName}` : `${nName} ${vName}`).trim();
                    select.appendChild(opt);
                });
            }
        } catch (e) {
            console.error("Fehler beim Laden der Teilnehmer", e);
        }
    }
}

document.getElementById('login-btn')?.addEventListener('click', async () => {
    const userId = document.getElementById('login-user-select').value;
    const pwdInput = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    
    if (!userId || !pwdInput) {
        errorDiv.textContent = "Bitte Namen wählen und Passwort eingeben.";
        errorDiv.style.display = 'block';
        return;
    }

    document.getElementById('login-btn').textContent = "Prüfe...";
    const inputHash = await sha256(pwdInput.trim());

    try {
        // SICHERER BACKEND-LOGIN
        const resp = await fetch(`${EVENTPLANER_URL}?action=checkLogin&user=${userId}&pw=${inputHash}`);
        let result;
        try {
            result = await resp.json();
        } catch (_) {
            throw new Error("Fehler beim Lesen der Server-Antwort.");
        }

        if (result.success) {
            const nameParts = result.name.split(' ');
            const userData = {
                id: userId,
                lizenz: String(userId).padStart(6, '0'),
                vorname: nameParts[0],
                nachname: nameParts.slice(1).join(' '),
                name: result.name,
                role: result.role
            };
            localStorage.setItem('sportschuetzen_user', JSON.stringify(userData));
            syncOneSignal(userData);
            errorDiv.style.display = 'none';

            // SSO-Check: Wenn von Website weitergeleitet, Session-Ticket zurücksenden
            const urlParams = new URLSearchParams(window.location.search);
            const redirectTarget = urlParams.get('redirect') || urlParams.get('returnUrl');
            if (redirectTarget) {
                const sessionPayload = {
                    id: userData.id,
                    lizenz: userData.lizenz,
                    name: userData.name,
                    vorname: userData.vorname,
                    nachname: userData.nachname,
                    role: userData.role || 'member',
                    ts: Date.now()
                };
                const token = btoa(encodeURIComponent(JSON.stringify(sessionPayload)));
                const sep = redirectTarget.includes('?') ? '&' : '?';
                window.location.href = redirectTarget + sep + 'auth_session=' + encodeURIComponent(token);
                return;
            }

            document.getElementById('login-overlay').style.display = 'none';
            showApp(userData);
        } else {
            errorDiv.textContent = result.error || "Login fehlgeschlagen. Bitte PIN überprüfen.";
            errorDiv.style.display = 'block';
        }
    } catch (e) {
        console.error("Login Fehler:", e);
        errorDiv.textContent = (e.message && e.message !== "Failed to fetch") ? e.message : "Verbindungsfehler zum Backend. Bitte versuche es erneut.";
        errorDiv.style.display = 'block';
    } finally {
        document.getElementById('login-btn').textContent = "Einloggen";
    }
});

// --- LOGIN HILFE MODAL HANDLER ---
window.openLoginHelp = function() {
    const helpModal = document.getElementById('login-help-modal');
    if (helpModal) helpModal.style.display = 'flex';
};

window.closeLoginHelp = function() {
    const helpModal = document.getElementById('login-help-modal');
    if (helpModal) helpModal.style.display = 'none';
};

function showApp(user) {
    const wrapper = document.getElementById('app-wrapper');
    if (wrapper) wrapper.style.display = 'block';
    
    const badge = document.getElementById('user-badge');
    const nameSpan = document.getElementById('display-firstname');
    if (badge && nameSpan && user) {
        nameSpan.textContent = user.vorname;
        
        const homePage = document.getElementById('page-home');
        const isHome = homePage && homePage.classList.contains('active-page');
        badge.style.display = isHome ? 'flex' : 'none';
    }
    
    loadTermine();
    handleDeepLink();
    syncOneSignal(user);

    // Event Listener für Logout Button (sicherer als onclick)
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = null; // Entferne inline handler falls vorhanden
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.logout();
        });
    }
}

window.logout = function() {
    console.log("Logout Button geklickt");
    const confirmLogout = confirm("Möchtest du dich wirklich abmelden?");
    if (confirmLogout) {
        console.log("Logout bestätigt");
        syncOneSignal(null); // OneSignal abmelden
        localStorage.removeItem('sportschuetzen_user');
        // Veralteten Key ebenfalls löschen zur Sicherheit
        localStorage.removeItem('sportschuetzen_pid');
        location.reload();
    }
}

/**
 * Synchronisiert den aktuellen Benutzer mit OneSignal
 * @param {Object|null} user - Das Benutzerobjekt oder null für Logout
 */
function syncOneSignal(user) {
    window.OneSignalDeferred = window.OneSignalDeferred || [];
    OneSignalDeferred.push(async function(OneSignal) {
        // Auf localhost überspringen
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') return;

        try {
            if (user && user.lizenz) {
                const pid = String(user.lizenz).padStart(6, '0');
                
                // Nur einloggen wenn nicht bereits diese ID gesetzt ist
                if (OneSignal.User.externalId !== pid) {
                    await OneSignal.login(pid);
                    console.log("OneSignal: Identität synchronisiert für PID", pid);
                }

                // Namen als Tag hinzufügen, damit er im Dashboard sichtbar ist
                if (user.name) {
                    await OneSignal.User.addTag("name", user.name);
                }

                // Benachrichtigungs-Berechtigung abfragen falls noch Standard
                if (OneSignal.Notifications.permission === "default") {
                    await OneSignal.Notifications.requestPermission();
                }
            } else {
                if (OneSignal.User.externalId) {
                    await OneSignal.logout();
                    console.log("OneSignal: Identität entfernt (Logout)");
                }
            }
        } catch (err) {
            console.error("OneSignal Sync Fehler:", err);
        }
    });
}

// --- INITIALISIERUNG ---

window.addEventListener('load', () => {
    initLogin();
});

// --- RSVP API ---
window.openRSVPForm = function(eventId, asksBegleitung, asksEssen, currentCount = 1, currentEssen = 1, currentVegi = 0) {
    const heroCard = document.getElementById(`rsvp-${eventId}`);
    if (!heroCard) return;

    let html = `
        <div class="hero-card-inner">
            <h2 style="font-size:1.1rem; color: #1e293b; margin-bottom:15px;">Zusatzinfos</h2>
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
    `;

    if (asksBegleitung) {
        html += `
            <div>
                <label style="font-size:0.9rem; font-weight:bold; color:#475569;">Anzahl Personen (inkl. dir):</label>
                <input type="number" id="input-count-${eventId}" value="${currentCount}" min="1" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem;">
            </div>
        `;
    }

    if (asksEssen) {
        html += `
            <div>
                <label style="font-size:0.9rem; font-weight:bold; color:#475569;">Anzahl Menüs (Standard):</label>
                <input type="number" id="input-essen-${eventId}" value="${currentEssen}" min="0" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem;">
            </div>
            <div style="margin-top:12px;">
                <label style="font-size:0.9rem; font-weight:bold; color:#475569;">Anzahl Menüs (Vegetarisch):</label>
                <input type="number" id="input-vegi-${eventId}" value="${currentVegi}" min="0" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem;">
            </div>
        `;
    }

    html += `
            </div>
            <div class="hero-actions" style="margin-top: 20px;">
                <button class="hero-btn success" onclick="submitRSVP('${eventId}', true)">Speichern</button>
                <button class="hero-btn error" style="background:#94a3b8;" onclick="loadTermine()">Abbruch</button>
            </div>
        </div>
    `;

    heroCard.innerHTML = html;
};

// --- ABMELDE-FORMULAR (ABMELDEGRUND FAKULTATIV MIT NUDGE-DESIGN) ---
window.openAbmeldeForm = function(eventId) {
    const heroCard = document.getElementById(`rsvp-${eventId}`);
    if (!heroCard) return;

    let html = `
        <div class="hero-card-inner">
            <h2 style="font-size:1.1rem; color: #1e293b; margin-bottom:6px;">❌ Abmeldung</h2>
            <p style="font-size:0.85rem; color:#64748b; margin-bottom:12px; margin-top:0;">
                Möchtest du uns kurz den Grund mitteilen? (Optional)
            </p>

            <!-- Quick-Chips für schnelle 1-Klick Auswahl -->
            <div style="display:flex; flex-wrap:wrap; gap:6px; margin-bottom:12px; justify-content:center;">
                <button type="button" class="reason-chip" onclick="setAbmeldeGrund('${eventId}', 'Ferien / Urlaub')">🏖️ Ferien</button>
                <button type="button" class="reason-chip" onclick="setAbmeldeGrund('${eventId}', 'Beruflich verhindert')">💼 Beruflich</button>
                <button type="button" class="reason-chip" onclick="setAbmeldeGrund('${eventId}', 'Familienanlass')">👨‍👩‍👧 Familie</button>
                <button type="button" class="reason-chip" onclick="setAbmeldeGrund('${eventId}', 'Gesundheitlich')">🤒 Gesundheitlich</button>
                <button type="button" class="reason-chip" onclick="setAbmeldeGrund('${eventId}', 'Terminüberschneidung')">📅 Überschneidung</button>
            </div>

            <div style="text-align:left; margin-bottom:12px;">
                <label style="font-size:0.85rem; font-weight:bold; color:#475569;">Abmeldegrund (fakultativ):</label>
                <textarea id="input-grund-${eventId}" rows="2" placeholder="z.B. Ferien, geschäftlich unterwegs..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; font-family:inherit; resize:none;"></textarea>
            </div>

            <div class="hero-actions" style="margin-top: 10px;">
                <button class="hero-btn error" style="flex:1;" onclick="submitRSVP('${eventId}', false)">
                    Abmeldung absenden
                </button>
                <button class="hero-btn" style="background:#94a3b8; color:white;" onclick="loadTermine()">
                    Zurück
                </button>
            </div>
        </div>
    `;

    heroCard.innerHTML = html;

    // Automatischer Fokus auf das Textfeld
    setTimeout(() => {
        const input = document.getElementById(`input-grund-${eventId}`);
        if (input) input.focus();
    }, 100);
};

window.setAbmeldeGrund = function(eventId, text) {
    const input = document.getElementById(`input-grund-${eventId}`);
    if (input) {
        input.value = text;
        input.focus();
    }
};

window.submitRSVP = async function(eventId, attending) {
    const user = JSON.parse(localStorage.getItem('sportschuetzen_user'));
    if (!user) return;
    
    let count = 1;
    let essen = 0;
    let vegi = 0;
    let grund = '';
    
    if (attending) {
        const countInput = document.getElementById(`input-count-${eventId}`);
        if (countInput) count = parseInt(countInput.value) || 1;
        
        const essenInput = document.getElementById(`input-essen-${eventId}`);
        if (essenInput) essen = parseInt(essenInput.value) || 0;

        const vegiInput = document.getElementById(`input-vegi-${eventId}`);
        if (vegiInput) vegi = parseInt(vegiInput.value) || 0;
    } else {
        const grundInput = document.getElementById(`input-grund-${eventId}`);
        if (grundInput) grund = grundInput.value.trim();
    }
    
    document.getElementById(`rsvp-${eventId}`).innerHTML = `<span style="font-size:0.8rem; color:white; font-weight:bold;">Verarbeite...</span>`;

    try {
        // Sicherstellen dass Lizenz sechstellig ist
        const cleanLizenz = String(user.lizenz).padStart(6, '0');

        // 1. Supabase Master (schnell speichern)
        saveRSVPToSupabase(eventId, cleanLizenz, attending, count, essen, vegi, grund, '');

        // 2. Dual-Write zu Google Sheet (Parallelbetrieb)
        const resp = await fetch(`${EVENTPLANER_URL}?action=setRSVP&eventid=${eventId}&lizenz=${cleanLizenz}&attending=${attending}&count=${count}&essen=${essen}&vegi=${vegi}&grund=${encodeURIComponent(grund)}`);
        const result = await resp.json();
        if (!result.success) throw new Error("Serverfehler beim Speichern");
        
        loadTermine(); // Nur bei Erfolg neu laden
    } catch(e) { 
        console.error(e);
        alert("Fehler: Deine Antwort konnte nicht gespeichert werden. Bitte versuche es erneut.");
    }
};


// ============================================================
// POLL-KARTE: Auswärtsschiessen mit Mehrfach-Checkboxen & Telegram-Style Bars
// ============================================================

function renderPollCard(t, heroWrap) {
    const months = ["Jan.", "Feb.", "März", "April", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
    const days   = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

    function fmtOption(opt) {
        if (!opt.datum) return opt.label || '?';
        const d = new Date(opt.datum + 'T12:00:00');
        const weekday = days[d.getDay()];
        const dateStr = `${d.getDate()}. ${months[d.getMonth()]}`;
        const timeStr = (opt.start && opt.ende) ? ` ${opt.start} - ${opt.ende} Uhr` : (opt.start ? ` ${opt.start} Uhr` : '');
        return `${weekday} ${dateStr}${timeStr}`;
    }

    const votedIds = t.optionids ? String(t.optionids).split(',').map(s => s.trim()).filter(Boolean) : [];
    const hasVoted = votedIds.length > 0;
    const isAbsent = (t.attending === false || t.attending === 'false') && !hasVoted;
    const isEditing = !!t.isEditing;

    // Results-Modus anzeigen wenn bereits abgestimmt oder abgemeldet, und nicht im Editiermodus
    const showResults = (hasVoted || isAbsent) && !isEditing;

    const dateRange = (() => {
        if (!t.options || t.options.length === 0) return '';
        const dates = t.options.filter(o => o.datum).map(o => new Date(o.datum + 'T12:00:00'));
        if (dates.length === 0) return '';
        const minD = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxD = new Date(Math.max(...dates.map(d => d.getTime())));
        if (minD.toDateString() === maxD.toDateString()) return `${minD.getDate()}. ${months[minD.getMonth()]}`;
        return `${minD.getDate()}. ${months[minD.getMonth()]} – ${maxD.getDate()}. ${months[maxD.getMonth()]}`;
    })();

    const cardId = `rsvp-${t.id}`;
    const results = pollResultsCache[t.id] || null;
    const eventTitle = t.titel || t.title || 'Terminumfrage';
    const isOpen = openPolls.has(String(t.id));

    let cardHtml = '';

    if (showResults) {
        // --- RESULTS VIEW (Telegram & Doodle Style) ---
        const statusClass = isAbsent ? 'absent' : 'success';
        const statusText = isAbsent 
            ? '❌ Du hast für diese Termine abgesagt' 
            : `✅ Deine Auswahl ist erfasst (${votedIds.length} Termin${votedIds.length !== 1 ? 'e' : ''} ausgewählt)`;

        const counts = (results && results.counts) || {};
        const names  = (results && results.names) || {};
        const total  = (results && results.totalVoted) || 0;

        const resultsListHtml = (t.options || []).map((opt, i) => {
            const optId = String(opt.id || i);
            const label = fmtOption(opt);
            const isMyChoice = votedIds.includes(optId);
            const voteCount = counts[optId] || 0;
            const pct = total > 0 ? Math.round((voteCount / total) * 100) : 0;
            const voterList = (names[optId] || []).map(n => {
                const s = String(n).trim();
                if (/^\d+$/.test(s)) {
                    const curUser = JSON.parse(localStorage.getItem('sportschuetzen_user') || '{}');
                    if (curUser && curUser.lizenz && String(curUser.lizenz).padStart(6, '0') === s.padStart(6, '0')) {
                        return curUser.firstname || curUser.vorname || curUser.name || n;
                    }
                    const u = (allUsers || []).find(x => String(x.lizenz || x.id || '').padStart(6, '0') === s.padStart(6, '0'));
                    if (u) return u.firstname || u.vorname || u.name || n;
                }
                return n;
            }).join(', ');

            return `
            <div class="poll-result-item ${isMyChoice ? 'my-choice' : ''}">
                <div class="poll-result-header">
                    <div class="poll-result-title">
                        <span>${label}</span>
                        ${isMyChoice ? '<span class="poll-my-badge">Deine Wahl</span>' : ''}
                    </div>
                    <div class="poll-result-percent">
                        ${pct}% <small>(${voteCount} ${voteCount === 1 ? 'Stimme' : 'Stimmen'})</small>
                    </div>
                </div>
                <div class="poll-bar-track">
                    <div class="poll-bar-fill ${isMyChoice ? 'own-vote' : ''}" style="width: ${pct}%;"></div>
                </div>
                ${voterList ? `<div class="poll-voter-names">👥 ${voterList}</div>` : ''}
            </div>`;
        }).join('');

        cardHtml = `
        <div class="poll-card compact" id="${cardId}">
            <div class="compact-header" onclick="window.togglePollDetails('${t.id}')">
                <div class="compact-info">
                    <strong>${eventTitle}</strong>
                    <span>🗳️ Umfrage • 📅 ${dateRange} ${total > 0 ? `• ${total} Teilnehmer` : ''}</span>
                </div>
                <div class="hero-chip ${isAbsent ? 'error' : 'success'}" style="margin:0; padding:6px 12px; font-size:1.2rem;">
                    ${isAbsent ? '❌' : '✅'}
                </div>
            </div>
            <div class="compact-body" id="poll-body-${t.id}" style="display:${isOpen ? 'block' : 'none'}; padding:16px;">
                <div class="poll-status-banner ${statusClass}">
                    ${statusText}
                </div>
                ${buildDocButtonsHtml(t)}
                ${buildDetailsHtml(t)}

                <div class="poll-results-list" id="poll-results-list-${t.id}">
                    ${resultsListHtml}
                </div>

                <div class="poll-results-actions">
                    <button type="button" class="poll-btn-edit" onclick="window.reopenPollVote('${t.id}')">
                        ✏️ Auswahl ändern
                    </button>
                    ${!isAbsent 
                        ? `<button type="button" class="poll-btn-absagen" onclick="submitPollAbsent('${t.id}')">Absagen</button>` 
                        : `<button type="button" class="poll-btn-edit" onclick="window.reopenPollVote('${t.id}')">Doch teilnehmen</button>`
                    }
                </div>
            </div>
        </div>`;

    } else {
        // --- VOTING MODE (Neue Abstimmung oder Bearbeitungsmodus) ---
        const optionsHtml = (t.options || []).map((opt, i) => {
            const optId = String(opt.id || i);
            const label = fmtOption(opt);
            const isChecked = votedIds.includes(optId);

            return `
            <label class="poll-select-card ${isChecked ? 'selected' : ''}" for="poll-opt-${t.id}-${i}">
                <div class="poll-select-header">
                    <input type="checkbox" id="poll-opt-${t.id}-${i}" name="poll-${t.id}" value="${optId}"
                        ${isChecked ? 'checked' : ''}
                        onchange="this.closest('.poll-select-card').classList.toggle('selected', this.checked)">
                    <span class="poll-select-label">${label}</span>
                </div>
            </label>`;
        }).join('');

        cardHtml = `
        <div class="poll-card" id="${cardId}">
            <div class="poll-top-badge">🗳️ Terminumfrage</div>
            <h3 class="poll-title">${eventTitle}</h3>
            <div class="poll-meta">📅 ${dateRange}</div>
            
            <div class="poll-prompt-box">
                Welche Termine passen dir? (Mehrfachauswahl möglich)
            </div>
            ${buildDocButtonsHtml(t)}
            ${buildDetailsHtml(t)}

            <div class="poll-voting-list" id="poll-options-${t.id}">
                ${optionsHtml}
            </div>

            <div class="poll-voting-actions">
                <button type="button" class="poll-btn-submit" onclick="submitPollVote('${t.id}')">
                    ${isEditing ? 'Auswahl aktualisieren' : 'Antwort senden'}
                </button>
                ${isEditing ? `
                    <button type="button" class="poll-btn-cancel" onclick="window.cancelPollEdit('${t.id}')">
                        Abbrechen
                    </button>
                ` : ''}
                <button type="button" class="poll-btn-cant" onclick="submitPollAbsent('${t.id}')">
                    Keiner dieser Termine passt mir (Absagen)
                </button>
            </div>
        </div>`;
    }

    heroWrap.insertAdjacentHTML('beforeend', cardHtml);

    // Falls Ergebnisse noch nicht im Cache waren und wir im Results-Mode sind, asynchron nachladen
    if (showResults && !results) {
        fetchPollResultsAsync(t.id, (freshResults) => {
            pollResultsCache[t.id] = freshResults;
            const cardEl = document.getElementById(cardId);
            if (cardEl) {
                const wasOpen = document.getElementById(`poll-body-${t.id}`)?.style.display === 'block';
                const tempWrap = document.createElement('div');
                renderPollCard(t, tempWrap);
                if (tempWrap.firstElementChild) {
                    cardEl.replaceWith(tempWrap.firstElementChild);
                    if (wasOpen) {
                        const newBody = document.getElementById(`poll-body-${t.id}`);
                        if (newBody) newBody.style.display = 'block';
                    }
                }
            }
        });
    }
}

// Hilfsfunktion: Poll-Ergebnisse asynchron laden
async function fetchPollResultsAsync(eventId, callback) {
    try {
        const res = await fetch(`${EVENTPLANER_URL}?action=getPollResults&eventid=${encodeURIComponent(eventId)}`);
        if (res.ok) {
            const data = await res.json();
            if (data && !data.error) callback(data);
        }
    } catch(e) {
        console.warn('Poll-Ergebnisse konnten nicht geladen werden:', e);
    }
}

window.togglePollDetails = function(eventId) {
    const body = document.getElementById(`poll-body-${eventId}`);
    if (!body) return;
    const willOpen = (body.style.display === 'none' || !body.style.display);
    body.style.display = willOpen ? 'block' : 'none';
    if (willOpen) openPolls.add(String(eventId));
    else openPolls.delete(String(eventId));
};

window.reopenPollVote = function(eventId) {
    openPolls.add(String(eventId));
    const t = allTermine.find(x => String(x.id) === String(eventId));
    if (!t) return;
    const card = document.getElementById(`rsvp-${eventId}`);
    if (!card) return;

    const tempWrap = document.createElement('div');
    renderPollCard({ ...t, isEditing: true }, tempWrap);
    if (tempWrap.firstElementChild) {
        card.replaceWith(tempWrap.firstElementChild);
    }
};

window.cancelPollEdit = function(eventId) {
    const t = allTermine.find(x => String(x.id) === String(eventId));
    if (!t) return;
    const card = document.getElementById(`rsvp-${eventId}`);
    if (!card) return;

    const tempWrap = document.createElement('div');
    renderPollCard({ ...t, isEditing: false }, tempWrap);
    if (tempWrap.firstElementChild) {
        card.replaceWith(tempWrap.firstElementChild);
    }
};

window.submitPollVote = async function(eventId) {
    openPolls.add(String(eventId));
    const user = JSON.parse(localStorage.getItem('sportschuetzen_user'));
    if (!user) return;

    const checkboxes = document.querySelectorAll(`#rsvp-${eventId} input[type="checkbox"]:checked`);
    const selectedIds = Array.from(checkboxes).map(cb => cb.value).filter(Boolean);

    if (selectedIds.length === 0) {
        alert('Bitte wähle mindestens einen Termin aus, oder klicke auf "Keiner dieser Termine passt mir".');
        return;
    }

    const btn = document.querySelector(`#rsvp-${eventId} .poll-btn-submit`) || document.querySelector(`#rsvp-${eventId} .poll-submit-btn`);
    if (btn) { btn.textContent = 'Speichere...'; btn.disabled = true; }

    try {
        const cleanLizenz = String(user.lizenz).padStart(6, '0');
        const rawOptIds = selectedIds.join(',');
        const optionids = encodeURIComponent(rawOptIds);

        // 1. Supabase Master
        saveRSVPToSupabase(eventId, cleanLizenz, true, 1, 0, 0, '', rawOptIds);

        // 2. Dual-Write zu Google Sheet (Parallelbetrieb)
        const resp = await fetch(`${EVENTPLANER_URL}?action=setRSVP&eventid=${encodeURIComponent(eventId)}&lizenz=${cleanLizenz}&attending=true&count=1&essen=0&vegi=0&grund=&optionids=${optionids}`);
        const result = await resp.json();
        if (!result.success) throw new Error('Serverfehler');
        
        // Cache leeren für Event, damit frische Daten geladen werden
        delete pollResultsCache[eventId];
        loadTermine();
    } catch(e) {
        console.error(e);
        alert('Fehler beim Speichern. Bitte erneut versuchen.');
        if (btn) { btn.textContent = 'Antwort senden'; btn.disabled = false; }
    }
};

window.submitPollAbsent = async function(eventId) {
    openPolls.add(String(eventId));
    const user = JSON.parse(localStorage.getItem('sportschuetzen_user'));
    if (!user) return;

    const card = document.getElementById(`rsvp-${eventId}`);
    if (card) card.innerHTML = '<span style="font-size:0.85rem; color:#64748b; padding:10px; display:block; text-align:center;">Speichere...</span>';

    try {
        const cleanLizenz = String(user.lizenz).padStart(6, '0');

        // 1. Supabase Master
        saveRSVPToSupabase(eventId, cleanLizenz, false, 1, 0, 0, 'Kein Termin passt', '');

        // 2. Dual-Write zu Google Sheet (Parallelbetrieb)
        const resp = await fetch(`${EVENTPLANER_URL}?action=setRSVP&eventid=${encodeURIComponent(eventId)}&lizenz=${cleanLizenz}&attending=false&count=1&essen=0&vegi=0&grund=Kein+Termin+passt&optionids=`);
        const result = await resp.json();
        if (!result.success) throw new Error('Serverfehler');

        delete pollResultsCache[eventId];
        loadTermine();
    } catch(e) {
        console.error(e);
        alert('Fehler beim Speichern.');
    }
};

window.showParticipants = async function(eventId) {
    const modal = document.getElementById('participant-modal');
    const list = document.getElementById('participant-list');
    
    const renderList = (data) => {
        list.innerHTML = (Array.isArray(data) && data.length > 0)
            ? data.map(n => {
                const name = (n.vorname || n.nachname)
                    ? `${n.nachname || ''} ${n.vorname || ''}`.trim()
                    : (n.name || `Lizenz ${n.lizenz || '?'}`);
                return `<li><span>${name}</span> <span class="status-yes">✅</span></li>`;
              }).join('') 
            : '<li>Noch keine Anmeldungen.</li>';
    };

    // 1. SOFORT AUS CACHE ANZEIGEN (0 ms)
    if (participantsCache[eventId]) {
        renderList(participantsCache[eventId]);
        modal.style.display = 'flex';
        // Revalidate im Hintergrund
        fetch(`${EVENTPLANER_URL}?action=getParticipants&eventid=${encodeURIComponent(eventId)}`)
            .then(r => r.ok ? r.json() : null)
            .then(fresh => {
                if (Array.isArray(fresh)) {
                    participantsCache[eventId] = fresh;
                    renderList(fresh);
                }
            })
            .catch(() => {});
        return;
    }

    list.innerHTML = '<li>Lade Teilnehmer...</li>';
    modal.style.display = 'flex';
    
    try {
        const res = await fetch(`${EVENTPLANER_URL}?action=getParticipants&eventid=${encodeURIComponent(eventId)}`);
        if(res.ok) {
            const data = await res.json();
            participantsCache[eventId] = data;
            renderList(data);
        } else throw new Error();
    } catch(e) { list.innerHTML = '<li style="color:red;">Fehler beim Laden.</li>'; }
};

window.closeParticipantsModal = function() {
    document.getElementById('participant-modal').style.display = 'none';
};

// --- TRACKING ---

/**
 * Protokolliert im Backend, dass ein User eine bestimmte RSVP-Karte gesehen hat.
 */
async function trackRSVPView(eventId, lizenz) {
    if (!eventId || !lizenz) return;

    const trackKey = `viewed_${eventId}_${lizenz}`;
    if (localStorage.getItem(trackKey)) return;

    try {
        // 1. Supabase Track (asynchron)
        fetch(`${SUPABASE_REST_URL}/poll_views`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                event_id: String(eventId),
                lizenz: String(lizenz),
                info: 'Gesehen (App)'
            })
        }).catch(() => {});

        // 2. Google Script Track (Dual-Write)
        await fetch(`${EVENTPLANER_URL}?action=trackView&eventid=${encodeURIComponent(eventId)}&lizenz=${encodeURIComponent(lizenz)}`);
        localStorage.setItem(trackKey, "true");
        console.log("View tracked for event:", eventId);
    } catch (e) {
        // Silent fail, damit die App bei Tracking-Fehlern nicht abstürzt
    }
}
