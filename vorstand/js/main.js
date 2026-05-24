// =========================================================
//  ZENTRALE UTILITIES (XSS-Schutz)
// =========================================================
function escapeHtml(str) {
    return String(str || "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

// Escapes a value for safe embedding inside a JS string in an HTML attribute (onclick="...")
function escapeJs(str) {
    return String(str || '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")   
        .replace(/"/g, '\\"')
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');
}

// Converts ISO date (YYYY-MM-DD) → display format (DD.MM.YYYY)
function isoToDisplay(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        const [y, m, d] = s.split('T')[0].split('-');
        return `${d}.${m}.${y}`;
    }
    return s;
}

// Converts display format (DD.MM.YYYY) → ISO (YYYY-MM-DD)
function displayToIso(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (/^\d{1,2}\.\d{1,2}\.\d{4}$/.test(s)) {
        const [d, m, y] = s.split('.');
        return `${y}-${m.padStart(2,'0')}-${d.padStart(2,'0')}`;
    }
    return s;
}

// =========================================================
//  ZENTRALES STATE-MANAGEMENT
// =========================================================
const AppState = {
    _listeners: {},
    
    // State-Objekt
    state: {
        currentUser: null,
        currentRoles: [],
        userRole: null,
        hasUnsavedChanges: false,
        isLoading: false,
        loadingMessage: '',
        lastError: null
    },
    
    // Subscribe für State-Änderungen
    subscribe(key, callback) {
        if (!this._listeners[key]) this._listeners[key] = [];
        this._listeners[key].push(callback);
        return () => {
            this._listeners[key] = this._listeners[key].filter(cb => cb !== callback);
        };
    },
    
    // State setzen mit Benachrichtigung
    set(key, value) {
        const oldValue = this.state[key];
        this.state[key] = value;
        if (this._listeners[key]) {
            this._listeners[key].forEach(cb => cb(value, oldValue));
        }
        if (this._listeners['*']) {
            this._listeners['*'].forEach(cb => cb(key, value, oldValue));
        }
    },
    
    // State holen
    get(key) {
        return this.state[key];
    },
    
    // Markieren als ungespeichert
    markUnsaved() {
        this.set('hasUnsavedChanges', true);
    },
    
    // Markieren als gespeichert
    clearUnsaved() {
        this.set('hasUnsavedChanges', false);
    },
    
    // Ladezustand setzen
    setLoading(isLoading, message = '') {
        this.set('isLoading', isLoading);
        this.set('loadingMessage', message);
    },
    
    // Fehler setzen
    setError(error) {
        this.set('lastError', error);
        if (error) {
            console.error('App Error:', error);
        }
    },
    
    // Fehler löschen
    clearError() {
        this.set('lastError', null);
    }
};

// =========================================================
//  EINHEITLICHE FEHLERBEHANDLUNG
// =========================================================
function showError(message, duration = 5000) {
    AppState.setError(message);
    
    // Toast erstellen
    const toast = document.createElement('div');
    toast.className = 'toast-container position-fixed top-0 end-0 p-3';
    toast.style.zIndex = '9999';
    toast.innerHTML = `
        <div class="toast show bg-danger text-white" role="alert">
            <div class="toast-body d-flex align-items-center">
                <i class="fas fa-exclamation-circle me-2"></i>
                <span>${escapeHtml(message)}</span>
                <button type="button" class="btn-close btn-close-white ms-auto" onclick="this.closest('.toast').remove(); AppState.clearError();"></button>
            </div>
        </div>`;
    document.body.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            toast.remove();
            AppState.clearError();
        }, duration);
    }
}

function showSuccess(message, duration = 3000) {
    const toast = document.createElement('div');
    toast.className = 'toast-container position-fixed top-0 end-0 p-3';
    toast.style.zIndex = '9999';
    toast.innerHTML = `
        <div class="toast show bg-success text-white" role="alert">
            <div class="toast-body d-flex align-items-center">
                <i class="fas fa-check-circle me-2"></i>
                <span>${escapeHtml(message)}</span>
                <button type="button" class="btn-close btn-close-white ms-auto" onclick="this.closest('.toast').remove();"></button>
            </div>
        </div>`;
    document.body.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => toast.remove(), duration);
    }
}

// =========================================================
//  VALIDIERUNG
// =========================================================
const Validation = {
    // E-Mail validieren
    isEmail(str) {
        return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str);
    },
    
    // Telefonnummer (CH-Format)
    isPhoneCH(str) {
        return /^(\+41|0)\d{9}$/.test(str.replace(/\s/g, ''));
    },
    
    // Datum (CH-Format TT.MM.JJJJ)
    isDateCH(str) {
        if (!str) return false;
        const parts = str.split('.');
        if (parts.length !== 3) return false;
        const day = parseInt(parts[0], 10);
        const month = parseInt(parts[1], 10);
        const year = parseInt(parts[2], 10);
        return day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 1900;
    },
    
    // Zahl
    isNumber(str) {
        return !isNaN(parseFloat(str)) && isFinite(str);
    },
    
    // Pflichtfeld
    required(str) {
        return str && str.trim().length > 0;
    },
    
    // Mindestlänge
    minLength(str, len) {
        return str && str.length >= len;
    },
    
    // Maximallänge
    maxLength(str, len) {
        return !str || str.length <= len;
    },
    
    // Formular validieren und Fehler anzeigen
    validateForm(formId, rules) {
        const form = document.getElementById(formId);
        if (!form) return true;
        
        let isValid = true;
        const errors = [];
        
        for (const [fieldId, fieldRules] of Object.entries(rules)) {
            const field = form.querySelector(`[name="${fieldId}"]`) || document.getElementById(fieldId);
            if (!field) continue;
            
            const value = field.value || '';
            
            for (const rule of fieldRules) {
                let valid = true;
                let message = '';
                
                switch (rule.type) {
                    case 'required':
                        valid = this.required(value);
                        message = rule.message || 'Pflichtfeld';
                        break;
                    case 'email':
                        valid = !value || this.isEmail(value);
                        message = rule.message || 'Ungültige E-Mail';
                        break;
                    case 'phone':
                        valid = !value || this.isPhoneCH(value);
                        message = rule.message || 'Ungültige Telefonnummer';
                        break;
                    case 'date':
                        valid = !value || this.isDateCH(value);
                        message = rule.message || 'Ungültiges Datum';
                        break;
                    case 'number':
                        valid = !value || this.isNumber(value);
                        message = rule.message || 'Keine Zahl';
                        break;
                    case 'minLength':
                        valid = this.minLength(value, rule.value);
                        message = rule.message || `Mindestens ${rule.value} Zeichen`;
                        break;
                    case 'maxLength':
                        valid = this.maxLength(value, rule.value);
                        message = rule.message || `Maximal ${rule.value} Zeichen`;
                        break;
                }
                
                if (!valid) {
                    isValid = false;
                    errors.push({ field: fieldId, message });
                    field.classList.add('is-invalid');
                } else {
                    field.classList.remove('is-invalid');
                }
            }
        }
        
        if (!isValid) {
            showError(errors.map(e => e.message).join(', '));
        }
        
        return isValid;
    }
};

// =========================================================
//  LADEZUSTAND (Loading Overlay)
// =========================================================
function showLoadingOverlay(message = 'Lade...') {
    console.log('🔌 showLoadingOverlay called with message:', message);
    let overlay = document.getElementById('global-loading-overlay');
    if (!overlay) {
        console.log('🔌 overlay not found in DOM, creating new one');
        overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.className = 'position-fixed top-0 start-0 w-100 h-100 d-flex align-items-center justify-content-center d-none';
        overlay.style.background = 'rgba(255,255,255,0.9)';
        overlay.style.zIndex = '9998';
        overlay.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary mb-2" role="status"></div>
                <div class="text-muted" id="global-loading-message">${escapeHtml(message)}</div>
            </div>`;
        document.body.appendChild(overlay);
    }
    const msgEl = document.getElementById('global-loading-message');
    if (msgEl) msgEl.textContent = message;
    overlay.classList.remove('d-none');
    try {
        AppState.setLoading(true, message);
    } catch(e) {
        console.error('🔌 Error in AppState.setLoading:', e);
    }
}

function hideLoadingOverlay() {
    console.log('🔌 hideLoadingOverlay called');
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) {
        console.log('🔌 overlay found, adding d-none class');
        overlay.classList.add('d-none');
    } else {
        console.warn('🔌 overlay NOT found in DOM!');
    }
    try {
        AppState.setLoading(false, '');
    } catch(e) {
        console.error('🔌 Error in AppState.setLoading:', e);
    }
}

// Wrapper für API-Calls mit Ladezustand
async function apiFetchWithLoading(module, paramsString, options = {}) {
    showLoadingOverlay(options.loadingMessage || 'Lade Daten...');
    try {
        const result = await apiFetch(module, paramsString, options);
        return result;
    } catch (e) {
        showError('Fehler: ' + e.message);
        throw e;
    } finally {
        hideLoadingOverlay();
    }
}

// =========================================================
//  APP INITIALISIERUNG & STATUS
// =========================================================

// Alte globale Variablen (für Abwärtskompatibilität) - jetzt mit AppState synchronisiert
window.hasUnsavedChanges = false;
window.markUnsaved = function() { 
    window.hasUnsavedChanges = true; 
    AppState.markUnsaved();
};
window.clearUnsaved = function() { 
    window.hasUnsavedChanges = false; 
    AppState.clearUnsaved();
};

// State-Änderungen überwachen und globale Variablen aktualisieren
AppState.subscribe('currentUser', (val) => { window.currentUser = val; });
AppState.subscribe('currentRoles', (val) => { window.currentRoles = val; });
AppState.subscribe('userRole', (val) => { window.userRole = val; window.currentRole = val; });
AppState.subscribe('hasUnsavedChanges', (val) => { window.hasUnsavedChanges = val; });

window.onload = () => {
    const savedUser = localStorage.getItem('portal_user');
    const savedRole = localStorage.getItem('portal_role');
    const savedRoles = localStorage.getItem('portal_roles');
    
    if (savedUser && savedRole) {
        currentUser = savedUser;
        currentRoles = String(savedRoles || savedRole)
            .split(',')
            .map(r => String(r || '').trim().toLowerCase())
            .filter(Boolean);
        userRole = currentRoles[0] || savedRole;
        currentRole = userRole;
        
        // AppState initialisieren
        AppState.set('currentUser', currentUser);
        AppState.set('currentRoles', currentRoles);
        AppState.set('userRole', userRole);
        
        showApp();
        setupGlobalChangeTracking();
        
        // Warnung beim Verlassen der Seite
        window.addEventListener('beforeunload', (e) => {
            if(window.hasUnsavedChanges) {
                e.preventDefault();
                e.returnValue = 'Du hast ungespeicherte Änderungen!';
            }
        });
    } else {
        document.getElementById('login-screen').style.display = 'flex';
    }
};

function showApp() {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('app-screen').classList.remove('d-none');
    document.getElementById('app-screen').style.display = 'flex'; 
    
    const roles = Array.from(new Set(
        (currentRoles || [])
            .map(r => String(r || '').trim().toLowerCase())
            .filter(Boolean)
    ));
    const roleLabel = roles.length ? roles.join(', ') : 'gast';
    const primaryRole = roles[0] || 'gast';

    document.getElementById('user-info').innerText = `${currentUser} (${roleLabel})`;
    document.getElementById('user-badge-mobile').innerText = primaryRole;

    // Kacheln & Nav-Links nach data-roles filtern
    document.querySelectorAll('.role-protected').forEach(el => {
        const allowed = (el.dataset.roles || '')
            .split(',')
            .map(r => r.trim().toLowerCase())
            .filter(Boolean);
        // Kein data-roles → immer sichtbar
        if (allowed.length === 0) {
            el.classList.remove('d-none');
            return;
        }
        const visible = roles.some(r => allowed.includes(r));
        if (visible) {
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });

    // 1. Letzten Login ausgeben & in Modal einsetzen
    const lastLogin = localStorage.getItem('portal_last_login');
    const nowStr = new Date().toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    localStorage.setItem('portal_last_login', nowStr);

    const tsElem = document.getElementById('welcome-login-timestamp');
    if (tsElem) {
        tsElem.textContent = lastLogin || "Erste Anmeldung in dieser Sitzung";
    }

    // Modal Schritte zurücksetzen
    const step1 = document.getElementById('welcome-step-login');
    const step2 = document.getElementById('welcome-step-presence');
    if (step1 && step2) {
        step1.classList.remove('d-none');
        step2.classList.add('d-none');
    }

    const lastLoginBanner = document.getElementById('last-login-banner');
    if (lastLoginBanner) {
        if (lastLogin) {
            lastLoginBanner.innerHTML = `
                <div class="badge bg-light text-dark p-2 border shadow-sm animate__animated animate__fadeIn" style="font-size: 0.85rem; border-radius: 20px;">
                    <i class="fas fa-lock text-success me-1"></i> Letzter Login: ${escapeHtml(lastLogin)} <span class="badge bg-success ms-1">✓ Bestätigt</span>
                </div>
            `;
        } else {
            lastLoginBanner.innerHTML = `
                <div class="badge bg-light text-dark p-2 border shadow-sm animate__animated animate__fadeIn" style="font-size: 0.85rem; border-radius: 20px;">
                    <i class="fas fa-shield-alt text-primary me-1"></i> Erste Anmeldung in dieser Sitzung <span class="badge bg-info ms-1">Neu</span>
                </div>
            `;
        }
    }

    // Modal anzeigen
    setTimeout(() => {
        const welcomeModalEl = document.getElementById('welcome-security-modal');
        if (welcomeModalEl) {
            const welcomeModal = new bootstrap.Modal(welcomeModalEl);
            welcomeModal.show();
        }
    }, 200);

    // 2. Online-Präsenz pingen
    startPresencePingTimer();

    // Asynchronen Background Sync starten (alle 5 Minuten)
    startBackgroundSyncTimer();

    // Gestaffelte, priorisierte Ladereihenfolge im Hintergrund anstoßen (silenter Pre-fetch)
    setTimeout(startPreloadSequence, 100);
}

async function startPreloadSequence() {
    console.log("🚀 Gestaffeltes Bulk-Loading im Hintergrund gestartet...");
    
    // Phase 1 (Core - Immediate)
    await silentInitialLoad();
    
    // Phase 2 (nach 2 Sekunden): Termine & Umfragen
    setTimeout(async () => {
        if (window.hasUnsavedChanges) return;
        console.log("🕒 Phase 2 Preload (Termine, Umfragen) gestartet...");
        if (typeof loadTermineData === 'function') await loadTermineData();
        if (typeof loadUmfragenData === 'function') await loadUmfragenData();
    }, 2000);
    
    // Phase 3 (nach 5 Sekunden): Resultate, Team Manager, System-Mails, Logins
    setTimeout(async () => {
        if (window.hasUnsavedChanges) return;
        console.log("🕒 Phase 3 Preload (Resultate, Team Manager, System-Mails, Logins) gestartet...");
        if (typeof loadResultateData === 'function') await loadResultateData();
        if (typeof loadContestData === 'function') {
            await loadContestData('grenzland');
            await loadContestData('mannschaft');
            await loadContestData('gruppe');
        }
        if (typeof loadSystemMailsData === 'function') await loadSystemMailsData();
        if (typeof loadLoginsData === 'function' && userHasRole('admin')) await loadLoginsData();
    }, 5000);
    
    // Phase 4 (nach 8 Sekunden): Inventar (drittletztes)
    setTimeout(async () => {
        if (window.hasUnsavedChanges) return;
        console.log("🕒 Phase 4 Preload (Inventar) gestartet...");
        if (typeof loadInventarData === 'function') await loadInventarData();
    }, 8000);
    
    // Phase 5 (nach 11 Sekunden): Jahresmeisterschaft KK (zweitletztes)
    setTimeout(async () => {
        if (window.hasUnsavedChanges) return;
        console.log("🕒 Phase 5 Preload (Jahresmeisterschaft KK) gestartet...");
        if (typeof loadJahresmeisterschaftData === 'function') await loadJahresmeisterschaftData(false, true);
    }, 11000);
    
    // Phase 6 (nach 14 Sekunden): Vermietung (am Schluss / last)
    setTimeout(async () => {
        if (window.hasUnsavedChanges) return;
        console.log("🕒 Phase 6 Preload (Vermietung) gestartet...");
        if (typeof loadVermietungData === 'function') await loadVermietungData();
    }, 14000);
}

// =========================================================
//  ASYNCHRONER BACKGROUND SYNC (5-Minuten-Timer)
// =========================================================
let _backgroundSyncTimerId = null;

async function silentInitialLoad() {
    console.log("🚀 Initiales Bulk-Loading im Hintergrund gestartet...");
    try {
        // 1. Jahresbeitrag bulk load
        console.log("🔍 Checking loadJahresbeitragData: ", typeof loadJahresbeitragData);
        if (typeof loadJahresbeitragData === 'function') {
            const year = typeof window._jbYear !== 'undefined' ? window._jbYear : new Date().getFullYear();
            console.log("🔍 Fetching Jahresbeitrag APIs for year: ", year);
            const [beitraege, members, participations, positions] = await Promise.all([
                apiFetch('jahresbeitrag', `action=getBeitraege`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getMembers`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getParticipations`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getPositionen`).then(r => r.json())
            ]);

            console.log("🔍 Jahresbeitrag API success statuses:", {
                beitraege: beitraege.success,
                members: members.success,
                participations: participations.success,
                positions: positions.success
            });

            if (beitraege.success && members.success && participations.success && positions.success) {
                window._jbMembers = (members.data || []).filter(m => m.IsActive == 1 && m.Deceased != 1);
                window._jbMemberMap = {};
                (members.data || []).forEach(m => { 
                    window._jbMemberMap[String(m.PersonNumber)] = m; 
                });
                
                window._jbAllBeitraege = beitraege.data || [];
                window._jbAllParticipations = participations.data || [];
                window._jbAllPositions = positions.positions || [];
                
                window._jbData = window._jbAllBeitraege.filter(h => Number(h.year) === Number(year));

                window._jbParticipationsCache = {};
                window._jbAllParticipations.forEach(p => {
                    if (Number(p.year) === Number(year)) {
                        const pn = String(p.PersonNumber).trim();
                        if (!window._jbParticipationsCache[pn]) window._jbParticipationsCache[pn] = [];
                        window._jbParticipationsCache[pn].push(p);
                    }
                });

                window._jbPositionsCache = {};
                window._jbAllPositions.forEach(p => {
                    if (Number(p.year) === Number(year)) {
                        const hid = String(p.headerid).trim();
                        if (!window._jbPositionsCache[hid]) window._jbPositionsCache[hid] = [];
                        window._jbPositionsCache[hid].push(p);
                    }
                });

                if (typeof jbApplyTableSorting === 'function') jbApplyTableSorting();
                if (typeof jbApplySidebarSorting === 'function') jbApplySidebarSorting();
                
                const activeView = document.querySelector('.module-view.active');
                const activeViewId = activeView ? activeView.id.replace('view-', '') : '';
                if (activeViewId === 'jahresbeitrag' && typeof renderJahresbeitragView === 'function') {
                    renderJahresbeitragView();
                }
                console.log("✅ Initiales Bulk-Loading: Jahresbeitrag geladen.");
            }
        }

        // 2. Mitglieder bulk load
        if (typeof loadMitgliederData === 'function') {
            const [resAll, resLizz, resFn, resHist] = await Promise.all([
                apiFetch('mitglieder', 'action=getAll'),
                apiFetch('mitglieder', 'action=getLizenzen'),
                apiFetch('mitglieder', 'action=getFunktionen'),
                apiFetch('mitglieder', 'action=getHistorie')
            ]);

            const data = await resAll.json();
            const lizzData = await resLizz.json();
            const fnData = await resFn.json();
            const histData = await resHist.json();

            if (data.success && lizzData.success && fnData.success && histData.success) {
                window._mglData = Array.isArray(data.data) ? data.data : [];

                window._mglLizenzenCache = {};
                lizzData.data.forEach(l => {
                    const pnKey = String(l.PersonNumber || '').trim();
                    if (pnKey) {
                        if (!window._mglLizenzenCache[pnKey]) window._mglLizenzenCache[pnKey] = [];
                        window._mglLizenzenCache[pnKey].push(l);
                    }
                });

                window._mglFunktionenCache = {};
                fnData.data.forEach(f => {
                    const pnKey = String(f.PersonNumber || '').trim();
                    if (pnKey) {
                        if (!window._mglFunktionenCache[pnKey]) window._mglFunktionenCache[pnKey] = [];
                        window._mglFunktionenCache[pnKey].push(f);
                    }
                });

                window._mglHistoryCache = {};
                histData.data.forEach(h => {
                    const pnKey = String(h.PersonNumber || '').trim();
                    if (pnKey) {
                        if (!window._mglHistoryCache[pnKey]) window._mglHistoryCache[pnKey] = [];
                        window._mglHistoryCache[pnKey].push(h);
                    }
                });

                const activeView = document.querySelector('.module-view.active');
                const activeViewId = activeView ? activeView.id.replace('view-', '') : '';
                if (activeViewId === 'mitglieder') {
                    if (typeof renderMitgliederView === 'function') renderMitgliederView(window._mglData);
                    if (typeof mglFilter === 'function') mglFilter();
                }
                console.log("✅ Initiales Bulk-Loading: Mitglieder geladen.");
            }
        }
        console.log("🚀 Initiales Bulk-Loading erfolgreich abgeschlossen.");
    } catch (e) {
        console.error("❌ Fehler beim initialen Bulk-Loading:", e);
    }
}

async function runBackgroundSync() {
    // Wenn es ungespeicherte Änderungen gibt, überspringen wir den Sync,
    // um ein Überschreiben aktiver Benutzereingaben zu verhindern.
    if (window.hasUnsavedChanges) {
        console.log("🔄 Background Sync: Übersprungen wegen ungespeicherten Änderungen");
        return;
    }

    console.log("🔄 Background Sync: Starte Synchronisation im Hintergrund...");

    try {
        const activeView = document.querySelector('.module-view.active');
        const activeViewId = activeView ? activeView.id.replace('view-', '') : '';

        // 1. Synchronisierung Jahresbeitrag (Alle Jahre im Hintergrund)
        if (typeof loadJahresbeitragData === 'function') {
            const year = typeof window._jbYear !== 'undefined' ? window._jbYear : new Date().getFullYear();
            console.log(`🔄 Background Sync: Lade Jahresbeitrag für alle Jahre...`);

            const [beitraege, members, participations, positions] = await Promise.all([
                apiFetch('jahresbeitrag', `action=getBeitraege`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getMembers`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getParticipations`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getPositionen`).then(r => r.json())
            ]);

            if (beitraege.success && members.success && participations.success && positions.success) {
                window._jbMembers = (members.data || []).filter(m => m.IsActive == 1 && m.Deceased != 1);
                window._jbMemberMap = {};
                (members.data || []).forEach(m => { 
                    window._jbMemberMap[String(m.PersonNumber)] = m; 
                });
                
                window._jbAllBeitraege = beitraege.data || [];
                window._jbAllParticipations = participations.data || [];
                window._jbAllPositions = positions.positions || [];
                
                window._jbData = window._jbAllBeitraege.filter(h => Number(h.year) === Number(year));

                window._jbParticipationsCache = {};
                window._jbAllParticipations.forEach(p => {
                    if (Number(p.year) === Number(year)) {
                        const pn = String(p.PersonNumber).trim();
                        if (!window._jbParticipationsCache[pn]) window._jbParticipationsCache[pn] = [];
                        window._jbParticipationsCache[pn].push(p);
                    }
                });

                window._jbPositionsCache = {};
                window._jbAllPositions.forEach(p => {
                    if (Number(p.year) === Number(year)) {
                        const hid = String(p.headerid).trim();
                        if (!window._jbPositionsCache[hid]) window._jbPositionsCache[hid] = [];
                        window._jbPositionsCache[hid].push(p);
                    }
                });

                if (typeof jbApplyTableSorting === 'function') jbApplyTableSorting();
                if (typeof jbApplySidebarSorting === 'function') jbApplySidebarSorting();

                if (activeViewId === 'jahresbeitrag' && typeof renderJahresbeitragView === 'function') {
                    renderJahresbeitragView();
                }
                console.log("✅ Background Sync: Jahresbeitrag erfolgreich synchronisiert.");
            }
        }

        // 2. Synchronisierung Mitglieder
        if (typeof loadMitgliederData === 'function') {
            console.log("🔄 Background Sync: Lade Mitglieder & Details...");

            const [resAll, resLizz, resFn, resHist] = await Promise.all([
                apiFetch('mitglieder', 'action=getAll'),
                apiFetch('mitglieder', 'action=getLizenzen'),
                apiFetch('mitglieder', 'action=getFunktionen'),
                apiFetch('mitglieder', 'action=getHistorie')
            ]);

            const data = await resAll.json();
            const lizzData = await resLizz.json();
            const fnData = await resFn.json();
            const histData = await resHist.json();

            if (data.success && lizzData.success && fnData.success && histData.success) {
                window._mglData = Array.isArray(data.data) ? data.data : [];

                window._mglLizenzenCache = {};
                lizzData.data.forEach(l => {
                    const pnKey = String(l.PersonNumber || '').trim();
                    if (pnKey) {
                        if (!window._mglLizenzenCache[pnKey]) window._mglLizenzenCache[pnKey] = [];
                        window._mglLizenzenCache[pnKey].push(l);
                    }
                });

                window._mglFunktionenCache = {};
                fnData.data.forEach(f => {
                    const pnKey = String(f.PersonNumber || '').trim();
                    if (pnKey) {
                        if (!window._mglFunktionenCache[pnKey]) window._mglFunktionenCache[pnKey] = [];
                        window._mglFunktionenCache[pnKey].push(f);
                    }
                });

                window._mglHistoryCache = {};
                histData.data.forEach(h => {
                    const pnKey = String(h.PersonNumber || '').trim();
                    if (pnKey) {
                        if (!window._mglHistoryCache[pnKey]) window._mglHistoryCache[pnKey] = [];
                        window._mglHistoryCache[pnKey].push(h);
                    }
                });

                if (activeViewId === 'mitglieder') {
                    if (typeof renderMitgliederView === 'function') renderMitgliederView(window._mglData);
                    if (typeof mglFilter === 'function') mglFilter();
                }
                console.log("✅ Background Sync: Mitglieder erfolgreich synchronisiert.");
            }
        }
        
        console.log("✅ Background Sync: Erfolgreich abgeschlossen.");
    } catch (err) {
        console.error("❌ Fehler beim Background Sync:", err);
    }
}

function startBackgroundSyncTimer() {
    if (_backgroundSyncTimerId) return;
    console.log("⏰ Background Sync: Timer gestartet (Intervall: 5 Minuten)");
    _backgroundSyncTimerId = setInterval(runBackgroundSync, 300000); // alle 5 Minuten
}

// Globale Event Listener für Formular-Änderungen in allen views
function setupGlobalChangeTracking() {
    const handler = (e) => {
        if (!e.isTrusted) return; // Nur echte Nutzer-Eingaben
        const tgt = e.target;
        if(tgt && (tgt.classList.contains('write-protected') || tgt.closest('.write-protected'))) {
            if(!tgt.id || (!tgt.id.toLowerCase().includes('search') && !tgt.id.toLowerCase().includes('filter'))) {
                window.markUnsaved();
            }
        }
    };
    document.body.addEventListener('input', handler);
    document.body.addEventListener('change', handler);
}

// Hilfsfunktion zur Rollenprüfung
function userHasRole(requiredRole) {
    if (!currentRoles || currentRoles.length === 0) return false;
    return currentRoles.includes(requiredRole.toLowerCase());
}

// Matrix-Prüfung für Schreibrechte
function hasWriteAccess(module) {
    if (userHasRole('admin')) return true; // Admin darf (fast) alles schreiben

    const writeRoles = {
        'inventar':            ['schuetzenmeister', 'kassier', 'admin', 'aktuar', 'vorstand'],
        'termine':             ['schuetzenmeister', 'admin', 'aktuar', 'vorstand'],
        'gv':                  ['admin', 'aktuar', 'vorstand'],
        'system-mails':        ['schuetzenmeister', 'kassier', 'admin', 'aktuar', 'vorstand'],
        'umfragen':            ['schuetzenmeister', 'kassier', 'admin', 'aktuar', 'vorstand'],
        'manager':             ['schuetzenmeister', 'admin', 'vorstand'],
        'resultate':           ['schuetzenmeister', 'admin', 'vorstand'],
        'vermietung':          ['vermieter', 'admin', 'kassier', 'vorstand'],
        'jahresmeisterschaft': ['schuetzenmeister', 'kassier', 'admin', 'aktuar', 'vorstand'],
        'jahresmeisterschaft-kk': ['schuetzenmeister', 'kassier', 'admin', 'aktuar', 'vorstand'],
        'mail':                ['schuetzenmeister', 'kassier', 'admin', 'aktuar', 'vorstand'],
        'jahresbeitrag':       ['admin', 'kassier', 'vorstand'],
        'mitglieder':          ['admin', 'schuetzenmeister', 'aktuar', 'vorstand'],
        'logins':              ['admin']
    };

    const allowedRoles = writeRoles[module] || [];
    return currentRoles.some(r => allowedRoles.includes(r));
}

function navTo(viewId, el) {
    if (window.hasUnsavedChanges) {
        if (!confirm("⚠️ Modul wechseln?\n\nDu hast ungespeicherte Änderungen. Wenn du fortfährst, gehen diese verloren.")) {
            return;
        }
        window.clearUnsaved();
    }

    // 1. Nav-Links
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    if (el) el.classList.add('active');

    // 2. Teardowns (VOR dem View-Wechsel)
    if (viewId !== 'manager'  && typeof teardownManager  === 'function') teardownManager();
    if (viewId !== 'inventar' && typeof teardownInventar === 'function') teardownInventar();

    // 3. View wechseln
    document.querySelectorAll('.module-view').forEach(v => v.classList.remove('active'));

    const targetView = document.getElementById('view-' + viewId);
    if (targetView) {
        targetView.classList.add('active');
        
        // NEU: Globale Schreibrecht-Prüfung für das geladene Modul anwenden
        const canWrite = hasWriteAccess(viewId);
        const protectedElements = targetView.querySelectorAll('.write-protected');
        protectedElements.forEach(el => {
            if (canWrite) {
                el.classList.remove('d-none');
                el.removeAttribute('disabled');
                // Falls es inputs sind, readonly entfernen
                if(el.tagName === 'INPUT' || el.tagName === 'SELECT' || el.tagName === 'TEXTAREA') {
                    el.removeAttribute('readonly'); 
                    // select können z.T. disabled bleiben
                    if(el.dataset.wasDisabled) {
                        // custom logik falls nötig, aber in der Regel:
                    }
                }
            } else {
                if(el.tagName === 'BUTTON' || el.classList.contains('btn')) {
                    el.classList.add('d-none'); // Buttons gleich unsichtbar machen
                } else {
                    el.setAttribute('disabled', 'true');
                    el.setAttribute('readonly', 'true');
                }
            }
        });
        
    } else {
        console.error("View nicht gefunden: view-" + viewId);
    }

    closeSidebarMobile();

    // 4. Module laden
    if (viewId === 'inventar'  && typeof loadInventarData  === 'function') loadInventarData();
    if (viewId === 'termine'   && typeof loadTermineData   === 'function') loadTermineData();
    if (viewId === 'resultate' && typeof loadResultateData === 'function') loadResultateData();
    if (viewId === 'manager'   && typeof loadContestData   === 'function') loadContestData();
    if (viewId === 'vermietung' && typeof loadVermietungData === 'function') loadVermietungData();
    // NEU: GV & Mails & Logins
    if (viewId === 'gv' && typeof loadGVData === 'function') loadGVData();
    if (viewId === 'system-mails' && typeof loadSystemMailsData === 'function') loadSystemMailsData();
    if (viewId === 'umfragen' && typeof loadUmfragenData === 'function') loadUmfragenData();
    if (viewId === 'logins' && typeof loadLoginsData === 'function') loadLoginsData();

    // NEU: Jahresmeisterschaften laden
    if (viewId === 'jahresmeisterschaft' && typeof loadJahresmeisterschaftData === 'function') loadJahresmeisterschaftData();
    if (viewId === 'jahresmeisterschaft-kk' && typeof loadJahresmeisterschaftKKData === 'function') loadJahresmeisterschaftKKData();
    // In navTo() ergänzen:
    if (viewId === 'mail'          && typeof loadMailData          === 'function') loadMailData();
    if (viewId === 'jahresbeitrag' && typeof loadJahresbeitragData === 'function') loadJahresbeitragData();
    if (viewId === 'mitglieder'    && typeof loadMitgliederData    === 'function') loadMitgliederData();

}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('show');
}

function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('show');
}

// =========================================================
//  ONLINE PRESENCE CHECK & LAST LOGIN
// =========================================================
let _presencePingTimerId = null;

async function pingPresence() {
    console.log("🔍 pingPresence called. window.currentUser:", window.currentUser);
    if (!window.currentUser) {
        console.warn("⚠️ pingPresence: window.currentUser is falsy!");
        return;
    }
    try {
        const res = await apiFetch('mitglieder', `action=ping&user=${encodeURIComponent(window.currentUser)}`);
        const data = await res.json();
        console.log("🔍 pingPresence response data:", data);
        if (data.success && Array.isArray(data.onlineUsers)) {
            updatePresenceUI(data.onlineUsers);
        }
    } catch (e) {
        console.error("❌ Fehler beim Presence-Ping:", e);
    }
}

function startPresencePingTimer() {
    console.log("🔍 startPresencePingTimer called");
    if (_presencePingTimerId) return;
    pingPresence(); // Erstes Mal sofort ausführen
    console.log("⏰ Presence-Ping: Timer gestartet (Intervall: 30 Sekunden)");
    _presencePingTimerId = setInterval(pingPresence, 30000); // alle 30 Sekunden
}

function updatePresenceUI(onlineUsers) {
    const presenceBanner = document.getElementById('presence-banner');
    const sidebarPresenceBadge = document.getElementById('sidebar-presence-badge');
    const mobilePresenceBanner = document.getElementById('mobile-presence-banner');
    const welcomeText = document.getElementById('welcome-presence-text');
    const welcomeIcon = document.getElementById('presence-modal-icon');
    const welcomeAlert = document.getElementById('welcome-presence-alert');

    if (!onlineUsers || onlineUsers.length === 0) {
        const aloneHtml = `
            <span class="badge bg-light text-muted border px-2 py-1 animate__animated animate__fadeIn" style="font-size: 0.8rem; font-weight: normal; border-radius: 20px;">
                <span class="spinner-grow spinner-grow-sm text-success me-1 align-middle" style="width: 8px; height: 8px;" role="status"></span>
                Keine anderen Vorstandsmitglieder online (keine Gefahr von Doppeleingaben)
            </span>
        `;
        if (presenceBanner) presenceBanner.innerHTML = aloneHtml;

        // PC Sidebar update
        if (sidebarPresenceBadge) {
            sidebarPresenceBadge.innerHTML = `
                <span class="badge bg-light text-muted border px-2 py-1" style="font-size: 0.7rem; font-weight: 500; border-radius: 20px; display: inline-flex; align-items: center;">
                    <span class="spinner-grow spinner-grow-sm text-success me-1.5" style="width: 6px; height: 6px;" role="status"></span>
                    Allein online
                </span>
            `;
        }

        // Mobile Header update
        if (mobilePresenceBanner) {
            mobilePresenceBanner.innerHTML = `
                <span class="text-success" style="font-size: 0.65rem; font-weight: 600;"><span class="spinner-grow spinner-grow-sm text-success align-middle" style="width: 5px; height: 5px;" role="status"></span> Allein</span>
            `;
        }

        // Modal step 2 update
        if (welcomeText) {
            welcomeText.innerHTML = `
                <div class="text-center py-2 animate__animated animate__fadeIn">
                    <span class="spinner-grow spinner-grow-sm text-success me-2 align-middle" style="width: 12px; height: 12px;" role="status"></span>
                    <strong class="text-success">Keine anderen Vorstandsmitglieder online.</strong><br>
                    <span class="text-muted mt-1 d-block small">Du kannst sicher arbeiten, es besteht keine Gefahr von Doppeleingaben.</span>
                </div>
            `;
        }
        if (welcomeIcon) {
            welcomeIcon.className = "fas fa-user-shield fa-4x text-success animate__animated animate__bounceIn";
        }
        if (welcomeAlert) {
            welcomeAlert.style.backgroundColor = "rgba(40,167,69,0.05)";
            welcomeAlert.style.borderColor = "rgba(40,167,69,0.1)";
        }
    } else {
        const namesHtml = onlineUsers.map(u => `<strong>${escapeHtml(u)}</strong>`).join(', ');
        const warningHtml = `
            <span class="badge px-2 py-1 animate__animated animate__pulse animate__infinite" style="font-size: 0.8rem; font-weight: normal; color: #856404; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 20px;">
                <i class="fas fa-users-viewfinder text-warning me-1"></i>
                Aktuell online: ${namesHtml} (Vorsicht vor Doppeleingaben bei zeitgleichen Änderungen!)
            </span>
        `;
        if (presenceBanner) presenceBanner.innerHTML = warningHtml;

        // PC Sidebar update
        if (sidebarPresenceBadge) {
            sidebarPresenceBadge.innerHTML = `
                <span class="badge px-2 py-1.5 animate__animated animate__pulse animate__infinite" style="font-size: 0.7rem; font-weight: normal; color: #856404; background-color: #fff3cd; border: 1px solid #ffeeba; border-radius: 12px; display: block; text-align: left; white-space: normal; line-height: 1.3;" title="Doppeleingaben vermeiden!">
                    <i class="fas fa-exclamation-triangle text-warning me-1"></i>
                    Online: ${namesHtml}
                </span>
            `;
        }

        // Mobile Header update
        if (mobilePresenceBanner) {
            mobilePresenceBanner.innerHTML = `
                <span class="text-warning fw-bold animate__animated animate__flash animate__infinite" style="color: #d39e00; font-size: 0.65rem;"><i class="fas fa-users align-middle"></i> ${onlineUsers.length} online</span>
            `;
        }

        // Modal step 2 update
        if (welcomeText) {
            welcomeText.innerHTML = `
                <div class="py-2 animate__animated animate__shakeX">
                    <strong class="text-warning d-block mb-1 fs-6"><i class="fas fa-exclamation-triangle me-1"></i> Vorsicht: Andere Mitglieder online!</strong>
                    <span class="text-dark d-block">Folgende Vorstandsmitglieder sind ebenfalls im Portal:</span>
                    <div class="mt-2 p-2 rounded border text-center fw-bold" style="color: #856404; background-color: #fff3cd; border-color: #ffeeba;">
                        ${namesHtml}
                    </div>
                    <span class="text-muted mt-2 d-block small">Bitte sprecht euch ab, falls ihr zeitgleich Änderungen (z.B. bei der Jahresmeisterschaft oder im Inventar) vornehmt!</span>
                </div>
            `;
        }
        if (welcomeIcon) {
            welcomeIcon.className = "fas fa-users-viewfinder fa-4x text-warning animate__animated animate__pulse animate__infinite";
        }
        if (welcomeAlert) {
            welcomeAlert.style.backgroundColor = "rgba(255,193,7,0.05)";
            welcomeAlert.style.borderColor = "rgba(255,193,7,0.1)";
        }
    }
}

function advanceWelcomeStep() {
    const step1 = document.getElementById('welcome-step-login');
    const step2 = document.getElementById('welcome-step-presence');
    if (step1 && step2) {
        step1.classList.add('d-none');
        step2.classList.remove('d-none');
    }
}

function handleSecurityLock() {
    if (confirm("⚠️ SICHERHEITS-WARNUNG!\n\nBist du sicher, dass du dein Konto sperren und dich sofort abmelden möchtest?\n\nDeine aktuelle Sitzung wird umgehend vernichtet. Bitte wende dich danach sofort an einen Administrator oder ändere nach dem erneuten Einloggen dein Passwort!")) {
        showError("Sicherheits-Abmeldung läuft... Deine Sitzung wird zerstört.", 3000);
        setTimeout(doLogout, 2000);
    }
}

function openChangePasswordModal() {
    document.getElementById('change-password-form')?.reset();
    const modalEl = document.getElementById('change-password-modal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

async function submitChangePassword(e) {
    e.preventDefault();
    const oldPw = document.getElementById('cp-old-password').value;
    const newPw = document.getElementById('cp-new-password').value;
    const confirmPw = document.getElementById('cp-confirm-password').value;
    const submitBtn = document.getElementById('cp-submit-btn');

    if (newPw.length < 4) {
        showError("Das neue Passwort muss mindestens 4 Zeichen lang sein!");
        return;
    }

    if (newPw !== confirmPw) {
        showError("Die Passwörter stimmen nicht überein!");
        return;
    }

    let loginId = localStorage.getItem('portal_login_id');
    if (!loginId) {
        loginId = prompt("🔑 Sicherheits-Bestätigung:\n\nBitte gib zur Verifizierung deines Kontos deinen Benutzernamen oder deine PIN (AddressNr) ein:");
        if (!loginId) return;
        localStorage.setItem('portal_login_id', loginId);
    }

    try {
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Passwort wird geändert...';
        }

        const oldPwHash = await hashPassword(oldPw);

        const res = await apiFetch('logins', {
            action: 'changeMyPassword',
            loginId: loginId,
            oldPw: oldPwHash,
            newPw: newPw
        });

        const data = await res.json();
        if (data.success) {
            showSuccess("Passwort erfolgreich geändert! Bitte logge dich mit deinem neuen Passwort erneut ein.", 5000);
            const modalEl = document.getElementById('change-password-modal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            setTimeout(doLogout, 5000);
        } else {
            showError("Fehler: " + (data.error || "Altes Passwort inkorrekt oder Benutzer nicht gefunden."));
        }
    } catch (err) {
        showError("Verbindungsfehler: " + err.message);
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-save me-1"></i> Passwort aktualisieren';
        }
    }
}
