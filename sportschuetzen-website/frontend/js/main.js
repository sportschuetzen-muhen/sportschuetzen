// Simple smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            e.preventDefault();
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
            
            // Update active state in nav
            document.querySelectorAll('.desktop-nav a').forEach(navLink => {
                navLink.classList.remove('active');
            });
            this.classList.add('active');
            
            // Close mobile menu if open
            document.getElementById('nav-links').classList.remove('open');
            const toggle = document.getElementById('mobile-toggle');
            if (toggle) toggle.classList.remove('active');
            document.body.classList.remove('no-scroll');
        }
    });
});

// Mobile Menu Toggle (Fallback falls components.js nicht verwendet wird)
const mobileToggle = document.getElementById('mobile-toggle');
const navLinks = document.getElementById('nav-links');

if (mobileToggle && navLinks && !mobileToggle.hasAttribute('data-bound')) {
    mobileToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        mobileToggle.classList.toggle('active');
        document.body.classList.toggle('no-scroll');
    });
}

// === TERMINE & GOOGLE KALENDER INTEGRATION ===

const SUPABASE_REST_URL = "https://supabase-muhen.danfamily.uk/rest/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";
const GOOGLE_HAUS_KALENDER_URL = "https://github-dropdown-refresh.dan-hunziker73.workers.dev?action=getHausKalender";
const GOOGLE_HAUS_KALENDER_FALLBACK = "https://script.google.com/macros/s/AKfycbxETNWUOsdyF72caWlJ7gi7mlI_oSX2rWQJfUskim8umRF2ARrSCGfe6UWzTy26B_s5/exec";
const WORKER_TERMINE_URL = "https://termine.dan-hunziker73.workers.dev?action=getTermine";

let allMergedEvents = [];

function normalizeDateStr(obj) {
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
}

function parseEventDate(obj) {
    const s = normalizeDateStr(obj);
    if (!s) return null;
    const parts = s.split('-');
    if (parts.length === 3) {
        const y = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) - 1;
        const d = parseInt(parts[2], 10);
        if (!isNaN(y) && !isNaN(m) && !isNaN(d)) return new Date(y, m, d);
    }
    const fb = new Date(s);
    return isNaN(fb.getTime()) ? null : fb;
}

// 1. Vereinstermine (Supabase mit Fallback auf Worker)
async function fetchVereinsTermine() {
    try {
        const response = await fetch(`${SUPABASE_REST_URL}/termine?select=*&status=neq.abgesagt&order=datum.asc,sort_order.asc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        if (response.ok) {
            const raw = await response.json();
            if (Array.isArray(raw) && raw.length > 0) {
                return raw.map(r => ({
                    id: r.id,
                    datum: r.datum || '',
                    datum_iso: r.datum || '',
                    start: r.startzeit || '',
                    ende: r.endzeit || '',
                    titel: r.anlasstitel || '',
                    ort: r.ort || 'Schützenhaus Muhen',
                    kategorie: r.kategorie || 'Jahresprogramm',
                    status: r.status || 'fix',
                    typ: 'verein',
                    map: r.austragungsorte_map || ''
                }));
            }
        }
    } catch (e) {
        console.warn('Supabase Termine nicht erreichbar, nutze Worker Fallback:', e);
    }

    try {
        const resp = await fetch(WORKER_TERMINE_URL);
        if (resp.ok) {
            const raw = await resp.json();
            if (Array.isArray(raw) && raw.length > 0) {
                return raw.map(r => ({
                    id: r.id || 'wk_' + (r.datum || '').replace(/[^0-9]/g, ''),
                    datum: r.datum_iso || r.datum || '',
                    datum_iso: r.datum_iso || r.datum || '',
                    start: r.start || '',
                    ende: r.ende || '',
                    titel: r.titel || '',
                    ort: r.ort || 'Schützenhaus Muhen',
                    kategorie: r.kategorie || 'Jahresprogramm',
                    status: r.status || 'fix',
                    typ: 'verein',
                    map: r.map || ''
                }));
            }
        }
    } catch (e2) {
        console.error('Auch Worker Termine fehlgeschlagen:', e2);
    }
    return [];
}

// 2. Google Kalender Belegungen (Hauskalender)
async function fetchGoogleHausKalender() {
    // A. Primär: Cloudflare Worker
    try {
        const resp = await fetch(GOOGLE_HAUS_KALENDER_URL);
        if (resp.ok) {
            const raw = await resp.json();
            if (Array.isArray(raw) && raw.length > 0) {
                return raw.map(r => ({
                    id: 'cal_' + (r.datum_iso || r.datum || '') + '_' + Math.random().toString(36).substr(2, 6),
                    datum: r.datum_iso || r.datum || '',
                    datum_iso: r.datum_iso || r.datum || '',
                    start: r.start || '',
                    ende: r.ende || '',
                    titel: r.titel || 'Schützenhaus Belegung',
                    ort: r.ort || 'Schützenhaus',
                    kategorie: 'Hauskalender',
                    status: r.status || 'fix',
                    typ: 'extern',
                    map: r.map || ''
                }));
            }
        }
    } catch (e) {
        console.warn('Worker Hauskalender fehlgeschlagen, versuche Google Script direkt:', e);
    }

    // B. Fallback: Google Apps Script direkt
    try {
        const gasResp = await fetch(GOOGLE_HAUS_KALENDER_FALLBACK);
        if (gasResp.ok) {
            const raw = await gasResp.json();
            if (Array.isArray(raw) && raw.length > 0) {
                return raw.map(r => ({
                    id: 'gas_' + (r.datum_iso || r.datum || '') + '_' + Math.random().toString(36).substr(2, 6),
                    datum: r.datum_iso || r.datum || '',
                    datum_iso: r.datum_iso || r.datum || '',
                    start: r.start || '',
                    ende: r.ende || '',
                    titel: r.titel || 'Schützenhaus Belegung',
                    ort: r.ort || 'Schützenhaus',
                    kategorie: 'Hauskalender',
                    status: r.status || 'fix',
                    typ: 'extern',
                    map: r.map || ''
                }));
            }
        }
    } catch (e2) {
        console.warn('GAS Hauskalender Fallback fehlgeschlagen:', e2);
    }

    // C. Fallback: Supabase rental_requests
    try {
        const supaResp = await fetch(`${SUPABASE_REST_URL}/rental_requests?select=booking_number,start_date,end_date,festbeginn,status,is_inquiry&status=neq.cancelled&order=start_date.asc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        if (supaResp.ok) {
            const rentals = await supaResp.json();
            if (Array.isArray(rentals)) {
                return rentals.map(r => ({
                    id: r.booking_number,
                    datum: r.start_date || '',
                    datum_iso: r.start_date || '',
                    start: r.festbeginn || '',
                    ende: '',
                    titel: r.is_inquiry ? 'Schützenhaus (Anfrage)' : 'Schützenhaus Vermietung',
                    ort: 'Schützenhaus',
                    kategorie: 'Hauskalender',
                    status: 'fix',
                    typ: 'extern',
                    map: ''
                }));
            }
        }
    } catch (e3) {}

    return [];
}

// 3. Merged Daten holen mit Duplikat-Erkennung & Runden-Präfixen
async function fetchAllTermineAndCalendar() {
    if (allMergedEvents && allMergedEvents.length > 0) {
        return allMergedEvents;
    }

    const [termine, hausKalender] = await Promise.all([
        fetchVereinsTermine(),
        fetchGoogleHausKalender()
    ]);

    const normalizeTitle = (str) => (str || '').toLowerCase().replace(/[^a-z0-9äöü]/g, '');
    const merged = [];

    // Vereinstermine übernehmen
    (termine || []).forEach(t => {
        merged.push({ ...t, typ: 'verein' });
    });

    // Google Kalender Belegungen hinzufügen, Dubletten vermeiden
    (hausKalender || []).forEach(ext => {
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
            merged.push({ ...ext, typ: 'extern', kategorie: 'Hauskalender' });
        }
    });

    // Runden-Präfixe für Vereinsturniere vergeben
    const rules = {
        "Gruppenmeisterschaft SSV": 3,
        "Gruppenmeisterschaft AGSV": 3,
        "Grenzland-Cup": 3,
        "Mannschaftsmeisterschaft": 7
    };
    const counters = {};

    let processed = merged.map(t => {
        const title = (t.titel || '').trim();
        if (title.toLowerCase().startsWith("final")) return t;

        for (const baseTitle in rules) {
            if (title === baseTitle) {
                counters[baseTitle] = (counters[baseTitle] || 0) + 1;
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

    // Nach Datum sortieren
    processed.sort((a, b) => {
        const dA = parseEventDate(a);
        const dB = parseEventDate(b);
        const tA = dA ? dA.getTime() : 8640000000000000;
        const tB = dB ? dB.getTime() : 8640000000000000;
        return tA - tB;
    });

    allMergedEvents = processed;
    return allMergedEvents;
}

// Rendert eine Liste von Terminen in einen Container
function renderTerminCards(events, container) {
    if (!container) return;
    if (!events || events.length === 0) {
        container.innerHTML = '<p class="text-center text-muted" style="padding: 2rem 0;">Zurzeit stehen keine passenden Termine an.</p>';
        return;
    }

    container.innerHTML = '';
    const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

    events.forEach(t => {
        const dObj = parseEventDate(t);
        const day = dObj ? dObj.getDate() : '--';
        const month = dObj ? months[dObj.getMonth()] : '--';

        // Kategorie-Badge bestimmen
        let badgeHtml = '';
        const kat = (t.kategorie || '').toLowerCase();
        if (t.typ === 'extern' || kat === 'hauskalender') {
            badgeHtml = '<span class="termin-badge badge-hauskalender">🏠 Schützenhaus-Belegung</span>';
        } else if (kat === 'jahresprogramm') {
            badgeHtml = '<span class="termin-badge badge-jahresprogramm">📅 Jahresprogramm</span>';
        } else if (kat.includes('schiess')) {
            badgeHtml = '<span class="termin-badge badge-schiesstermin">🎯 Schiessbetrieb</span>';
        } else {
            badgeHtml = '<span class="termin-badge badge-schiesstermin">📅 Vereinstermin</span>';
        }

        // Zeit & Ort aufbereiten
        let timeStr = '';
        if (t.start && t.start !== '00:00') {
            timeStr = `🕒 ${t.start}${t.ende && t.ende !== '00:00' ? ' – ' + t.ende : ''} Uhr | `;
        }
        const ortStr = `📍 ${t.ort || 'Schützenhaus Muhen'}`;

        container.innerHTML += `
            <div class="termin-item">
                <div class="termin-date">
                    <span class="day">${day}</span>
                    <span class="month">${month}</span>
                </div>
                <div class="termin-details">
                    ${badgeHtml}
                    <h3>${t.titel}</h3>
                    <p>${timeStr}${ortStr}</p>
                </div>
            </div>
        `;
    });
}

// 4. Startseite: Nächste Termine laden & Filter initialisieren
async function loadTermine() {
    const container = document.getElementById('termine-container');
    if (!container) return;

    try {
        const events = await fetchAllTermineAndCalendar();

        // Nur zukünftige oder heutige Termine auf der Startseite
        const today = new Date();
        today.setHours(0,0,0,0);

        const upcomingEvents = events.filter(t => {
            const d = parseEventDate(t);
            return d && d >= today;
        });

        // Filterfunktion anwenden
        let currentFilter = 'all';
        const applyFilter = (filterKey) => {
            currentFilter = filterKey;
            let filtered = upcomingEvents;
            if (filterKey === 'jahresprogramm') {
                filtered = upcomingEvents.filter(t => t.typ === 'verein' && (t.kategorie || '').toLowerCase() === 'jahresprogramm');
            } else if (filterKey === 'schiesstermine') {
                filtered = upcomingEvents.filter(t => t.typ === 'verein' && (t.kategorie || '').toLowerCase().includes('schiess'));
            } else if (filterKey === 'hauskalender') {
                filtered = upcomingEvents.filter(t => t.typ === 'extern' || (t.kategorie || '').toLowerCase() === 'hauskalender');
            }
            // Auf der Startseite bis zu 8 nächste Termine anzeigen
            renderTerminCards(filtered.slice(0, 8), container);
        };

        // Filter Buttons binden
        const filterBtns = document.querySelectorAll('#termine-filter-bar .termine-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyFilter(btn.getAttribute('data-filter'));
            });
        });

        applyFilter('all');

    } catch (error) {
        console.error('Fehler beim Laden der Termine:', error);
        container.innerHTML = '<p class="text-center text-muted">Termine konnten nicht geladen werden.</p>';
    }
}

// 5. Verein.html: Vollständiges Jahresprogramm & Kalender laden
async function loadVereinTermine() {
    const container = document.getElementById('verein-termine-container');
    if (!container) return;

    try {
        const events = await fetchAllTermineAndCalendar();

        let currentFilter = 'all';
        const applyFilter = (filterKey) => {
            currentFilter = filterKey;
            let filtered = events;
            if (filterKey === 'jahresprogramm') {
                filtered = events.filter(t => t.typ === 'verein' && (t.kategorie || '').toLowerCase() === 'jahresprogramm');
            } else if (filterKey === 'schiesstermine') {
                filtered = events.filter(t => t.typ === 'verein' && (t.kategorie || '').toLowerCase().includes('schiess'));
            } else if (filterKey === 'hauskalender') {
                filtered = events.filter(t => t.typ === 'extern' || (t.kategorie || '').toLowerCase() === 'hauskalender');
            }
            renderTerminCards(filtered, container);
        };

        const filterBtns = document.querySelectorAll('#verein-termine-filter-bar .termine-filter-btn');
        filterBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                filterBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                applyFilter(btn.getAttribute('data-filter'));
            });
        });

        applyFilter('all');

        // Automatisches Öffnen des Termine-Tabs via Hash (#termine)
        if (window.location.hash === '#termine') {
            const tabBtn = document.querySelector('#mitglieder .gallery-filter-btn[data-tab="termine"]');
            if (tabBtn) tabBtn.click();
        }

    } catch (error) {
        console.error('Fehler beim Laden des Jahresprogramms:', error);
        container.innerHTML = '<p class="text-center text-muted">Jahresprogramm konnte nicht geladen werden.</p>';
    }
}

// Display and render reports in the DOM
function displayReports(reports, container) {
    // Ensure Modal exists in DOM
    if (!document.getElementById('news-reader-modal')) {
        const modalHtml = `
            <div id="news-reader-modal" class="news-modal-overlay" onclick="if(event.target === this) window.closeNewsModal()">
                <div class="news-modal-content">
                    <button class="news-modal-close" onclick="window.closeNewsModal()">&times;</button>
                    <div id="news-modal-image" class="news-modal-img"></div>
                    <div class="news-modal-body">
                        <span id="news-modal-date" style="color:var(--accent-color); font-weight:600; font-size: 0.9rem; text-transform:uppercase; letter-spacing:1px;"></span>
                        <h2 id="news-modal-title" style="margin:10px 0 20px 0; font-size:2.2rem; line-height:1.2; color:var(--primary-color);"></h2>
                        <div id="news-modal-content" style="line-height:1.8; color:var(--text-light); font-size:1.05rem;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Global function to close the modal
    window.closeNewsModal = function() {
        const modal = document.getElementById('news-reader-modal');
        if (modal) modal.style.display = 'none';
        document.body.classList.remove('no-scroll');
    };

    // Global function to open the modal (defined always)
    window.openNewsModal = function(index) {
        const r = window.loadedReports[index];
        if (!r) return;
        
        let dateStr = 'Unbekanntes Datum';
        if (r.date) {
            const dateObj = new Date(r.date);
            if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
            }
        }
        
        document.getElementById('news-modal-date').innerText = dateStr + ' | ' + r.author;
        document.getElementById('news-modal-title').innerText = r.title;
        
        // Content + Additional Images Gallery
        let contentHtml = r.content;
        if (r.imageUrls && r.imageUrls.length > 1) {
            let galleryHtml = '<div style="margin-top: 30px; border-top: 1px solid var(--glass-border); padding-top: 20px;"><h4 style="color: var(--primary-color); margin-bottom: 15px; font-weight: 800;">Weitere Fotos</h4><div style="display:flex; gap:15px; overflow-x:auto; padding-bottom:15px;">';
            for (let i = 1; i < r.imageUrls.length; i++) {
                galleryHtml += `<img src="${r.imageUrls[i]}" style="height:150px; border-radius:8px; object-fit:cover; border: 1px solid var(--glass-border); cursor:pointer; box-shadow: 0 4px 6px rgba(15,58,93,0.06);" onclick="window.open(this.src, '_blank')">`;
            }
            galleryHtml += '</div></div>';
            contentHtml += galleryHtml;
        }
        
        document.getElementById('news-modal-content').innerHTML = contentHtml;
        
        const imgUrl = (r.imageUrls && r.imageUrls.length > 0) ? r.imageUrls[0] : (r.image || r.imageUrl);
        const imgEl = document.getElementById('news-modal-image');
        if (imgUrl) {
            imgEl.style.backgroundImage = `url('${imgUrl}')`;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
        
        document.getElementById('news-reader-modal').style.display = 'flex';
        document.body.classList.add('no-scroll');
    };

    container.innerHTML = '';
    window.loadedReports = reports;

    // Display up to 6 reports
    const recentReports = reports.slice(0, 6);

    recentReports.forEach((r, index) => {
        let dateStr = 'Unbekanntes Datum';
        if (r.date) {
            const dateObj = new Date(r.date);
            if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
            }
        }
        
        // Create a short excerpt from the HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = r.content;
        let excerpt = tempDiv.textContent || tempDiv.innerText || "";
        if (excerpt.length > 120) {
            excerpt = excerpt.substring(0, 120) + '...';
        }

        const coverImgUrl = (r.imageUrls && r.imageUrls.length > 0) ? r.imageUrls[0] : (r.image || r.imageUrl);
        const imgHtml = coverImgUrl 
            ? `<div class="report-image" style="background-image: url('${coverImgUrl}'); background-size: cover; background-position: center; cursor: pointer;" onclick="window.openNewsModal(${index})"></div>`
            : `<div class="report-image" style="background: linear-gradient(45deg, #1e293b, #334155); display: flex; align-items: center; justify-content: center; font-size: 2rem; cursor: pointer;" onclick="window.openNewsModal(${index})">📰</div>`;

        container.innerHTML += `
            <div class="glass-card report-card">
                ${imgHtml}
                <div class="report-content" style="padding: 20px;">
                    <span class="report-date" style="color: var(--primary-color); font-weight: 600; font-size: 0.85rem;">${dateStr} | ${r.author}</span>
                    <h3 style="margin: 10px 0; cursor: pointer;" onclick="window.openNewsModal(${index})">${r.title}</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">${excerpt}</p>
                    <button class="read-more btn btn-outline" style="margin-top: 15px; width: 100%;" onclick="window.openNewsModal(${index})">Ganzen Bericht lesen</button>
                </div>
            </div>
        `;
    });
}

// Fetch Reports
async function loadReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;

    try {
        // Cache-Busting durch Timestamp hinzugefügt
        const response = await fetch('data/berichte.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error('Berichte nicht gefunden');
        
        const reports = await response.json();
        
        if (!reports || reports.length === 0) {
            container.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1;">Zurzeit sind keine Berichte vorhanden.</p>';
            return;
        }

        displayReports(reports, container);

    } catch (error) {
        console.error('Fehler beim Laden der Berichte:', error);
        
        // Fallback-Berichte für lokale Entwicklung (CORS/Offline)
        const fallbackReports = [
            {
                "id": "report_initial",
                "title": "Willkommen zur neuen Website",
                "author": "Vorstand",
                "date": "2026-05-31T08:00:00.000Z",
                "content": "<p>Unsere neue Website ist online! In Zukunft werden hier an dieser Stelle regelmässig neue Vereinsberichte und News publiziert. Wir danken allen für die Unterstützung.</p>",
                "imageUrl": null
            }
        ];
        
        try {
            displayReports(fallbackReports, container);
        } catch (innerError) {
            container.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1;">Berichte konnten nicht geladen werden.</p>';
        }
    }
}

// Load Termine, Jahresprogramm and Reports on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    loadTermine();
    loadVereinTermine();
    loadReports();
    initContactForm();
});

window.addEventListener('hashchange', () => {
    if (window.location.hash === '#termine') {
        const tabBtn = document.querySelector('#mitglieder .gallery-filter-btn[data-tab="termine"]');
        if (tabBtn) tabBtn.click();
    }
});

// AJAX Contact Form Handler (Web3Forms)
function initContactForm() {
    const form = document.getElementById('contact-form');
    const status = document.getElementById('contact-status');
    const submitBtn = document.getElementById('contact-submit');
    if (!form || !status || !submitBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Block consecutive submits
        submitBtn.disabled = true;
        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = "Wird gesendet...";

        status.style.display = "none";
        status.className = ""; // clear classes

        const formData = new FormData(form);

        try {
            const response = await fetch(form.action, {
                method: form.method,
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            });

            const json = await response.json();

            if (response.status === 200 || json.success) {
                status.style.display = "block";
                status.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
                status.style.color = "#10b981";
                status.style.border = "1px solid rgba(16, 185, 129, 0.2)";
                status.innerText = "Vielen Dank! Ihre Nachricht wurde erfolgreich an uns übermittelt. Wir setzen uns bald mit Ihnen in Verbindung.";
                form.reset();
            } else {
                throw new Error(json.message || "Es gab ein Problem beim Übermitteln der Nachricht.");
            }
        } catch (error) {
            console.error("Kontaktformular Fehler:", error);
            status.style.display = "block";
            status.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
            status.style.color = "#ef4444";
            status.style.border = "1px solid rgba(239, 68, 68, 0.2)";
            status.innerText = "Fehler: " + (error.message || "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
        }
    });
}

