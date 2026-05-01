const WORKER_TERMINE_URL = "https://termine.dan-hunziker73.workers.dev?action=getTermine";
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzi9BVdewuF-HTXB1ruwdap5C1pLyobj6XZsgJV6XFLVQDLUU3jPYvx727tzC1y3NM/exec";
const EVENTPLANER_URL = "https://github-dropdown-refresh.dan-hunziker73.workers.dev";

let allTermine = [];
let touchStart = 0;
const spinner = document.getElementById('pull-spinner');

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

        const [resWorker, resGoogle, resRSVP] = await Promise.all([
            safeFetch(WORKER_TERMINE_URL),
            safeFetch(GOOGLE_SCRIPT_URL),
            safeFetch(`${EVENTPLANER_URL}?action=getRSVPEvents&lizenz=${activeLizenz}`)
        ]);

        let rawData = [
            ...resWorker.map(t => ({...t, typ: 'verein'})),
            ...resGoogle.map(t => ({...t, typ: 'extern'})),
            ...resRSVP.map(t => ({
                ...t, 
                typ: 'verein', 
                isRSVP: true, 
                titel: t.title,
                frage_begleitung: t.frage_begleitung,
                frage_essen: t.frage_essen
            }))
        ];

        // --- INVASIVE DUBLETTEN-PRÜFUNG ---
        // Wir verhindern, dass Termine, die in beiden Quellen stehen, doppelt erscheinen.
        const merged = [];
        const seen = new Set();

        rawData.forEach(t => {
            // Eindeutiger Key: Datum + Titel-Anfang
            const dKey = t.datum_iso || t.datum;
            const tKey = t.titel.substring(0, 15).toLowerCase();
            const uniqueKey = `${dKey}_${tKey}`;

            if (!seen.has(uniqueKey)) {
                merged.push(t);
                seen.add(uniqueKey);
            } else if (t.typ === 'verein') {
                // Falls bereits vorhanden, aber der aktuelle vom Verein ist, 
                // überschreiben wir den externen (Vereinsdaten sind meist präziser)
                const idx = merged.findIndex(m => 
                    (m.datum_iso || m.datum) === dKey && 
                    m.titel.substring(0, 15).toLowerCase() === tKey
                );
                if (idx !== -1) merged[idx] = t;
            }
        });

        // --- SORTIERUNG ---
        allTermine = merged.sort((a, b) => {
            const parse = (obj) => {
                if (obj.datum_iso) return new Date(obj.datum_iso);
                if (obj.datum && obj.datum.includes('.')) {
                    const [d, m, y] = obj.datum.split('.');
                    return new Date(y, m - 1, d);
                }
                return new Date(8640000000000000);
            };
            return parse(a) - parse(b);
        });
// Vergangene Termine entfernen (heute wird noch angezeigt)
const today = new Date();
today.setHours(0,0,0,0);

allTermine = allTermine.filter(t => {
    const parse = (obj) => {
        if (obj.datum_iso) return new Date(obj.datum_iso);
        if (obj.datum && obj.datum.includes('.')) {
            const [d, m, y] = obj.datum.split('.');
            return new Date(y, m - 1, d);
        }
        return null;
    };

    const dateObj = parse(t);
    if (!dateObj) return false;

    dateObj.setHours(0,0,0,0);
    return dateObj >= today;
});

allTermine = applyRundenPrefix(allTermine);
renderTermine(allTermine);

    } catch (e) { 
        wrap.innerHTML = "Fehler beim Laden."; 
    }
}

function renderTermine(data) {
    const wrap = document.getElementById("termine");
    const heroWrap = document.getElementById("hero-rsvps");
    const currentYear = new Date().getFullYear();
    const months = ["Jan.", "Feb.", "März", "April", "Mai", "Juni", "Juli", "Aug.", "Sept.", "Okt.", "Nov.", "Dez."];
    const days = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];

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
        let dObj;
        if (t.datum_iso) dObj = new Date(t.datum_iso);
        else if (t.datum && t.datum.includes('.')) {
            const [d, m, y] = t.datum.split('.');
            dObj = new Date(y, m - 1, d);
        } else return; // Ohne Datum kein Eintrag

        const weekday = days[dObj.getDay()];
        const dateDisplay = `${dObj.getDate()}. ${months[dObj.getMonth()]}`;
        const yearVal = dObj.getFullYear();
        const subLine = (yearVal !== currentYear) ? `${weekday} '${yearVal.toString().substring(2)}` : weekday;

        // HERO CARD RENDERING
        if (t.isRSVP && heroWrap) {
            const hasAnswered = t.attending === true || t.attending === "true" || t.attending === false || t.attending === "false";
            const isAttending = t.attending === true || t.attending === "true";
            
            let onYesClick = `submitRSVP('${t.id}', true)`;
            if (t.frage_begleitung || t.frage_essen) {
                onYesClick = `openRSVPForm('${t.id}', ${!!t.frage_begleitung}, ${!!t.frage_essen})`;
            }

            let bodyContent = '';
            
            if (isAttending) {
                bodyContent = `<div class="hero-chip success" style="margin-bottom:0; align-self:center;">✅ Angemeldet</div>`;
                if (t.frage_begleitung || t.frage_essen) {
                    bodyContent += `<button class="hero-link" style="color:var(--primary); font-weight:bold; margin-top:5px;" onclick="${onYesClick}">Details ändern</button>`;
                }
                bodyContent += `<button class="hero-link" style="margin-top:5px;" onclick="submitRSVP('${t.id}', false)">Absagen</button>`;

            } else if (hasAnswered && !isAttending) {
                bodyContent = `<div class="hero-chip error" style="align-self:center;">❌ Abgemeldet</div><button class="hero-link" onclick="${onYesClick}">Doch Anmelden</button>`;
            } else {
                bodyContent = `
                    <h3 style="margin-top:0; color:#1e293b; font-size:1.2rem;">${t.titel}</h3>
                    <p style="color:#64748b; font-size:0.9rem; font-weight:600; margin-bottom:15px;">📅 ${dateDisplay} ${yearVal !== currentYear ? yearVal : ''}</p>
                    <p class="hero-subtitle">Bist du dabei?</p>
                    <div class="hero-actions">
                        <button class="hero-btn success" onclick="${onYesClick}">Ja, sicher</button>
                        <button class="hero-btn error" onclick="submitRSVP('${t.id}', false)">Nein</button>
                    </div>`;
            }

            if (t.showParticipants) {
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

            return; // Beende Schleife für diesen Termin, weil er NICHT in die normale Liste soll
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
            </div>
        </div>`;
    });

    if (normalCount === 0) wrap.innerHTML = "Keine Termine gefunden.";
}

function filterTermine(type, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if(type === 'all') renderTermine(allTermine);
    else renderTermine(allTermine.filter(t => t.typ === type));
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

    if (userStr) {
        let user = JSON.parse(userStr);
        // Migration: Falls Lizenz noch nicht sechstellig ist
        if (user.lizenz && user.lizenz.length < 6 && !isNaN(user.lizenz)) {
            user.lizenz = user.lizenz.padStart(6, '0');
            localStorage.setItem('sportschuetzen_user', JSON.stringify(user));
        }
        syncOneSignal(user);
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

        try {
            try {
                let r = await fetch(`${EVENTPLANER_URL}?action=getMembers&type=member`);
                if(!r.ok) throw new Error("Backend nicht erreichbar");
                allUsers = await r.json();
            } catch(e) {
                console.error("Backend nicht erreichbar, kein Fallback verfügbar:", e);
                allUsers = [];
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
        const result = await resp.json();

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
            document.getElementById('login-overlay').style.display = 'none';
            showApp(userData);
        } else {
            errorDiv.textContent = result.error || "Login fehlgeschlagen.";
            errorDiv.style.display = 'block';
        }
    } catch (e) {
        errorDiv.textContent = "Verbindungsfehler zum Backend.";
        errorDiv.style.display = 'block';
    } finally {
        document.getElementById('login-btn').textContent = "Einloggen";
    }
});

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
        try {
            if (user && user.lizenz) {
                const pid = String(user.lizenz).padStart(6, '0');
                
                // Nur einloggen wenn nicht bereits diese ID gesetzt ist
                if (OneSignal.User.externalId !== pid) {
                    await OneSignal.login(pid);
                    console.log("OneSignal: Identität synchronisiert für PID", pid);
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
window.openRSVPForm = function(eventId, asksBegleitung, asksEssen) {
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
                <input type="number" id="input-count-${eventId}" value="1" min="1" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem;">
            </div>
        `;
    }

    if (asksEssen) {
        html += `
            <div>
                <label style="font-size:0.9rem; font-weight:bold; color:#475569;">Anzahl Menüs (Essen):</label>
                <input type="number" id="input-essen-${eventId}" value="1" min="0" max="10" style="width:100%; padding:10px; border-radius:8px; border:1px solid #cbd5e1; margin-top:5px; font-size:1rem;">
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

window.submitRSVP = async function(eventId, attending) {
    const user = JSON.parse(localStorage.getItem('sportschuetzen_user'));
    if (!user) return;
    
    let count = 1;
    let essen = 0;
    
    if (attending) {
        const countInput = document.getElementById(`input-count-${eventId}`);
        if (countInput) count = parseInt(countInput.value) || 1;
        
        const essenInput = document.getElementById(`input-essen-${eventId}`);
        if (essenInput) essen = parseInt(essenInput.value) || 0;
    }
    
    document.getElementById(`rsvp-${eventId}`).innerHTML = `<span style="font-size:0.8rem; color:white; font-weight:bold;">Verarbeite...</span>`;

    try {
        // Sicherstellen dass Lizenz sechstellig ist
        const cleanLizenz = String(user.lizenz).padStart(6, '0');
        const resp = await fetch(`${EVENTPLANER_URL}?action=setRSVP&eventid=${eventId}&lizenz=${cleanLizenz}&attending=${attending}&count=${count}&essen=${essen}`);
        const result = await resp.json();
        if (!result.success) throw new Error("Serverfehler beim Speichern");
        
        loadTermine(); // Nur bei Erfolg neu laden
    } catch(e) { 
        console.error(e);
        alert("Fehler: Deine Antwort konnte nicht gespeichert werden. Bitte versuche es erneut.");
    }
};

window.showParticipants = async function(eventId) {
    const modal = document.getElementById('participant-modal');
    const list = document.getElementById('participant-list');
    list.innerHTML = '<li>Lade Teilnehmer...</li>';
    modal.style.display = 'flex';
    
    try {
        const res = await fetch(`${EVENTPLANER_URL}?action=getParticipants&eventid=${eventId}`);
        if(res.ok) {
            const data = await res.json();
            list.innerHTML = data.length ? data.map(n => `<li><span>${n.name}</span> <span class="status-yes">✅</span></li>`).join('') 
                                         : '<li>Noch keine Anmeldungen.</li>';
        } else throw new Error();
    } catch(e) { list.innerHTML = '<li style="color:red;">Fehler beim Laden.</li>'; }
};

window.closeParticipantsModal = function() {
    document.getElementById('participant-modal').style.display = 'none';
};
