// ==============================================================================
// SPORTSCHÜTZEN MUHEN - MITGLIEDER APP (PWA)
// Supabase-First Architektur (Phase 18) - Reiner Supabase REST Datenzugriff
// ==============================================================================

const SUPABASE_REST_URL = "https://supabase-muhen.danfamily.uk/rest/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

function getSupabaseHeaders() {
    return {
        'apikey': SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
    };
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function parseQuestionsSchema(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) return parsed;
        } catch(e) {}
    }
    return [];
}

/**
 * 1. Termine direkt aus Supabase (public.termine)
 */
async function fetchTermineFromSupabase() {
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/termine?select=*&status=neq.abgesagt&order=datum.asc,sort_order.asc`, {
            headers: getSupabaseHeaders()
        });
        if (!res.ok) return [];
        const data = await res.json();
        if (!Array.isArray(data)) return [];

        return data.map(r => ({
            id: r.id,
            datum: r.datum || '',
            datum_iso: r.datum || '',
            start: r.startzeit || '',
            startzeit: r.startzeit || '',
            endzeit: r.endzeit || '',
            titel: r.anlasstitel || '',
            anlasstitel: r.anlasstitel || '',
            ort: r.ort || 'Muhen',
            map: r.austragungsorte_map || '',
            status: r.status || 'fix',
            kategorie: r.kategorie || 'Jahresprogramm',
            typ: r.typ || 'verein'
        }));
    } catch (e) {
        console.error('Fehler beim Laden der Termine aus Supabase:', e);
        return [];
    }
}

/**
 * 2. Hausbelegung / Vermietungen direkt aus Supabase (public.rental_requests)
 */
async function fetchHausbelegungFromSupabase() {
    const list = [];
    // 1. Google Kalender Belegungen
    try {
        const gRes = await fetch("https://github-dropdown-refresh.dan-hunziker73.workers.dev?action=getHausKalender");
        if (gRes.ok) {
            const gData = await gRes.json();
            if (Array.isArray(gData)) {
                gData.forEach(r => {
                    list.push({
                        id: 'cal_' + (r.datum_iso || r.datum || '') + '_' + Math.random().toString(36).substr(2, 6),
                        datum: r.datum_iso || r.datum || '',
                        datum_iso: r.datum_iso || r.datum || '',
                        start: r.start || '',
                        ende: r.ende || '',
                        titel: r.titel || 'Schützenhaus Belegung',
                        ort: r.ort || 'Schützenhaus',
                        status: r.status || 'fix',
                        typ: 'extern'
                    });
                });
            }
        }
    } catch(e) {
        console.warn('Google Hauskalender konnte nicht geladen werden:', e);
    }

    // 2. Supabase rental_requests
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/rental_requests?select=booking_number,start_date,end_date,festbeginn,status,is_inquiry&status=neq.cancelled&order=start_date.asc`, {
            headers: getSupabaseHeaders()
        });
        if (res.ok) {
            const data = await res.json();
            if (Array.isArray(data)) {
                data.forEach(r => {
                    const exists = list.some(x => x.datum === r.start_date);
                    if (!exists) {
                        list.push({
                            id: r.booking_number,
                            datum: r.start_date || '',
                            datum_iso: r.start_date || '',
                            start: r.festbeginn || '',
                            titel: r.is_inquiry ? 'Schützenhaus (Anfrage)' : 'Schützenhaus Vermietung',
                            ort: 'Schützenhaus',
                            status: 'fix',
                            typ: 'extern'
                        });
                    }
                });
            }
        }
    } catch (e) {
        console.error('Fehler beim Laden der Hausbelegung aus Supabase:', e);
    }

    return list;
}

/**
 * 3. RSVP-Anlässe direkt aus Supabase (public.poll_events & public.poll_responses)
 */
async function fetchRSVPEventsFromSupabase(lizenz) {
    if (!lizenz) return [];
    const cleanLizenz = String(lizenz).trim();
    const headers = getSupabaseHeaders();

    try {
        const [resEvents, resResponses] = await Promise.all([
            fetch(`${SUPABASE_REST_URL}/poll_events?select=*&aktiv=eq.true&order=datum.asc`, { headers }),
            fetch(`${SUPABASE_REST_URL}/poll_responses?select=*&lizenz=eq.${encodeURIComponent(cleanLizenz)}`, { headers })
        ]);

        if (!resEvents.ok) return [];
        const events = await resEvents.json();
        if (!Array.isArray(events) || events.length === 0) return [];
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
                questions_schema: parseQuestionsSchema(e.questions_schema),
                answers: (uResp && uResp.answers && typeof uResp.answers === 'object') ? uResp.answers : {},
                event_type: e.event_type || 'standard',
                attending: uResp ? uResp.attending : null,
                optionids: uResp ? (uResp.optionids || '') : '',
                count: uResp ? (parseInt(uResp.count) || 1) : 1,
                essen: uResp ? (parseInt(uResp.essen) || 0) : 0,
                vegi: uResp ? (parseInt(uResp.vegi) || 0) : 0,
                grund: uResp ? (uResp.grund || '') : ''
            };
        });
    } catch (err) {
        console.error('Fehler beim Laden von RSVPs aus Supabase:', err);
        return [];
    }
}

/**
 * 4. RSVP Antwort speichern (public.poll_responses)
 */
async function saveRSVPToSupabase(eventId, cleanLizenz, attending, count, essen, vegi, grund, optionids, answers = {}) {
    const headers = {
        ...getSupabaseHeaders(),
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
        optionids: String(optionids || '').trim(),
        answers: (answers && typeof answers === 'object') ? answers : {}
    };
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/poll_responses?on_conflict=event_id,lizenz`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body)
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error('Supabase saveRSVP Error:', res.status, errText);
        }
        return res.ok;
    } catch(e) {
        console.error('saveRSVPToSupabase Exception:', e);
        return false;
    }
}

/**
 * 5. Umfrage-Ergebnisse direkt aus Supabase aggregieren (public.poll_responses)
 */
async function fetchPollResultsFromSupabase(eventId) {
    const headers = getSupabaseHeaders();
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/poll_responses?event_id=eq.${encodeURIComponent(eventId)}&select=lizenz,attending,optionids`, { headers });
        if (!res.ok) return null;
        const responses = await res.json();
        if (!Array.isArray(responses)) return null;

        const counts = {};
        const names = {};
        let totalVoted = 0;

        responses.forEach(r => {
            if (r.attending && r.optionids) {
                totalVoted++;
                const optIds = String(r.optionids).split(',').map(s => s.trim()).filter(Boolean);
                optIds.forEach(oid => {
                    counts[oid] = (counts[oid] || 0) + 1;
                    if (!names[oid]) names[oid] = [];
                    names[oid].push(r.lizenz);
                });
            } else if (r.attending === false) {
                totalVoted++;
            }
        });

        return { counts, names, totalVoted };
    } catch (e) {
        return null;
    }
}

/**
 * 6. Teilnehmerliste direkt aus Supabase laden (public.poll_responses)
 */
async function fetchParticipantsFromSupabase(eventId) {
    const headers = getSupabaseHeaders();
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/poll_responses?event_id=eq.${encodeURIComponent(eventId)}&attending=eq.true&select=lizenz,count,essen,vegi,grund`, { headers });
        if (!res.ok) return [];
        const responses = await res.json();
        if (!Array.isArray(responses)) return [];

        return responses.map(r => {
            const rawLiz = String(r.lizenz || '').trim();
            const paddedLiz = rawLiz.padStart(6, '0');
            const member = (allUsers || []).find(u => String(u.lizenz || u.id || '').padStart(6, '0') === paddedLiz);
            const name = member ? `${member.lastname || ''} ${member.firstname || ''}`.trim() : `Lizenz ${paddedLiz}`;
            return {
                lizenz: paddedLiz,
                name: name || `Lizenz ${paddedLiz}`,
                count: r.count || 1,
                essen: r.essen || 0,
                vegi: r.vegi || 0,
                grund: r.grund || ''
            };
        });
    } catch (e) {
        return [];
    }
}

/**
 * 7. Mitglieder direkt aus Supabase laden (public.members)
 */
async function loadMembersFromSupabase() {
    const headers = getSupabaseHeaders();
    try {
        const res = await fetch(`${SUPABASE_REST_URL}/members?select=person_number,address_number,first_name,last_name,is_active&is_active=eq.true&order=last_name.asc`, { headers });
        if (!res.ok) {
            console.error("Fehler beim Abruf von public.members:", res.status, res.statusText);
            return [];
        }
        const data = await res.json();
        if (!Array.isArray(data)) return [];
        return data.map(m => {
            const rawNum = m.address_number || m.person_number || '';
            const padId = rawNum ? String(rawNum).padStart(6, '0') : '';
            const fName = m.first_name || '';
            const lName = m.last_name || '';
            return {
                id: padId,
                person_number: m.person_number,
                personnumber: String(m.person_number || ''),
                address_number: m.address_number,
                addressnumber: padId,
                lizenz: padId,
                first_name: fName,
                firstname: fName,
                last_name: lName,
                lastname: lName,
                name: `${fName} ${lName}`.trim(),
                type: 'member'
            };
        });
    } catch (e) {
        console.error("Exception in loadMembersFromSupabase:", e);
        return [];
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
    fetchParticipantsFromSupabase(eventId)
        .then(data => {
            if (Array.isArray(data) && data.length > 0) {
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
        if (uploadIFrame && uploadIFrame.contentWindow) {
            uploadIFrame.contentWindow.location.reload();
        }
    } else {
        const targetIframe = targetPage ? targetPage.querySelector('iframe') : null;
        if (targetIframe && targetIframe.contentWindow) {
            targetIframe.contentWindow.postMessage({ type: 'app:resume', source: 'nav' }, '*');
        }
    }

    // --- NEU: User Badge & Vorstands-Badge nur auf Home ---
    const badge = document.getElementById('user-badge');
    const vorstandBadge = document.getElementById('vorstand-badge-link');
    const userDropdown = document.getElementById('app-user-dropdown');
    if (userDropdown) userDropdown.style.display = 'none';
    if (badge && localStorage.getItem('sportschuetzen_user')) {
        badge.style.display = (id === 'page-home') ? 'flex' : 'none';
        if (vorstandBadge) {
            try {
                const u = JSON.parse(localStorage.getItem('sportschuetzen_user') || '{}');
                vorstandBadge.style.display = (id === 'page-home' && u.is_board) ? 'block' : 'none';
            } catch (_) {}
        }
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

        const [resTermine, resHaus, supaRSVP] = await Promise.all([
            fetchTermineFromSupabase(),
            fetchHausbelegungFromSupabase(),
            fetchRSVPEventsFromSupabase(activeLizenz)
        ]);

        const resRSVP = supaRSVP || [];

        // Titel-Normalisierung sofort sicherstellen (verhindert 'undefined')
        resRSVP.forEach(t => {
            if (!t.titel && t.title) t.titel = t.title;
        });

        // Poll-Ergebnisse direkt aus Supabase im Hintergrund vorladen
        const pollEvents = resRSVP.filter(t => t.options && t.options.length > 0);
        if (pollEvents.length > 0) {
            pollEvents.forEach(pe => {
                fetchPollResultsFromSupabase(pe.id).then(data => {
                    if (data) {
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
                }).catch(() => {});
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
        (resTermine || []).forEach(t => {
            merged.push({ ...t, typ: 'verein' });
        });

        // Hauskalender hinzufügen, ausser derselbe Termin existiert bereits im Vereinsprogramm
        (resHaus || []).forEach(ext => {
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
                existing.questions_schema = parseQuestionsSchema(r.questions_schema);
                existing.answers = (r.answers && typeof r.answers === 'object') ? r.answers : {};
                existing.event_type = r.event_type || 'standard';
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
                    frage_grund: r.frage_grund,
                    questions_schema: parseQuestionsSchema(r.questions_schema),
                    answers: (r.answers && typeof r.answers === 'object') ? r.answers : {},
                    event_type: r.event_type || 'standard',
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
        checkUserPendenzenBadge();

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

function buildPollQuestionsHtml(t) {
    const questions = Array.isArray(t.questions_schema) ? t.questions_schema : [];
    if (questions.length === 0) return '';
    const prevAnswers = (t.answers && typeof t.answers === 'object') ? t.answers : {};
    let html = `
        <div class="poll-extra-questions" style="margin-top: 15px; padding-top: 15px; border-top: 1px dashed #cbd5e1; text-align: left; display: flex; flex-direction: column; gap: 12px;">
            <div style="font-weight: 700; font-size: 0.92rem; color: #334155;">📝 Zusatzfragen:</div>
    `;
    questions.forEach(q => {
        const rawVal = prevAnswers[q.id];
        const qReq = q.required ? '<span style="color:#e11d48;">*</span>' : '';
        if (q.type === 'text') {
            const val = rawVal !== undefined ? String(rawVal) : '';
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                    <input type="text" id="poll-q-input-${t.id}-${q.id}" value="${escapeHtml(val)}" placeholder="Deine Antwort..." style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; box-sizing:border-box;">
                </div>
            `;
        } else if (q.type === 'textarea') {
            const val = rawVal !== undefined ? String(rawVal) : '';
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                    <textarea id="poll-q-input-${t.id}-${q.id}" rows="2" placeholder="Deine Antwort..." style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; font-family:inherit; box-sizing:border-box;">${escapeHtml(val)}</textarea>
                </div>
            `;
        } else if (q.type === 'number') {
            const val = (rawVal !== undefined && rawVal !== null && rawVal !== '') ? String(rawVal) : '';
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                    <input type="number" id="poll-q-input-${t.id}-${q.id}" value="${escapeHtml(val)}" min="0" max="999" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; box-sizing:border-box;">
                </div>
            `;
        } else if (q.type === 'boolean') {
            const isJa = String(rawVal).toLowerCase() === 'ja' || rawVal === true;
            const isNein = String(rawVal).toLowerCase() === 'nein' || rawVal === false;
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                    <select id="poll-q-input-${t.id}-${q.id}" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; box-sizing:border-box; background:white;">
                        <option value="">-- Bitte wählen --</option>
                        <option value="ja" ${isJa ? 'selected' : ''}>Ja</option>
                        <option value="nein" ${isNein ? 'selected' : ''}>Nein</option>
                    </select>
                </div>
            `;
        } else if (q.type === 'select') {
            const opts = Array.isArray(q.options) ? q.options : (String(q.options || '').split(',').map(s => s.trim()).filter(Boolean));
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                    <select id="poll-q-input-${t.id}-${q.id}" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; box-sizing:border-box; background:white;">
                        <option value="">-- Bitte wählen --</option>
                        ${opts.map(o => `<option value="${escapeHtml(o)}" ${String(rawVal) === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
                    </select>
                </div>
            `;
        } else if (q.type === 'multiselect') {
            const opts = Array.isArray(q.options) ? q.options : (String(q.options || '').split(',').map(s => s.trim()).filter(Boolean));
            const checkedArr = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569; display:block; margin-bottom:6px;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                    <div style="display:flex; flex-direction:column; gap:6px;">
                        ${opts.map(o => `
                            <label style="display:flex; align-items:center; gap:8px; font-size:0.9rem; color:#334155; cursor:pointer;">
                                <input type="checkbox" name="poll-q-cb-${t.id}-${q.id}" value="${escapeHtml(o)}" ${checkedArr.includes(o) ? 'checked' : ''} style="width:17px; height:17px; accent-color:var(--primary);">
                                <span>${escapeHtml(o)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>
            `;
        } else if (q.type === 'date') {
            const val = rawVal !== undefined ? String(rawVal) : '';
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569;">${escapeHtml(q.title || 'Datum')} ${qReq}</label>
                    <input type="date" id="poll-q-input-${t.id}-${q.id}" value="${escapeHtml(val)}" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; box-sizing:border-box;">
                </div>
            `;
        } else if (q.type === 'time') {
            const val = rawVal !== undefined ? String(rawVal) : '';
            html += `
                <div>
                    <label style="font-size:0.88rem; font-weight:600; color:#475569;">${escapeHtml(q.title || 'Uhrzeit')} ${qReq}</label>
                    <input type="time" id="poll-q-input-${t.id}-${q.id}" value="${escapeHtml(val)}" style="width:100%; padding:9px 12px; border-radius:8px; border:1px solid #cbd5e1; margin-top:4px; font-size:0.95rem; box-sizing:border-box;">
                </div>
            `;
        }
    });
    html += `</div>`;
    return html;
}

function buildPollAnswersSummaryHtml(t) {
    const questions = Array.isArray(t.questions_schema) ? t.questions_schema : [];
    if (questions.length === 0 || !t.answers || typeof t.answers !== 'object') return '';
    const parts = [];
    questions.forEach(q => {
        const ans = t.answers[q.id];
        if (ans !== undefined && ans !== null && ans !== '') {
            let ansTxt = '';
            if (Array.isArray(ans)) ansTxt = ans.join(', ');
            else if (typeof ans === 'boolean') ansTxt = ans ? 'Ja' : 'Nein';
            else ansTxt = String(ans);
            if (ansTxt.trim()) {
                parts.push(`${escapeHtml(q.title || 'Frage')}: <strong>${escapeHtml(ansTxt)}</strong>`);
            }
        }
    });
    if (parts.length === 0) return '';
    return `
        <div style="margin: 10px 0; padding: 10px 14px; background: rgba(14, 165, 233, 0.08); border: 1px solid rgba(14, 165, 233, 0.25); border-radius: 8px; font-size: 0.88rem; color: #0369a1; display: flex; flex-direction: column; gap: 4px; text-align: left;">
            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85;">Deine Zusatzangaben:</span>
            ${parts.map(p => `<div>• ${p}</div>`).join('')}
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
            const hasDynamicQuestions = Array.isArray(t.questions_schema) && t.questions_schema.length > 0;
            if (t.frage_begleitung || t.frage_essen || hasDynamicQuestions) {
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
                let summaryBox = '';
                const parts = [];
                if (t.frage_begleitung && t.count && Number(t.count) > 1) {
                    parts.push(`👥 <strong>${t.count}</strong> Personen angemeldet`);
                }
                if (t.frage_essen) {
                    const eCount = Number(t.essen) || 0;
                    const vCount = Number(t.vegi) || 0;
                    if (eCount > 0 || vCount > 0) {
                        const foodArr = [];
                        if (eCount > 0) foodArr.push(`${eCount}x Standard`);
                        if (vCount > 0) foodArr.push(`${vCount}x Vegi`);
                        parts.push(`🍽️ Menü: <strong>${foodArr.join(', ')}</strong>`);
                    }
                }
                if (hasDynamicQuestions && t.answers && typeof t.answers === 'object') {
                    t.questions_schema.forEach(q => {
                        const ans = t.answers[q.id];
                        if (ans !== undefined && ans !== null && ans !== '') {
                            let ansTxt = '';
                            if (Array.isArray(ans)) ansTxt = ans.join(', ');
                            else if (typeof ans === 'boolean') ansTxt = ans ? 'Ja' : 'Nein';
                            else ansTxt = String(ans);
                            if (ansTxt.trim()) {
                                parts.push(`${escapeHtml(q.title || 'Frage')}: <strong>${escapeHtml(ansTxt)}</strong>`);
                            }
                        }
                    });
                }
                if (parts.length > 0) {
                    summaryBox = `
                        <div style="margin: 8px 0 12px 0; padding: 10px 14px; background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.25); border-radius: 8px; font-size: 0.88rem; color: #065f46; display: flex; flex-direction: column; gap: 4px; text-align: left; width: 100%; box-sizing: border-box;">
                            <span style="font-weight: 700; font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85; margin-bottom: 2px;">Deine Rückmeldung:</span>
                            ${parts.map(p => `<div>• ${p}</div>`).join('')}
                        </div>
                    `;
                }

                bodyContent = `<div class="hero-chip success" style="margin-bottom:0; align-self:center;">✅ Angemeldet</div>`;
                bodyContent += summaryBox;
                if (t.dokument_url) bodyContent += docButton;
                if (t.details) bodyContent += detailsBlock;
                if (t.frage_begleitung || t.frage_essen || hasDynamicQuestions) {
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


// ==============================================================================
//  LOGIN & SSO AUTHENTIFIZIERUNG (Supabase Single Source of Truth)
// ==============================================================================
let allUsers = [];
let supaClientApp = null;
window._ssoPendingEmail = null;
window._ssoResolvedData = null;

const SUPABASE_APP_URL = "https://supabase-muhen.danfamily.uk";

function getAppSupabase() {
    if (!supaClientApp && typeof window.supabase !== 'undefined' && typeof window.supabase.createClient === 'function') {
        try {
            supaClientApp = window.supabase.createClient(SUPABASE_APP_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true
                }
            });
        } catch (err) {
            console.error("Fehler beim Erstellen des App-Supabase-Clients:", err);
        }
    }
    return supaClientApp;
}

// ==============================================================================
//  LOGIN UI HELPER & STATE
// ==============================================================================

window.togglePasswordVisibility = function(inputId, iconId) {
    const inp = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!inp) return;
    if (inp.type === 'password') {
        inp.type = 'text';
        if (icon) icon.textContent = '🙈';
    } else {
        inp.type = 'password';
        if (icon) icon.textContent = '👁️';
    }
};

window.showMainLogin = function() {
    const mainStep = document.getElementById('login-step-main');
    const ssoStep = document.getElementById('sso-step-input');
    const verifyStep = document.getElementById('sso-step-verify');
    const errDiv = document.getElementById('login-error');
    const infoDiv = document.getElementById('login-info');
    if (mainStep) mainStep.style.display = 'block';
    if (ssoStep) ssoStep.style.display = 'none';
    if (verifyStep) verifyStep.style.display = 'none';
    if (errDiv) errDiv.style.display = 'none';
    if (infoDiv) infoDiv.style.display = 'none';
};

window.openForgotPinOrOtp = async function() {
    const mainStep = document.getElementById('login-step-main');
    const ssoStep = document.getElementById('sso-step-input');
    const verifyStep = document.getElementById('sso-step-verify');
    const directInput = document.getElementById('login-direct-identifier');
    const mailInput = document.getElementById('sso-mail-identifier');
    const previewDiv = document.getElementById('sso-resolved-preview');
    const errDiv = document.getElementById('sso-mail-error');

    if (mainStep) mainStep.style.display = 'none';
    if (verifyStep) verifyStep.style.display = 'none';
    if (ssoStep) ssoStep.style.display = 'block';
    if (errDiv) errDiv.style.display = 'none';

    const currentVal = (directInput?.value || '').trim();
    if (mailInput) mailInput.value = currentVal;

    if (currentVal) {
        try {
            const idRes = await fetch(`${SUPABASE_REST_URL}/rpc/resolve_login_identifier`, {
                method: 'POST',
                headers: { ...getSupabaseHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ p_identifier: currentVal })
            });
            if (idRes.ok) {
                const idData = await idRes.json();
                if (idData && idData.success && idData.email) {
                    const masked = maskEmail(idData.email);
                    if (previewDiv) {
                        previewDiv.innerHTML = `💡 Wir haben für <b>${escapeHtml(idData.name || currentVal)}</b> die Adresse <b>${escapeHtml(masked)}</b> hinterlegt. Klicke auf «Anmeldecode senden», um den Code zu erhalten.`;
                        previewDiv.style.display = 'block';
                    }
                    return;
                }
            }
        } catch (_) {}
    }

    if (previewDiv) previewDiv.style.display = 'none';
    if (mailInput && !currentVal) mailInput.focus();
};

function maskEmail(email) {
    if (!email || !email.includes('@')) return email || '';
    const parts = email.split('@');
    const user = parts[0];
    const domain = parts[1];
    const visibleUser = user.length > 2 ? user.substring(0, 2) + '***' : user.substring(0, 1) + '***';
    const domParts = domain.split('.');
    const maskedDom = domParts[0].length > 2 ? domParts[0].substring(0, 2) + '***' : domParts[0].substring(0, 1) + '***';
    const tld = domParts.slice(1).join('.');
    return `${visibleUser}@${maskedDom}.${tld}`;
}

window.resetSsoForm = function() {
    showMainLogin();
    window._ssoPendingEmail = null;
    window._ssoResolvedData = null;
};

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

    // 1. Prüfen, ob bereits lokal angemeldet
    if (userStr) {
        let user = JSON.parse(userStr);
        if (user.lizenz && user.lizenz.length < 6 && !isNaN(user.lizenz)) {
            user.lizenz = user.lizenz.padStart(6, '0');
            localStorage.setItem('sportschuetzen_user', JSON.stringify(user));
        }
        syncOneSignal(user);

        // Falls Vorstandsportal angefordert wurde und Benutzer Vorstandsmitglied ist:
        if (user && user.is_board && (window.location.search.includes('portal=vorstand') || urlParams.get('portal') === 'vorstand')) {
            const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
            window.location.replace(window.location.origin + basePath + 'vorstand/index.html' + window.location.search + window.location.hash);
            return;
        }

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
        return;
    }

    // 2. Prüfen, ob eine Supabase Auth Session (z.B. durch Magic-Link) vorliegt
    const supa = getAppSupabase();
    if (supa && supa.auth) {
        try {
            const { data: sessionData, error: sessErr } = await supa.auth.getSession();
            if (!sessErr && sessionData && sessionData.session && sessionData.session.user) {
                console.log("✅ Aktive Supabase SSO-Session erkannt:", sessionData.session.user.email);
                
                let authedUser = null;
                try {
                    const { data: syncRes } = await supa.rpc('sync_member_auth_session');
                    if (syncRes && syncRes.success) {
                        authedUser = {
                            id: String(syncRes.person_number || syncRes.address_number || sessionData.session.user.id),
                            lizenz: String(syncRes.person_number || syncRes.address_number || '').padStart(6, '0'),
                            vorname: syncRes.firstname || syncRes.display_name,
                            nachname: syncRes.lastname || '',
                            name: syncRes.display_name,
                            email: syncRes.email,
                            role: syncRes.primary_role || 'member',
                            is_board: Boolean(syncRes.is_board)
                        };
                    }
                } catch (sErr) {
                    console.warn("Konnte member_auth_session nicht synchronisieren:", sErr);
                }

                if (!authedUser) {
                    const emailUser = sessionData.session.user.email;
                    const uName = emailUser.split('@')[0];
                    authedUser = {
                        id: sessionData.session.user.id,
                        lizenz: '',
                        vorname: uName,
                        nachname: '',
                        name: uName,
                        email: emailUser,
                        role: 'member'
                    };
                }

                localStorage.setItem('sportschuetzen_user', JSON.stringify(authedUser));
                localStorage.setItem('sm_member_session', JSON.stringify(authedUser));
                syncOneSignal(authedUser);

                // URL Hash sauber bereinigen
                if (window.location.hash) {
                    window.history.replaceState({}, document.title, window.location.pathname + window.location.search);
                }

                if (authedUser && authedUser.is_board && (window.location.search.includes('portal=vorstand') || urlParams.get('portal') === 'vorstand')) {
                    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
                    window.location.replace(window.location.origin + basePath + 'vorstand/index.html' + window.location.search + window.location.hash);
                    return;
                }

                if (redirectTarget) {
                    const sessionPayload = { ...authedUser, ts: Date.now() };
                    const token = btoa(encodeURIComponent(JSON.stringify(sessionPayload)));
                    const sep = redirectTarget.includes('?') ? '&' : '?';
                    window.location.href = redirectTarget + sep + 'auth_session=' + encodeURIComponent(token);
                    return;
                }

                showApp(authedUser);
                return;
            }
        } catch (authEx) {
            console.warn("Supabase Auth Auto-Restore Hinweis:", authEx);
        }
    }

    // 3. Wenn nicht eingeloggt: Login-Maske anzeigen
    if (wrapper) wrapper.style.display = 'none';
    if (loginOverlay) loginOverlay.style.display = 'flex';
    showMainLogin();

    // Mitglieder im Hintergrund laden (für spätere App-Funktionen)
    try {
        const cachedMembers = JSON.parse(localStorage.getItem('sportschuetzen_members_cache') || '[]');
        if (Array.isArray(cachedMembers) && cachedMembers.length > 0) {
            allUsers = cachedMembers;
        }
    } catch (_) {}

    loadMembersFromSupabase().then(members => {
        if (Array.isArray(members) && members.length > 0) {
            allUsers = members;
            try { localStorage.setItem('sportschuetzen_members_cache', JSON.stringify(allUsers)); } catch(_) {}
        }
    }).catch(err => console.warn("Mitglieder-Cache Ladehinweis:", err));
}

// --- DIREKT-ANMELDUNG (Name + PIN / Passwort) ---
window.doMemberLogin = async function() {
    const directInput = document.getElementById('login-direct-identifier');
    const pwdInput = document.getElementById('login-password');
    const errorDiv = document.getElementById('login-error');
    const btn = document.getElementById('login-btn');

    const identifier = (directInput?.value || '').trim();
    const pin = (pwdInput?.value || '').trim();

    if (!identifier || !pin) {
        if (errorDiv) {
            errorDiv.textContent = "Bitte deinen Namen und PIN/Passwort eingeben.";
            errorDiv.style.display = 'block';
        }
        return;
    }

    if (errorDiv) errorDiv.style.display = 'none';
    if (btn) {
        btn.disabled = true;
        btn.textContent = "Prüfe Anmeldung...";
    }

    try {
        let authenticatedUser = null;

        // 1. Serverseitige Verifikation via RPC verify_member_pin
        try {
            const res = await fetch(`${SUPABASE_REST_URL}/rpc/verify_member_pin`, {
                method: 'POST',
                headers: { ...getSupabaseHeaders(), 'Content-Type': 'application/json' },
                body: JSON.stringify({ p_identifier: identifier, p_pin: pin })
            });

            if (res.ok) {
                const data = await res.json();
                if (data && data.success && data.user) {
                    authenticatedUser = data.user;
                } else if (data && data.is_admin && data.email) {
                    // Vorstandskonto erkannt -> Passwort-Login via Supabase GoTrue Auth
                    const supa = getAppSupabase();
                    if (supa && supa.auth) {
                        const { data: authData, error: authErr } = await supa.auth.signInWithPassword({
                            email: data.email,
                            password: pin
                        });

                        if (!authErr && authData && authData.user) {
                            const nameParts = (data.name || 'Vorstand').split(' ');
                            authenticatedUser = {
                                id: String(data.person_number || authData.user.id).padStart(6, '0'),
                                lizenz: String(data.person_number || '').padStart(6, '0'),
                                vorname: nameParts[0] || 'Vorstand',
                                nachname: nameParts.slice(1).join(' ') || '',
                                name: data.name || 'Vorstand',
                                email: data.email,
                                role: data.role || 'vorstand',
                                is_board: true
                            };
                        } else {
                            throw new Error("Passwort ungültig. Bitte überprüfe dein Passwort.");
                        }
                    }
                } else if (data && data.error) {
                    throw new Error(data.error);
                }
            }
        } catch (rpcErr) {
            console.warn("RPC verify_member_pin Hinweis:", rpcErr);
            if (rpcErr.message && !rpcErr.message.includes('fetch')) {
                throw rpcErr;
            }
        }

        // 2. Lokaler Fallback (falls RPC offline oder Verbindung getrennt)
        if (!authenticatedUser) {
            const cleanId = identifier.toLowerCase();
            const cleanPin = pin;
            const match = (Array.isArray(allUsers) ? allUsers : []).find(u => {
                const pn = String(u.person_number || '');
                const an = String(u.address_number || u.id || '');
                const uName = (u.name || '').toLowerCase();
                const fn1 = `${u.firstname || ''} ${u.lastname || ''}`.trim().toLowerCase();
                const fn2 = `${u.lastname || ''} ${u.firstname || ''}`.trim().toLowerCase();
                return pn === cleanId || an === cleanId || an.padStart(6, '0') === cleanId.padStart(6, '0') ||
                       uName === cleanId || fn1 === cleanId || fn2 === cleanId;
            });

            if (match) {
                const expPin = String(match.address_number || match.id || '').trim();
                if (cleanPin === expPin || cleanPin.padStart(6, '0') === expPin.padStart(6, '0') || cleanPin === String(match.person_number)) {
                    authenticatedUser = {
                        id: String(match.address_number || match.person_number || match.id).padStart(6, '0'),
                        lizenz: String(match.address_number || match.person_number || match.id).padStart(6, '0'),
                        vorname: match.first_name || match.firstname || '',
                        nachname: match.last_name || match.lastname || '',
                        name: match.name || `${match.first_name || match.firstname || ''} ${match.last_name || match.lastname || ''}`.trim(),
                        email: match.primary_email || match.email || '',
                        role: 'member'
                    };
                }
            }
        }

        if (authenticatedUser) {
            finishSuccessfulLogin(authenticatedUser, 'pin');
        } else {
            throw new Error("Name oder PIN/Passwort ungültig. Bitte überprüfe deine Eingabe oder nutze «PIN vergessen? Code per Mail».");
        }

    } catch (e) {
        console.error("Login Fehler:", e);
        if (errorDiv) {
            errorDiv.textContent = e.message || "Anmeldung fehlgeschlagen. Bitte überprüfe deine Zugangsdaten.";
            errorDiv.style.display = 'block';
        }
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = "🔐 Anmelden";
        }
    }
};

// --- SSO SCHRITT 2: Anmeldecode per Mail anfordern ---
window.sendSsoOtpCode = async function() {
    const mailInput = document.getElementById('sso-mail-identifier');
    const errDiv = document.getElementById('sso-mail-error');
    const sendBtn = document.getElementById('sso-send-btn');
    const identifier = (mailInput?.value || '').trim();

    if (!identifier) {
        if (errDiv) {
            errDiv.textContent = "Bitte deinen Namen (Vorname Nachname) oder deine E-Mail eingeben.";
            errDiv.style.display = 'block';
        }
        return;
    }

    if (errDiv) errDiv.style.display = 'none';
    if (sendBtn) {
        sendBtn.disabled = true;
        sendBtn.textContent = "Prüfe & sende...";
    }

    try {
        const supa = getAppSupabase();
        if (!supa || !supa.auth) throw new Error("Supabase-Verbindung steht momentan nicht zur Verfügung.");

        const idRes = await fetch(`${SUPABASE_REST_URL}/rpc/resolve_login_identifier`, {
            method: 'POST',
            headers: { ...getSupabaseHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ p_identifier: identifier })
        });

        if (!idRes.ok) throw new Error("Verbindungsfehler bei der Benutzerprüfung.");

        const idData = await idRes.json();
        if (!idData || !idData.success || !idData.email) {
            throw new Error((idData && idData.error) ? idData.error : "Keine hinterlegte E-Mail-Adresse für diese Eingabe gefunden.");
        }

        const targetEmail = idData.email;
        window._ssoPendingEmail = targetEmail;
        window._ssoResolvedData = idData;

        const returnUrl = window.location.href.split('#')[0];
        const { error: otpErr } = await supa.auth.signInWithOtp({
            email: targetEmail,
            options: {
                emailRedirectTo: returnUrl,
                shouldCreateUser: true
            }
        });

        if (otpErr) throw otpErr;

        document.getElementById('sso-step-input').style.display = 'none';
        document.getElementById('sso-step-verify').style.display = 'block';
        document.getElementById('sso-sent-email').textContent = maskEmail(targetEmail);
        document.getElementById('sso-otp-code').focus();

    } catch (err) {
        console.error("SSO Sende-Fehler:", err);
        if (errDiv) {
            errDiv.textContent = err.message || "Fehler beim Versenden des Anmeldecodes.";
            errDiv.style.display = 'block';
        }
    } finally {
        if (sendBtn) {
            sendBtn.disabled = false;
            sendBtn.textContent = "✉️ Anmeldecode senden";
        }
    }
};

// --- SSO SCHRITT 3: 6-Stelligen Code verifizieren ---
window.verifySsoOtpCode = async function() {
    const codeInput = document.getElementById('sso-otp-code');
    const errorDiv = document.getElementById('sso-verify-error');
    const verifyBtn = document.getElementById('sso-verify-btn');
    const code = (codeInput?.value || '').trim();

    if (!code || code.length < 6) {
        if (errorDiv) {
            errorDiv.textContent = "Bitte den 6-stelligen Bestätigungscode aus der E-Mail eingeben.";
            errorDiv.style.display = 'block';
        }
        return;
    }

    if (errorDiv) errorDiv.style.display = 'none';
    if (verifyBtn) {
        verifyBtn.disabled = true;
        verifyBtn.textContent = "Prüfe Code...";
    }

    try {
        const supa = getAppSupabase();
        if (!supa || !supa.auth) throw new Error("Supabase Auth nicht verfügbar.");

        const { data: authData, error: authErr } = await supa.auth.verifyOtp({
            email: window._ssoPendingEmail,
            token: code,
            type: 'email'
        });

        if (authErr) throw authErr;

        let authedUser = null;
        try {
            const { data: syncRes } = await supa.rpc('sync_member_auth_session');
            if (syncRes && syncRes.success) {
                authedUser = {
                    id: String(syncRes.person_number || syncRes.address_number || authData.user.id),
                    lizenz: String(syncRes.person_number || syncRes.address_number || '').padStart(6, '0'),
                    vorname: syncRes.firstname || syncRes.display_name,
                    nachname: syncRes.lastname || '',
                    name: syncRes.display_name,
                    email: syncRes.email,
                    role: syncRes.primary_role || 'member',
                    is_board: Boolean(syncRes.is_board),
                    person_number: syncRes.person_number
                };
            }
        } catch (_) {}

        if (window._ssoResolvedData && window._ssoResolvedData.person_number) {
            const rData = window._ssoResolvedData;
            if (!authedUser || (rData.person_number && String(authedUser.person_number || authedUser.id) !== String(rData.person_number) && !authedUser.is_board)) {
                const nameParts = (rData.name || 'Mitglied').split(' ');
                authedUser = {
                    id: String(rData.person_number).padStart(6, '0'),
                    lizenz: String(rData.person_number).padStart(6, '0'),
                    vorname: nameParts[0] || 'Mitglied',
                    nachname: nameParts.slice(1).join(' ') || '',
                    name: rData.name || 'Mitglied',
                    email: window._ssoPendingEmail,
                    role: rData.type || 'member',
                    person_number: rData.person_number,
                    is_board: rData.type === 'admin'
                };
            }
        }

        if (!authedUser) {
            const rData = window._ssoResolvedData || {};
            const nameParts = (rData.name || 'Mitglied').split(' ');
            authedUser = {
                id: String(rData.person_number || authData.user.id).padStart(6, '0'),
                lizenz: String(rData.person_number || '').padStart(6, '0'),
                vorname: nameParts[0] || 'Mitglied',
                nachname: nameParts.slice(1).join(' ') || '',
                name: rData.name || 'Mitglied',
                email: window._ssoPendingEmail,
                role: rData.type || 'member',
                is_board: rData.type === 'admin'
            };
        }

        finishSuccessfulLogin(authedUser, 'sso');

    } catch (err) {
        console.error("SSO Verifikationsfehler:", err);
        if (errorDiv) {
            errorDiv.textContent = (err.message && err.message.includes('Token has expired'))
                ? "Der Code ist abgelaufen. Bitte fordere einen neuen an."
                : "Ungültiger Bestätigungscode. Bitte überprüfe den 6-stelligen Code aus der E-Mail.";
            errorDiv.style.display = 'block';
        }
    } finally {
        if (verifyBtn) {
            verifyBtn.disabled = false;
            verifyBtn.textContent = "✅ Jetzt anmelden";
        }
    }
};

function finishSuccessfulLogin(user, mode) {
    localStorage.setItem('sportschuetzen_user', JSON.stringify(user));
    localStorage.setItem('sm_member_session', JSON.stringify(user));
    syncOneSignal(user);

    // Sitzung in public.login_sessions auditieren
    try {
        fetch(`${SUPABASE_REST_URL}/login_sessions`, {
            method: 'POST',
            headers: { ...getSupabaseHeaders(), 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
            body: JSON.stringify({
                session_id: (mode || 'app') + '_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6),
                username: user.name,
                role: user.role,
                user_agent: navigator.userAgent || 'PWA'
            })
        }).catch(() => {});
    } catch (_) {}

    // SSO-Check: Wenn von Website weitergeleitet, Session-Ticket zurücksenden
    const urlParams = new URLSearchParams(window.location.search);
    const redirectTarget = urlParams.get('redirect') || urlParams.get('returnUrl');
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

    // Falls Vorstandsportal angefordert wurde und Benutzer Vorstandsmitglied ist:
    if (user && user.is_board && (window.location.search.includes('portal=vorstand') || urlParams.get('portal') === 'vorstand')) {
        const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);
        window.location.replace(window.location.origin + basePath + 'vorstand/index.html' + window.location.search + window.location.hash);
        return;
    }

    const overlay = document.getElementById('login-overlay');
    if (overlay) overlay.style.display = 'none';
    showApp(user);
}

// --- LOGIN HILFE MODAL HANDLER ---
window.openLoginHelp = function() {
    const helpModal = document.getElementById('login-help-modal');
    if (helpModal) helpModal.style.display = 'flex';
};

window.closeLoginHelp = function() {
    const helpModal = document.getElementById('login-help-modal');
    if (helpModal) helpModal.style.display = 'none';
};

function getAppUrls() {
    const loc = window.location;
    const hostname = loc.hostname;
    let root = '';

    if (hostname === 'localhost' || hostname === '127.0.0.1') {
        const path = loc.pathname;
        if (path.includes('/sportschuetzen-website/frontend/')) {
            root = loc.origin + path.replace(/\/sportschuetzen-website\/frontend\/.*$/, '/');
        } else if (path.includes('/vorstand/')) {
            root = loc.origin + path.replace(/\/vorstand\/.*$/, '/');
        } else {
            root = loc.origin + path.replace(/\/[^/]*$/, '/');
        }
    } else if (hostname.includes('pages.dev')) {
        root = loc.origin + '/';
    } else if (hostname.includes('github.io')) {
        const match = loc.pathname.match(/^(\/[^/]+\/)/);
        root = loc.origin + (match ? match[1] : '/');
    } else if (hostname.includes('sportschuetzen-muhen.ch')) {
        root = 'https://sportschuetzen-muhen.ch/';
    } else {
        root = loc.origin + '/';
    }

    if (!root.endsWith('/')) root += '/';

    return {
        root: root,
        webApp: root + 'index.html',
        portal: root + 'vorstand/index.html',
        website: root + 'sportschuetzen-website/frontend/index.html',
        intern: root + 'sportschuetzen-website/frontend/intern.html'
    };
}
window.getAppUrls = getAppUrls;

function showApp(user) {
    const wrapper = document.getElementById('app-wrapper');
    if (wrapper) wrapper.style.display = 'block';
    
    const badge = document.getElementById('user-badge');
    const nameSpan = document.getElementById('display-firstname');
    const vorstandBadge = document.getElementById('vorstand-badge-link');
    const userDropdown = document.getElementById('app-user-dropdown');
    const dropdownFullName = document.getElementById('dropdown-user-fullname');
    const dropdownVorstandLink = document.getElementById('dropdown-link-vorstand');
    const dropdownWebsiteLink = document.getElementById('dropdown-link-website');
    const dropdownInternLink = document.getElementById('dropdown-link-intern');
    const homeWebsiteLink = document.getElementById('home-link-website');
    const homeInternLink = document.getElementById('home-link-intern');
    const dropdownLogoutBtn = document.getElementById('dropdown-logout-btn');

    const urls = getAppUrls();

    // Dynamische URLs zuweisen
    if (vorstandBadge) vorstandBadge.href = urls.portal;
    if (dropdownVorstandLink) dropdownVorstandLink.href = urls.portal;
    if (dropdownWebsiteLink) dropdownWebsiteLink.href = urls.website;
    if (dropdownInternLink) dropdownInternLink.href = urls.intern;
    if (homeWebsiteLink) homeWebsiteLink.href = urls.website;
    if (homeInternLink) homeInternLink.href = urls.intern;

    if (badge && nameSpan && user) {
        nameSpan.textContent = user.vorname;
        if (dropdownFullName) {
            dropdownFullName.textContent = user.name || (user.vorname + ' ' + (user.nachname || '')) || 'Mitglied';
        }
        if (dropdownVorstandLink) {
            dropdownVorstandLink.style.display = user.is_board ? 'flex' : 'none';
        }
        
        const homePage = document.getElementById('page-home');
        const isHome = homePage && homePage.classList.contains('active-page');
        badge.style.display = isHome ? 'flex' : 'none';
        if (vorstandBadge) {
            vorstandBadge.style.display = (isHome && user.is_board) ? 'block' : 'none';
        }

        // Dropdown Toggle
        if (userDropdown) {
            badge.onclick = (e) => {
                e.stopPropagation();
                const isClosed = (userDropdown.style.display === 'none' || !userDropdown.style.display);
                userDropdown.style.display = isClosed ? 'block' : 'none';
            };

            if (!window._appDropdownListenerAdded) {
                window._appDropdownListenerAdded = true;
                document.addEventListener('click', (e) => {
                    if (userDropdown && !badge.contains(e.target) && !userDropdown.contains(e.target)) {
                        userDropdown.style.display = 'none';
                    }
                });
            }
        }
    }

    if (dropdownLogoutBtn) {
        dropdownLogoutBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (userDropdown) userDropdown.style.display = 'none';
            window.logout();
        };
    }
    
    loadTermine();
    handleDeepLink();
    syncOneSignal(user);
    if (user) {
        checkUserPendenzenBadge();
    }

    // Event Listener für optionalen Header-Logout Button
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = null;
        logoutBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            window.logout();
        });
    }
}

// ==============================================================================
//  PENDENZEN-BADGE & NATIVE APP-BADGING (iOS 16.4+ / ANDROID / WEB-APP)
// ==============================================================================

function updateAppIconBadge(count) {
    if ('setAppBadge' in navigator) {
        if (count > 0) {
            navigator.setAppBadge(count).catch(() => {});
        } else {
            navigator.clearAppBadge().catch(() => {});
        }
    }
}
window.updateAppIconBadge = updateAppIconBadge;

async function checkUserPendenzenBadge() {
    let user = null;
    try {
        user = JSON.parse(localStorage.getItem('sportschuetzen_user') || 'null');
    } catch (_) {}

    if (!user) {
        updateAppIconBadge(0);
        return;
    }

    const lizenz = user.lizenz ? String(user.lizenz).trim() : (user.person_number ? String(user.person_number).trim() : '');
    const isBoard = Boolean(user.is_board);

    const vorstandBadge = document.getElementById('vorstand-pendenzen-badge');
    const dropdownBadge = document.getElementById('dropdown-vorstand-badge');

    let galCount = 0;
    let rpcData = { total: 0, member_rsvps: 0, member_invoices: 0, board_ocr: 0, board_rentals: 0, board_total: 0 };

    try {
        // Parallel: 1. Supabase RPC für Pendenzen & 2. (falls Vorstand) Immich Album-Uploads
        const promises = [
            fetch(`${SUPABASE_REST_URL}/rpc/get_member_pendenzen_count`, {
                method: 'POST',
                headers: {
                    ...getSupabaseHeaders(),
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    p_lizenz: lizenz,
                    p_is_board: isBoard
                })
            }).then(r => r.ok ? r.json() : null)
        ];

        if (isBoard) {
            promises.push(
                fetch('https://supabase-muhen.danfamily.uk/functions/v1/immich-upload')
                    .then(r => r.ok ? r.json() : null)
                    .then(d => d?.album?.count || 0)
                    .catch(() => 0)
            );
        }

        const results = await Promise.allSettled(promises);
        if (results[0].status === 'fulfilled' && results[0].value) {
            rpcData = results[0].value;
        }
        if (isBoard && results[1] && results[1].status === 'fulfilled') {
            galCount = parseInt(results[1].value) || 0;
        }
    } catch (e) {
        // Stille Unterdrückung bei Netzwerkproblemen
    }

    // Für Vorstandsmitglieder: UI-Badges im Portal aktualisieren (Galerie + OCR + Mietanfragen)
    if (isBoard) {
        const boardTotal = (rpcData.board_total || 0) + galCount;
        const badgeText = boardTotal > 99 ? '99+' : String(boardTotal);
        [vorstandBadge, dropdownBadge].forEach(el => {
            if (!el) return;
            if (boardTotal > 0) {
                el.textContent = badgeText;
                el.style.display = 'inline-block';
            } else {
                el.style.display = 'none';
            }
        });
    } else {
        [vorstandBadge, dropdownBadge].forEach(el => {
            if (el) el.style.display = 'none';
        });
    }

    // Gesamter App-Badge auf dem iOS/Android Homescreen
    // Setzt sich aus allen persönlichen Pendenzen (RSVPs + Rechnungen) plus allfälligen Vorstands-Pendenzen zusammen
    const totalAppBadge = (rpcData.total || 0) + (isBoard ? galCount : 0);
    updateAppIconBadge(totalAppBadge);
}
window.checkUserPendenzenBadge = checkUserPendenzenBadge;
window.checkBoardPendenzenBadge = checkUserPendenzenBadge; // Rückwärtskompatibilität

document.addEventListener('app:resume', () => {
    checkUserPendenzenBadge();
});

window.logout = async function() {
    console.log("Logout Button geklickt");
    const confirmLogout = confirm("Möchtest du dich wirklich abmelden?");
    if (confirmLogout) {
        console.log("Logout bestätigt");
        const supa = getAppSupabase();
        if (supa && supa.auth) {
            try { await supa.auth.signOut(); } catch (_) {}
        }
        syncOneSignal(null); // OneSignal abmelden
        updateAppIconBadge(0);
        localStorage.removeItem('sportschuetzen_user');
        localStorage.removeItem('sm_member_session');
        localStorage.removeItem('sportschuetzen_pid');
        location.reload();
    }
};

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

    const curEvent = (allTermine || []).find(x => String(x.id) === String(eventId));
    const dynamicQuestions = (curEvent && Array.isArray(curEvent.questions_schema)) ? curEvent.questions_schema : [];
    const prevAnswers = (curEvent && curEvent.answers && typeof curEvent.answers === 'object') ? curEvent.answers : {};

    let html = `
        <div class="hero-card-inner">
            <h2 style="font-size:1.1rem; color: #1e293b; margin-bottom:15px;">Zusatzinfos</h2>
            <div style="display:flex; flex-direction:column; gap:12px; text-align:left;">
    `;

    if (asksBegleitung) {
        html += `
            <div>
                <label style="font-size:0.9rem; font-weight:bold; color:#475569;">Anzahl Personen (inkl. dir):</label>
                <input type="number" id="input-count-${eventId}" value="${currentCount}" min="1" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box;">
            </div>
        `;
    }

    if (asksEssen) {
        html += `
            <div>
                <label style="font-size:0.9rem; font-weight:bold; color:#475569;">Anzahl Menüs (Standard):</label>
                <input type="number" id="input-essen-${eventId}" value="${currentEssen}" min="0" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box;">
            </div>
            <div style="margin-top:12px;">
                <label style="font-size:0.9rem; font-weight:bold; color:#475569;">Anzahl Menüs (Vegetarisch):</label>
                <input type="number" id="input-vegi-${eventId}" value="${currentVegi}" min="0" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box;">
            </div>
        `;
    }

    // DYNAMISCHE FRAGEN RENDERN
    if (dynamicQuestions.length > 0) {
        dynamicQuestions.forEach(q => {
            const rawVal = prevAnswers[q.id];
            const qReq = q.required ? '<span style="color:#e11d48;">*</span>' : '';

            if (q.type === 'text') {
                const val = rawVal !== undefined ? String(rawVal) : '';
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                        <input type="text" id="q-input-${eventId}-${q.id}" value="${escapeHtml(val)}" placeholder="Deine Antwort..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box;">
                    </div>
                `;
            } else if (q.type === 'textarea') {
                const val = rawVal !== undefined ? String(rawVal) : '';
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                        <textarea id="q-input-${eventId}-${q.id}" rows="2" placeholder="Deine Antwort..." style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:0.95rem; font-family:inherit; box-sizing:border-box;">${escapeHtml(val)}</textarea>
                    </div>
                `;
            } else if (q.type === 'number') {
                const val = (rawVal !== undefined && rawVal !== null && rawVal !== '') ? String(rawVal) : '';
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                        <input type="number" id="q-input-${eventId}-${q.id}" value="${escapeHtml(val)}" min="0" max="999" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box;">
                    </div>
                `;
            } else if (q.type === 'boolean') {
                const isJa = String(rawVal).toLowerCase() === 'ja' || rawVal === true;
                const isNein = String(rawVal).toLowerCase() === 'nein' || rawVal === false;
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                        <select id="q-input-${eventId}-${q.id}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box; background:white;">
                            <option value="">-- Bitte wählen --</option>
                            <option value="ja" ${isJa ? 'selected' : ''}>Ja</option>
                            <option value="nein" ${isNein ? 'selected' : ''}>Nein</option>
                        </select>
                    </div>
                `;
            } else if (q.type === 'select') {
                const opts = Array.isArray(q.options) ? q.options : (String(q.options || '').split(',').map(s => s.trim()).filter(Boolean));
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                        <select id="q-input-${eventId}-${q.id}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box; background:white;">
                            <option value="">-- Bitte wählen --</option>
                            ${opts.map(o => `<option value="${escapeHtml(o)}" ${String(rawVal) === o ? 'selected' : ''}>${escapeHtml(o)}</option>`).join('')}
                        </select>
                    </div>
                `;
            } else if (q.type === 'multiselect') {
                const opts = Array.isArray(q.options) ? q.options : (String(q.options || '').split(',').map(s => s.trim()).filter(Boolean));
                const checkedArr = Array.isArray(rawVal) ? rawVal : (rawVal ? [rawVal] : []);
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569; display:block; margin-bottom:6px;">${escapeHtml(q.title || 'Frage')} ${qReq}</label>
                        <div style="display:flex; flex-direction:column; gap:8px;">
                            ${opts.map(o => `
                                <label style="display:flex; align-items:center; gap:8px; font-size:0.92rem; color:#334155; cursor:pointer;">
                                    <input type="checkbox" name="q-cb-${eventId}-${q.id}" value="${escapeHtml(o)}" ${checkedArr.includes(o) ? 'checked' : ''} style="width:18px; height:18px; accent-color:var(--primary);">
                                    <span>${escapeHtml(o)}</span>
                                </label>
                            `).join('')}
                        </div>
                    </div>
                `;
            } else if (q.type === 'date') {
                const val = rawVal !== undefined ? String(rawVal) : '';
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569;">${escapeHtml(q.title || 'Datum')} ${qReq}</label>
                        <input type="date" id="q-input-${eventId}-${q.id}" value="${escapeHtml(val)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box;">
                    </div>
                `;
            } else if (q.type === 'time') {
                const val = rawVal !== undefined ? String(rawVal) : '';
                html += `
                    <div style="margin-top:4px;">
                        <label style="font-size:0.9rem; font-weight:bold; color:#475569;">${escapeHtml(q.title || 'Uhrzeit')} ${qReq}</label>
                        <input type="time" id="q-input-${eventId}-${q.id}" value="${escapeHtml(val)}" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem; box-sizing:border-box;">
                    </div>
                `;
            }
        });
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
    const answers = {};
    
    const curEvent = (allTermine || []).find(x => String(x.id) === String(eventId));

    if (attending) {
        const countInput = document.getElementById(`input-count-${eventId}`);
        if (countInput) count = parseInt(countInput.value) || 1;
        
        const essenInput = document.getElementById(`input-essen-${eventId}`);
        if (essenInput) essen = parseInt(essenInput.value) || 0;

        const vegiInput = document.getElementById(`input-vegi-${eventId}`);
        if (vegiInput) vegi = parseInt(vegiInput.value) || 0;

        // Dynamische Zusatzfragen validieren und sammeln
        if (curEvent && Array.isArray(curEvent.questions_schema) && curEvent.questions_schema.length > 0) {
            for (const q of curEvent.questions_schema) {
                if (q.type === 'multiselect') {
                    const checkedNodes = document.querySelectorAll(`input[name="q-cb-${eventId}-${q.id}"]:checked`);
                    const checkedVals = Array.from(checkedNodes).map(cb => cb.value);
                    if (q.required && checkedVals.length === 0) {
                        alert(`Bitte wähle mindestens eine Option für: ${q.title || 'Zusatzfrage'}`);
                        return;
                    }
                    answers[q.id] = checkedVals;
                } else {
                    const inp = document.getElementById(`q-input-${eventId}-${q.id}`);
                    const val = inp ? inp.value.trim() : '';
                    if (q.required && !val) {
                        alert(`Bitte fülle das Pflichtfeld aus: ${q.title || 'Zusatzfrage'}`);
                        if (inp) inp.focus();
                        return;
                    }
                    answers[q.id] = (q.type === 'number') ? (val ? Number(val) : 0) : val;
                }
            }
        }
    } else {
        const grundInput = document.getElementById(`input-grund-${eventId}`);
        if (grundInput) grund = grundInput.value.trim();
    }
    
    document.getElementById(`rsvp-${eventId}`).innerHTML = `<span style="font-size:0.8rem; color:white; font-weight:bold;">Verarbeite...</span>`;

    try {
        const cleanLizenz = String(user.lizenz).padStart(6, '0');
        const ok = await saveRSVPToSupabase(eventId, cleanLizenz, attending, count, essen, vegi, grund, '', answers);
        if (!ok) throw new Error("Fehler beim Speichern in Supabase");
        
        if (curEvent) {
            curEvent.attending = attending;
            curEvent.count = count;
            curEvent.essen = essen;
            curEvent.vegi = vegi;
            curEvent.grund = grund;
            curEvent.answers = answers;
        }

        loadTermine();
    } catch(e) { 
        console.error(e);
        alert("Fehler: Deine Antwort konnte nicht gespeichert werden. Bitte versuche es erneut.");
        loadTermine();
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
                ${buildPollAnswersSummaryHtml(t)}
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

            ${buildPollQuestionsHtml(t)}

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
        const data = await fetchPollResultsFromSupabase(eventId);
        if (data) callback(data);
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

    const checkboxes = document.querySelectorAll(`#rsvp-${eventId} input[name="poll-${eventId}"]:checked`);
    const selectedIds = Array.from(checkboxes).map(cb => cb.value).filter(Boolean);

    if (selectedIds.length === 0) {
        alert('Bitte wähle mindestens einen Termin aus, oder klicke auf "Keiner dieser Termine passt mir".');
        return;
    }

    const curEvent = (allTermine || []).find(x => String(x.id) === String(eventId));
    const answers = {};
    if (curEvent && Array.isArray(curEvent.questions_schema) && curEvent.questions_schema.length > 0) {
        for (const q of curEvent.questions_schema) {
            if (q.type === 'multiselect') {
                const checkedNodes = document.querySelectorAll(`input[name="poll-q-cb-${eventId}-${q.id}"]:checked`);
                const checkedVals = Array.from(checkedNodes).map(cb => cb.value);
                if (q.required && checkedVals.length === 0) {
                    alert(`Bitte wähle mindestens eine Option für: ${q.title || 'Zusatzfrage'}`);
                    return;
                }
                answers[q.id] = checkedVals;
            } else {
                const inp = document.getElementById(`poll-q-input-${eventId}-${q.id}`);
                const val = inp ? inp.value.trim() : '';
                if (q.required && !val) {
                    alert(`Bitte fülle das Pflichtfeld aus: ${q.title || 'Zusatzfrage'}`);
                    if (inp) inp.focus();
                    return;
                }
                answers[q.id] = (q.type === 'number') ? (val ? Number(val) : 0) : val;
            }
        }
    }

    const btn = document.querySelector(`#rsvp-${eventId} .poll-btn-submit`) || document.querySelector(`#rsvp-${eventId} .poll-submit-btn`);
    if (btn) { btn.textContent = 'Speichere...'; btn.disabled = true; }

    try {
        const cleanLizenz = String(user.lizenz).padStart(6, '0');
        const rawOptIds = selectedIds.join(',');

        // 1. Supabase Master (direkt speichern)
        const ok = await saveRSVPToSupabase(eventId, cleanLizenz, true, 1, 0, 0, '', rawOptIds, answers);
        if (!ok) throw new Error('Fehler beim Speichern in Supabase');
        
        if (curEvent) {
            curEvent.attending = true;
            curEvent.optionids = rawOptIds;
            curEvent.answers = answers;
        }

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

        // 1. Supabase Master (direkt speichern)
        const ok = await saveRSVPToSupabase(eventId, cleanLizenz, false, 1, 0, 0, 'Kein Termin passt', '', {});
        if (!ok) throw new Error('Fehler beim Speichern in Supabase');

        const curEvent = (allTermine || []).find(x => String(x.id) === String(eventId));
        if (curEvent) {
            curEvent.attending = false;
            curEvent.optionids = '';
            curEvent.grund = 'Kein Termin passt';
            curEvent.answers = {};
        }

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
        // Revalidate im Hintergrund aus Supabase
        fetchParticipantsFromSupabase(eventId)
            .then(fresh => {
                if (Array.isArray(fresh) && fresh.length > 0) {
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
        const data = await fetchParticipantsFromSupabase(eventId);
        participantsCache[eventId] = data;
        renderList(data);
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
        await fetch(`${SUPABASE_REST_URL}/poll_views`, {
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
        });
        localStorage.setItem(trackKey, "true");
        console.log("View tracked for event in Supabase:", eventId);
    } catch (e) {
        // Silent fail, damit die App bei Tracking-Fehlern nicht abstürzt
    }
}
