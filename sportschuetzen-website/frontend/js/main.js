(function(window) {
'use strict';

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
            const navEl = document.getElementById('nav-links');
            if (navEl) navEl.classList.remove('open');
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
const SUPABASE_FUNCTIONS_URL = "https://supabase-muhen.danfamily.uk/functions/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";
const GOOGLE_HAUS_KALENDER_URL = "https://github-dropdown-refresh.dan-hunziker73.workers.dev?action=getHausKalender";

function escapeHtml(str) {
    if (!str) return '';
    return str.toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function setSanitizedHtml(el, rawHtml) {
    if (!el) return;
    const html = String(rawHtml || '');
    if (typeof el.setHTML === 'function') {
        el.setHTML(html);
        return;
    }
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    tpl.content.querySelectorAll('script, iframe, object, embed, style, link').forEach(n => n.remove());
    tpl.content.querySelectorAll('*').forEach(node => {
        Array.from(node.attributes).forEach(attr => {
            const name = attr.name.toLowerCase();
            const val = attr.value.trim().toLowerCase();
            if (name.startsWith('on') || ((name === 'href' || name === 'src') && val.startsWith('javascript:'))) {
                node.removeAttribute(attr.name);
            }
        });
    });
    el.innerHTML = '';
    el.appendChild(tpl.content);
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 10000) {
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
    try {
        return await fetch(url, { ...options, signal: controller ? controller.signal : undefined });
    } finally {
        if (timer) clearTimeout(timer);
    }
}

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

// 1. Vereinstermine (Supabase Single Source of Truth)
async function fetchVereinsTermine() {
    try {
        const response = await fetchWithTimeout(`${SUPABASE_REST_URL}/termine?select=*&status=neq.abgesagt&order=datum.asc,sort_order.asc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        }, 10000);
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
        console.error('Supabase Termine Abfragefehler:', e);
    }
    return [];
}

// 2. Belegungen Hauskalender
async function fetchGoogleHausKalender() {
    // A. Primär: Cloudflare Worker
    try {
        const resp = await fetchWithTimeout(GOOGLE_HAUS_KALENDER_URL, {}, 8000);
        if (resp.ok) {
            const raw = await resp.json();
            if (Array.isArray(raw) && raw.length > 0) {
                return raw.map(r => {
                    const rawTitel = (r.titel || '').trim();
                    let cleanTitel = 'Schützenhaus Belegung';
                    const lower = rawTitel.toLowerCase();
                    const isReinigung = lower.includes('reinigung') || lower.includes('gesperrt');
                    if (lower.includes('vermiet') || lower.includes('reserv')) {
                        cleanTitel = 'Schützenhaus reserviert';
                    } else if (isReinigung) {
                        cleanTitel = 'Schützenhaus gesperrt (Reinigung)';
                    }
                    return {
                        id: 'cal_' + (r.datum_iso || r.datum || '') + '_' + Math.random().toString(36).substr(2, 6),
                        datum: r.datum_iso || r.datum || '',
                        datum_iso: r.datum_iso || r.datum || '',
                        start: r.start || '',
                        ende: r.ende || '',
                        titel: cleanTitel,
                        is_cleaning: isReinigung,
                        ort: r.ort || 'Schützenhaus',
                        kategorie: 'Hauskalender',
                        status: r.status || 'fix',
                        typ: 'extern',
                        map: r.map || ''
                    };
                });
            }
        }
    } catch (e) {
        console.warn('Worker Hauskalender fehlgeschlagen, versuche Supabase:', e);
    }

    // B. Fallback: PII-freie Supabase Kalender-RPC (get_public_rental_calendar)
    try {
        const supaResp = await fetchWithTimeout(`${SUPABASE_REST_URL}/rpc/get_public_rental_calendar`, {
            method: 'POST',
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                'Content-Type': 'application/json'
            },
            body: '{}'
        }, 8000);
        if (supaResp.ok) {
            const rentals = await supaResp.json();
            if (Array.isArray(rentals)) {
                return rentals.map(r => ({
                    id: 'cal_' + (r.start_date || '') + '_' + Math.random().toString(36).substr(2, 6),
                    datum: r.start_date || '',
                    datum_iso: r.start_date || '',
                    start: r.festbeginn || '',
                    ende: '',
                    titel: r.is_inquiry ? 'Schützenhaus (Anfrage)' : 'Schützenhaus reserviert',
                    is_cleaning: false,
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
            timeStr = `🕒 ${escapeHtml(t.start)}${t.ende && t.ende !== '00:00' ? ' – ' + escapeHtml(t.ende) : ''} Uhr | `;
        }
        const ortStr = `📍 ${escapeHtml(t.ort || 'Schützenhaus Muhen')}`;

        container.innerHTML += `
            <div class="termin-item">
                <div class="termin-date">
                    <span class="day">${day}</span>
                    <span class="month">${month}</span>
                </div>
                <div class="termin-details">
                    ${badgeHtml}
                    <h3>${escapeHtml(t.titel)}</h3>
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
            if (filterKey === 'all') {
                // In der Gesamtübersicht reine Reinigungsblockaden ausblenden, damit Vereinsanlässe & Belegungen sichtbar bleiben
                filtered = upcomingEvents.filter(t => !t.is_cleaning);
            } else if (filterKey === 'jahresprogramm') {
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
        container.innerHTML = '<div class="text-center text-muted" style="padding:1.5rem;"><p style="margin-bottom:0.75rem;">Termine konnten nicht geladen werden.</p><button type="button" class="btn btn-outline" onclick="window.loadTermine()">Erneut versuchen</button></div>';
    }
}
window.loadTermine = loadTermine;

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
            if (filterKey === 'all') {
                filtered = events.filter(t => !t.is_cleaning);
            } else if (filterKey === 'jahresprogramm') {
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
        container.innerHTML = '<div class="text-center text-muted" style="padding:1.5rem;"><p style="margin-bottom:0.75rem;">Jahresprogramm konnte nicht geladen werden.</p><button type="button" class="btn btn-outline" onclick="window.loadVereinTermine()">Erneut versuchen</button></div>';
    }
}
window.loadVereinTermine = loadVereinTermine;

// Hilfsfunktion: Bild-URLs zuverlässig und host-übergreifend auflösen
function getReportImageUrl(img) {
    if (!img) return '';
    if (img.startsWith('http://') || img.startsWith('https://')) return img;
    // Auf Cloudflare Pages (*.pages.dev) oder localhost: Immer von GitHub Raw laden, damit neue Bilder SOFORT live sind!
    if (!window.location.hostname.includes('sportschuetzen-muhen.github.io')) {
        return `https://raw.githubusercontent.com/sportschuetzen-muhen/website/main/${img}`;
    }
    return img;
}

// Display and render reports in the DOM
function displayReports(reports, container) {
    // Ensure Modal exists in DOM
    if (!document.getElementById('news-reader-modal')) {
        const modalHtml = `
            <div id="news-reader-modal" class="news-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="news-modal-title" onclick="if(event.target === this) window.closeNewsModal()">
                <div class="news-modal-content">
                    <button type="button" class="news-modal-close" aria-label="Bericht schliessen" onclick="window.closeNewsModal()">&times;</button>
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
        document.addEventListener('keydown', (e) => {
            const modal = document.getElementById('news-reader-modal');
            if (e.key === 'Escape' && modal && modal.style.display === 'flex') {
                window.closeNewsModal();
            }
        });
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
        let contentHtml = r.content || '';
        if (r.imageUrls && r.imageUrls.length > 1) {
            let galleryHtml = '<div style="margin-top: 30px; border-top: 1px solid var(--glass-border); padding-top: 20px;"><h4 style="color: var(--primary-color); margin-bottom: 15px; font-weight: 800;">Weitere Fotos</h4><div style="display:flex; gap:15px; overflow-x:auto; padding-bottom:15px;">';
            for (let i = 1; i < r.imageUrls.length; i++) {
                const subImg = escapeHtml(getReportImageUrl(r.imageUrls[i]));
                galleryHtml += `<img src="${subImg}" alt="Foto aus dem Vereinsbericht" loading="lazy" style="height:150px; border-radius:8px; object-fit:cover; border: 1px solid var(--glass-border); cursor:pointer; box-shadow: 0 4px 6px rgba(15,58,93,0.06);" onclick="window.open(this.src, '_blank', 'noopener')">`;
            }
            galleryHtml += '</div></div>';
            contentHtml += galleryHtml;
        }
        
        setSanitizedHtml(document.getElementById('news-modal-content'), contentHtml);
        
        const rawCover = (r.imageUrls && r.imageUrls.length > 0) ? r.imageUrls[0] : (r.image || r.imageUrl);
        const coverImg = getReportImageUrl(rawCover);
        const imgEl = document.getElementById('news-modal-image');
        if (coverImg) {
            imgEl.style.backgroundImage = `url('${encodeURI(coverImg).replace(/'/g, "%27")}')`;
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
        
        // Create a short excerpt from the HTML content without gluing adjacent block elements together
        const spacedHtml = String(r.content || '')
            .replace(/<\/(p|div|li|h[1-6]|blockquote|tr)>/gi, ' </$1>')
            .replace(/<br\s*\/?>/gi, ' ');
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = spacedHtml;
        let excerpt = (tempDiv.textContent || tempDiv.innerText || "").replace(/\s+/g, ' ').trim();
        if (excerpt.length > 120) {
            excerpt = excerpt.substring(0, 120).trimEnd() + '...';
        }

        const rawImg = (r.imageUrls && r.imageUrls.length > 0) ? r.imageUrls[0] : (r.image || r.imageUrl);
        const coverImgUrl = getReportImageUrl(rawImg);
        
        const imgHtml = coverImgUrl 
            ? `<div class="report-image" style="background-image: url('${encodeURI(coverImgUrl).replace(/'/g, "%27")}'); background-size: cover; background-position: center; cursor: pointer;" onclick="window.openNewsModal(${index})"></div>`
            : `<div class="report-image" style="background: linear-gradient(45deg, #1e293b, #334155); display: flex; align-items: center; justify-content: center; font-size: 2rem; cursor: pointer;" onclick="window.openNewsModal(${index})">📰</div>`;

        container.innerHTML += `
            <div class="glass-card report-card">
                ${imgHtml}
                <div class="report-content" style="padding: 20px;">
                    <span class="report-date" style="color: var(--primary-color); font-weight: 600; font-size: 0.85rem;">${escapeHtml(dateStr)} | ${escapeHtml(r.author)}</span>
                    <h3 style="margin: 10px 0; cursor: pointer;" onclick="window.openNewsModal(${index})">${escapeHtml(r.title)}</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">${escapeHtml(excerpt)}</p>
                    <button type="button" class="read-more btn btn-outline" style="margin-top: 15px; width: 100%;" onclick="window.openNewsModal(${index})">Ganzen Bericht lesen</button>
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
        let reports = null;
        
        // 1. Primär: Immer direkt die aktuelle Live-Quelle von GitHub abfragen (Single Source of Truth)
        try {
            const liveResponse = await fetchWithTimeout('https://raw.githubusercontent.com/sportschuetzen-muhen/website/main/data/berichte.json?v=' + Date.now(), {}, 8000);
            if (liveResponse.ok) {
                reports = await liveResponse.json();
            }
        } catch (liveErr) {
            console.warn('Live GitHub berichte.json konnte nicht abgerufen werden, prüfe lokalen Fallback...', liveErr);
        }

        // 2. Fallback: Lokale Datei (nur falls GitHub nicht erreichbar ist)
        if (!reports || reports.length === 0) {
            try {
                const response = await fetchWithTimeout('data/berichte.json?v=' + Date.now(), {}, 8000);
                if (response.ok) {
                    reports = await response.json();
                }
            } catch (fetchErr) {
                console.warn('Lokale berichte.json nicht verfügbar:', fetchErr);
            }
        }
        
        if (!reports || reports.length === 0) {
            container.innerHTML = '<div class="text-center text-muted" style="grid-column: 1 / -1; padding: 1.5rem;"><p style="margin-bottom:0.75rem;">Zurzeit sind keine Berichte vorhanden.</p><button type="button" class="btn btn-outline" onclick="window.loadReports()">Aktualisieren</button></div>';
            return;
        }

        displayReports(reports, container);

    } catch (error) {
        console.error('Fehler beim Laden der Berichte:', error);
        container.innerHTML = '<div class="text-center text-muted" style="grid-column: 1 / -1; padding: 1.5rem;"><p style="margin-bottom:0.75rem;">Berichte konnten nicht geladen werden.</p><button type="button" class="btn btn-outline" onclick="window.loadReports()">Erneut versuchen</button></div>';
    }
}
window.loadReports = loadReports;

// Load Termine, Jahresprogramm and Reports on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    initContactForm();
    Promise.allSettled([
        loadTermine(),
        loadVereinTermine(),
        loadReports()
    ]).then(() => {
        if (typeof window.realignHashTarget === 'function') {
            window.realignHashTarget();
        }
    });
});

window.addEventListener('hashchange', () => {
    if (window.location.hash === '#termine') {
        const tabBtn = document.querySelector('#mitglieder .gallery-filter-btn[data-tab="termine"]');
        if (tabBtn) tabBtn.click();
    }
});

// Native Supabase Contact Form Handler (Single Source of Truth + Dynamic System-Mails)
function initContactForm() {
    const form = document.getElementById('contact-form');
    const status = document.getElementById('contact-status');
    const submitBtn = document.getElementById('contact-submit');
    if (!form || !status || !submitBtn) return;

    const validatedFields = form.querySelectorAll('input:not([type="checkbox"]), select, textarea');
    const syncFieldAria = (el) => {
        el.setAttribute('aria-invalid', String(!el.checkValidity()));
    };
    validatedFields.forEach((el) => {
        el.addEventListener('blur', () => {
            el.dataset.touched = '1';
            syncFieldAria(el);
        });
        el.addEventListener('input', () => {
            if (el.dataset.touched === '1') syncFieldAria(el);
        });
        el.addEventListener('change', () => {
            if (el.dataset.touched === '1') syncFieldAria(el);
        });
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        validatedFields.forEach((el) => {
            el.dataset.touched = '1';
            syncFieldAria(el);
        });

        // Anti-Spam Botcheck
        const botcheck = document.getElementById('contact-botcheck');
        if (botcheck && botcheck.checked) {
            console.warn('Bot submission blocked.');
            status.style.display = "block";
            status.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
            status.style.color = "#10b981";
            status.style.border = "1px solid rgba(16, 185, 129, 0.2)";
            status.innerText = "Vielen Dank! Deine Nachricht wurde erfolgreich übermittelt.";
            form.reset();
            return;
        }

        const nameInput = document.getElementById('contact-name');
        const emailInput = document.getElementById('contact-email');
        const subjectInput = document.getElementById('contact-subject');
        const messageInput = document.getElementById('contact-message');

        const name = (nameInput?.value || '').trim();
        const email = (emailInput?.value || '').trim();
        const subject = (subjectInput?.value || '').trim();
        const message = (messageInput?.value || '').trim();

        if (!name || !email || !subject || !message) {
            status.style.display = "block";
            status.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
            status.style.color = "#ef4444";
            status.style.border = "1px solid rgba(239, 68, 68, 0.2)";
            status.innerText = "Bitte fülle alle erforderlichen Felder aus.";
            return;
        }

        // Block consecutive submits
        submitBtn.disabled = true;
        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = "Wird übermittelt...";

        status.style.display = "none";
        status.className = "";

        try {
            // 1. In Supabase PostgreSQL speichern (Single Source of Truth)
            let contactRecordId = null;
            try {
                const insertRes = await fetch(`${SUPABASE_REST_URL}/website_contact_messages`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'apikey': SUPABASE_ANON_KEY,
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'Prefer': 'return=minimal'
                    },
                    body: JSON.stringify({
                        name,
                        email,
                        subject,
                        message,
                        status: 'neu'
                    })
                });
            } catch (dbErr) {
                console.warn('DB-Protokollierung fehlgeschlagen, versuche Mail-Versand:', dbErr);
            }

            // 2. Professionelle HTML-E-Mail formatieren
            const nowFormatted = new Date().toLocaleString('de-CH', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            });
            const safeName = escapeHtml(name);
            const safeEmail = escapeHtml(email);
            const safeSubject = escapeHtml(subject);
            const safeMessage = escapeHtml(message).replace(/\n/g, '<br>');

            const mailHtml = `
              <!DOCTYPE html>
              <html>
              <head><meta charset="utf-8"></head>
              <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; color: #1e293b;">
                <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid rgba(15, 60, 92, 0.12); box-shadow: 0 4px 15px rgba(0,0,0,0.05);">
                  <div style="background-color: #0f3c5c; padding: 24px; text-align: center; border-bottom: 3px solid #dc2626;">
                    <h2 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px;">Neue Website-Kontaktanfrage</h2>
                    <p style="color: rgba(255,255,255,0.85); margin: 6px 0 0 0; font-size: 13px;">Sportschützen Muhen (sportschuetzen-muhen.ch)</p>
                  </div>
                  <div style="padding: 24px;">
                    <div style="background: #f1f5f9; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
                      <p style="margin: 0 0 6px 0; font-size: 14px;"><strong>👤 Absender:</strong> ${safeName}</p>
                      <p style="margin: 0 0 6px 0; font-size: 14px;"><strong>✉️ E-Mail:</strong> <a href="mailto:${safeEmail}" style="color: #0f3c5c; text-decoration: underline;">${safeEmail}</a></p>
                      <p style="margin: 0 0 6px 0; font-size: 14px;"><strong>📌 Betreff:</strong> ${safeSubject}</p>
                      <p style="margin: 0; font-size: 13px; color: #64748b;"><strong>🕒 Eingegangen:</strong> ${nowFormatted} Uhr</p>
                    </div>
                    <div style="margin-top: 16px;">
                      <h4 style="margin: 0 0 8px 0; font-size: 13px; text-transform: uppercase; color: #64748b; letter-spacing: 0.5px;">Mitteilung:</h4>
                      <div style="background: #ffffff; border-left: 4px solid #0f3c5c; padding: 14px 16px; font-size: 15px; line-height: 1.6; color: #334155; border: 1px solid #e2e8f0; border-left-width: 4px; border-radius: 4px;">
                        ${safeMessage}
                      </div>
                    </div>
                    <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; line-height: 1.5;">
                      💡 <strong>Hinweis:</strong> Du kannst direkt auf diese E-Mail antworten, um mit <strong>${safeName}</strong> in Kontakt zu treten (Reply-To ist auf <em>${safeEmail}</em> hinterlegt).
                    </div>
                  </div>
                </div>
              </body>
              </html>
            `;

            // 3. Zentrale Supabase Mail-Engine aufrufen (Empfänger dynamisch via Info_Mail_Kontakt_Website)
            const mailPayload = {
                systemMailKey: 'Info_Mail_Kontakt_Website',
                subject: `[Website Kontakt] ${subject} (${name})`,
                replyTo: email,
                senderName: 'Sportschützen Muhen Website',
                html: mailHtml,
                text: `Neue Website-Kontaktanfrage von ${name} (${email})\nEingegangen: ${nowFormatted} Uhr\nBetreff: ${subject}\n\nNachricht:\n${message}`,
                module: 'website',
                moduleRef: 'kontakt',
                recordId: contactRecordId
            };

            const mailRes = await fetchWithTimeout(`${SUPABASE_FUNCTIONS_URL}/send-email`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                },
                body: JSON.stringify(mailPayload)
            }, 12000);

            if (!mailRes.ok) {
                const errJson = await mailRes.json().catch(() => ({}));
                throw new Error(errJson.error || `Server meldete HTTP ${mailRes.status}`);
            }

            status.style.display = "block";
            status.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
            status.style.color = "#10b981";
            status.style.border = "1px solid rgba(16, 185, 129, 0.2)";
            status.innerText = "Vielen Dank! Deine Nachricht wurde erfolgreich an uns übermittelt. Wir setzen uns bald mit dir in Verbindung.";
            form.reset();
            validatedFields.forEach((el) => {
                delete el.dataset.touched;
                el.removeAttribute('aria-invalid');
            });

        } catch (error) {
            console.error("Kontaktformular Fehler:", error);
            status.style.display = "block";
            status.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
            status.style.color = "#ef4444";
            status.style.border = "1px solid rgba(239, 68, 68, 0.2)";
            status.innerText = "Fehler: " + (error.message || "Die Nachricht konnte nicht gesendet werden. Bitte versuche es später erneut oder kontaktiere uns direkt per E-Mail.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
        }
    });
}

// Hilfsfunktion: Betreff im Kontaktformular vorwählen
window.preselectContactSubject = function(type) {
    const sel = document.getElementById('contact-subject');
    if (!sel) return;
    if (type === 'schnuppern') {
        sel.value = 'Schnuppertraining / Schiesssport';
    } else if (type === 'vermietung') {
        sel.value = 'Vermietung Schützenstube (Anfrage & Termine)';
    }
};

})(window);


