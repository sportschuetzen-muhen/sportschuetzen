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

// Converts ISO date (YYYY-MM-DD or ISO timestamp) → display format (DD.MM.YYYY)
function isoToDisplay(val) {
    if (!val) return '';
    const s = String(val).trim();
    if (s.includes('T')) {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
            const d = String(dt.getDate()).padStart(2, '0');
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const y = dt.getFullYear();
            return `${d}.${m}.${y}`;
        }
    }
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
    if (s.includes('T')) {
        const dt = new Date(s);
        if (!isNaN(dt.getTime())) {
            const y = dt.getFullYear();
            const m = String(dt.getMonth() + 1).padStart(2, '0');
            const d = String(dt.getDate()).padStart(2, '0');
            return `${y}-${m}-${d}`;
        }
    }
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
//  SMART STORAGE CACHE MANAGER (Versioniert & TTL-gesteuert)
// =========================================================
const AppCache = {
    VERSION: 1,
    PREFIX: 'portal_cache_v1_',

    set(key, data, ttlMinutes = 120) {
        try {
            const entry = {
                version: this.VERSION,
                timestamp: Date.now(),
                ttlMs: ttlMinutes * 60 * 1000,
                data: data
            };
            localStorage.setItem(this.PREFIX + key, JSON.stringify(entry));
        } catch (e) {
            console.warn("⚠️ AppCache.set fehlgeschlagen (evtl. Quota voll):", e);
        }
    },

    get(key) {
        try {
            const raw = localStorage.getItem(this.PREFIX + key);
            if (!raw) return null;
            const entry = JSON.parse(raw);
            // Versionsprüfung
            if (!entry || entry.version !== this.VERSION) {
                this.invalidate(key);
                return null;
            }
            // TTL-Prüfung
            if (Date.now() - entry.timestamp > entry.ttlMs) {
                this.invalidate(key);
                return null;
            }
            return entry.data;
        } catch (e) {
            return null;
        }
    },

    invalidate(key) {
        try {
            localStorage.removeItem(this.PREFIX + key);
        } catch (e) {}
    }
};
window.AppCache = AppCache;

// =========================================================
//  EINHEITLICHE FEHLERBEHANDLUNG
// =========================================================
function getOrCreateToastContainer(position = 'top-end') {
    const pos = (position === 'bottom' || position === 'bottom-end') ? 'bottom-end' : 
                (position === 'bottom-center' || position === 'bottom-middle') ? 'bottom-center' :
                (position === 'top-center' || position === 'top-middle') ? 'top-center' : 'top-end';
    
    let id = 'app-toast-container-' + pos;
    let container = document.getElementById(id);
    if (!container) {
        container = document.createElement('div');
        container.id = id;
        container.style.zIndex = '10050';
        container.style.pointerEvents = 'none';
        if (pos === 'bottom-end') {
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
        } else if (pos === 'bottom-center') {
            container.className = 'toast-container position-fixed bottom-0 start-50 translate-middle-x p-3';
        } else if (pos === 'top-center') {
            container.className = 'toast-container position-fixed top-0 start-50 translate-middle-x p-3';
        } else {
            container.className = 'toast-container position-fixed top-0 end-0 p-3';
        }
        document.body.appendChild(container);
    }
    return container;
}

function showError(message, duration = 5000, position = 'top-end') {
    AppState.setError(message);
    const container = getOrCreateToastContainer(position);
    const toast = document.createElement('div');
    toast.className = 'toast show bg-danger text-white shadow-lg mb-2 border-0';
    toast.style.pointerEvents = 'auto';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="toast-body d-flex align-items-center">
            <i class="fas fa-exclamation-circle me-2 fs-5"></i>
            <span class="fw-medium">${escapeHtml(message)}</span>
            <button type="button" class="btn-close btn-close-white ms-auto" onclick="this.closest('.toast').remove(); AppState.clearError();"></button>
        </div>`;
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.remove('show');
                setTimeout(() => {
                    toast.remove();
                    AppState.clearError();
                }, 250);
            }
        }, duration);
    }
    return toast;
}

function showSuccess(message, duration = 3000, position = 'top-end') {
    const container = getOrCreateToastContainer(position);
    const toast = document.createElement('div');
    toast.className = 'toast show bg-success text-white shadow-lg mb-2 border-0';
    toast.style.pointerEvents = 'auto';
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `
        <div class="toast-body d-flex align-items-center">
            <i class="fas fa-check-circle me-2 fs-5"></i>
            <span class="fw-medium">${escapeHtml(message)}</span>
            <button type="button" class="btn-close btn-close-white ms-auto" onclick="this.closest('.toast').remove();"></button>
        </div>`;
    container.appendChild(toast);
    
    if (duration > 0) {
        setTimeout(() => {
            if (toast.parentNode) {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 250);
            }
        }, duration);
    }
    return toast;
}

function showToast(message, type = 'success', position = 'top-end', duration = 3000) {
    if (type === 'danger' || type === 'error') {
        return showError(message, duration, position);
    } else if (type === 'warning') {
        const container = getOrCreateToastContainer(position);
        const toast = document.createElement('div');
        toast.className = 'toast show bg-warning text-dark shadow-lg mb-2 border-0';
        toast.style.pointerEvents = 'auto';
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="toast-body d-flex align-items-center">
                <i class="fas fa-exclamation-triangle me-2 fs-5 text-dark"></i>
                <span class="fw-medium">${escapeHtml(message)}</span>
                <button type="button" class="btn-close ms-auto" onclick="this.closest('.toast').remove();"></button>
            </div>`;
        container.appendChild(toast);
        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 250);
                }
            }, duration);
        }
        return toast;
    } else if (type === 'info') {
        const container = getOrCreateToastContainer(position);
        const toast = document.createElement('div');
        toast.className = 'toast show bg-info text-dark shadow-lg mb-2 border-0';
        toast.style.pointerEvents = 'auto';
        toast.setAttribute('role', 'alert');
        toast.innerHTML = `
            <div class="toast-body d-flex align-items-center">
                <i class="fas fa-info-circle me-2 fs-5 text-dark"></i>
                <span class="fw-medium">${escapeHtml(message)}</span>
                <button type="button" class="btn-close ms-auto" onclick="this.closest('.toast').remove();"></button>
            </div>`;
        container.appendChild(toast);
        if (duration > 0) {
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.classList.remove('show');
                    setTimeout(() => toast.remove(), 250);
                }
            }, duration);
        }
        return toast;
    } else {
        return showSuccess(message, duration, position);
    }
}
window.showToast = showToast;
window.showToastImpl = showToast;

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

    // Sofortige Cache-Wärmung aus AppCache für 0 ms Ladezeit
    if (window.AppCache) {
        const cachedMgl = window.AppCache.get('mitglieder');
        if (cachedMgl && Array.isArray(cachedMgl.data) && cachedMgl.data.length > 0) {
            window._mglData = cachedMgl.data;
            if (cachedMgl.lizenzen) window._mglLizenzenCache = cachedMgl.lizenzen;
            if (cachedMgl.funktionen) window._mglFunktionenCache = cachedMgl.funktionen;
            if (cachedMgl.historie) window._mglHistoryCache = cachedMgl.historie;
            console.log(`⚡ AppCache: ${window._mglData.length} Mitglieder sofort im RAM verfügbar.`);
        }
    }

    const dbUserName = document.getElementById('dashboard-user-name');
    if (dbUserName) dbUserName.innerText = currentUser;

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

    // Sequentielles Hintergrund-Laden: Startet nach 12s Idle auf dem Dashboard,
    // sofern der Nutzer nicht vorher selbst ein Modul anklickt.
    if (window.bgModuleLoader) {
        window.bgModuleLoader.scheduleNext(12000);
    }
}

// =========================================================
//  PRELOAD STATUS INDIKATOREN (Visuelle Indikatoren entfernt)
// =========================================================
window.setPreloadStatus = function(viewId, status) {
    // Visuelle Spinner & Häkchen deaktiviert – Hintergrund-Laden erfolgt lautlos
};

// =========================================================
//  SEQUENTIELLER HINTERGRUND-MODUL-MANAGER (Pacing & GAS-Delivery)
// =========================================================
const bgModuleLoader = {
    // 10 Sekunden Pause zwischen Modulen, nachdem GAS geliefert hat
    intervalMs: 10000,
    loadedSet: new Set(),
    isRunning: false,
    isUserActiveLoading: false,
    nextTimerId: null,

    modules: [
        {
            id: 'termine',
            label: 'Jahresprogramm',
            load: () => (typeof loadTermineData === 'function' ? loadTermineData(false) : Promise.resolve()),
            isLoaded: () => typeof adminState !== 'undefined' && adminState !== null && document.getElementById('termine-ui')?.children.length > 0
        },
        {
            id: 'umfragen',
            label: 'Anlässe & Umfragen',
            load: () => (typeof loadUmfragenData === 'function' ? loadUmfragenData(false) : Promise.resolve()),
            isLoaded: () => typeof umfragenState !== 'undefined' && umfragenState !== null && document.getElementById('umfragen-tabs') !== null
        },
        {
            id: 'system-mails',
            label: 'System-Mails',
            load: () => (typeof loadSystemMailsData === 'function' ? loadSystemMailsData(false) : Promise.resolve()),
            isLoaded: () => typeof sysMailState !== 'undefined' && sysMailState !== null && (document.getElementById('sys-mail-list') !== null || document.getElementById('app-info-list') !== null)
        },
        {
            id: 'resultate',
            label: 'Resultate',
            load: () => (typeof loadResultateData === 'function' ? loadResultateData(false) : Promise.resolve()),
            isLoaded: () => typeof resultateState !== 'undefined' && resultateState && resultateState.rows && resultateState.rows.length > 0
        },
        {
            id: 'manager',
            label: 'Team Manager',
            load: async () => {
                if (typeof loadContestData === 'function') {
                    await loadContestData('grenzland', false, true);
                    await loadContestData('mannschaft', false, true);
                    await loadContestData('gruppe', false, true);
                }
            },
            isLoaded: () => typeof mailWizard !== 'undefined' && mailWizard && mailWizard.cachedModules && mailWizard.cachedModules['grenzland']
        },
        {
            id: 'vermietung',
            label: 'Vermietung',
            load: () => (typeof loadVermietungData === 'function' ? loadVermietungData(false) : Promise.resolve()),
            isLoaded: () => typeof vermietungDaten !== 'undefined' && Array.isArray(vermietungDaten) && vermietungDaten.length > 0
        },
        {
            id: 'jahresmeisterschaft',
            label: 'Jahresmeisterschaft KK',
            load: () => (typeof loadJahresmeisterschaftData === 'function' ? loadJahresmeisterschaftData(false, true) : Promise.resolve()),
            isLoaded: () => typeof jmRawGrid !== 'undefined' && Array.isArray(jmRawGrid) && jmRawGrid.length > 0
        },
        {
            id: 'mail',
            label: 'Mail',
            load: () => (typeof loadMailData === 'function' ? loadMailData(false) : Promise.resolve()),
            isLoaded: () => typeof _mailLoaded !== 'undefined' && _mailLoaded === true
        },
        {
            id: 'jahresbeitrag',
            label: 'Jahresbeitrag',
            load: () => (typeof loadJahresbeitragData === 'function' ? loadJahresbeitragData(false, false) : Promise.resolve()),
            isLoaded: () => typeof window._jbAllBeitraege !== 'undefined' && window._jbAllBeitraege !== null && window._jbAllBeitraege.length > 0
        },
        {
            id: 'rechnungen',
            label: 'Rechnungen',
            load: () => (typeof loadRechnungenData === 'function' ? loadRechnungenData(true) : Promise.resolve()),
            isLoaded: () => typeof window._invoices !== 'undefined' && window._invoices !== null && window._invoices.length > 0
        },
        {
            id: 'mitglieder',
            label: 'Mitglieder',
            load: () => (typeof loadMitgliederData === 'function' ? loadMitgliederData(false) : Promise.resolve()),
            isLoaded: () => typeof window._mglData !== 'undefined' && window._mglData !== null && window._mglData.length > 0
        },
        {
            id: 'buchhaltung',
            label: 'Buchhaltung',
            load: () => (typeof window.loadBuchhaltungData === 'function' ? window.loadBuchhaltungData(true) : Promise.resolve()),
            isLoaded: () => (typeof window._bhJournal !== 'undefined' && window._bhJournal !== null && window._bhJournal.length > 0) || (typeof window._bhJournalData !== 'undefined' && window._bhJournalData !== null && window._bhJournalData.length > 0)
        },
        {
            id: 'inventar',
            label: 'Inventar',
            load: () => (typeof loadInventarData === 'function' ? loadInventarData(false) : Promise.resolve()),
            isLoaded: () => typeof inventarState !== 'undefined' && inventarState !== null && document.getElementById('inventar-container')?.querySelector('.nav-btn') !== null
        },
        {
            id: 'logins',
            label: 'Logins',
            load: () => (typeof loadLoginsData === 'function' && userHasRole('admin') ? loadLoginsData(false) : Promise.resolve()),
            isLoaded: () => typeof window._loginsData !== 'undefined' && window._loginsData !== null && window._loginsData.length > 0
        }
    ],

    // Prüft, ob Benutzer für dieses Modul berechtigt ist
    isAccessible: function(viewId) {
        const link = document.querySelector(`#sidebar .nav-link[onclick*="'${viewId}'"]`);
        if (!link) return false;
        if (link.classList.contains('d-none')) return false;
        return true;
    },

    // Prüft, ob das Modul bereits geladen ist
    isLoaded: function(mod) {
        if (this.loadedSet.has(mod.id)) return true;
        try {
            if (typeof mod.isLoaded === 'function' && mod.isLoaded()) {
                this.loadedSet.add(mod.id);
                return true;
            }
        } catch (e) {
            console.warn(`Fehler bei isLoaded Prüfung für ${mod.id}:`, e);
        }
        return false;
    },

    // Markiert Modul als geladen
    markLoaded: function(viewId) {
        this.loadedSet.add(viewId);
    },

    // Wird aufgerufen, wenn der Benutzer ein Modul manuell geladen hat
    onUserModuleLoaded: function(viewId) {
        console.log(`📌 Modul "${viewId}" fertig geladen. Prüfe verbleibende Module für Hintergrund-Laden...`);
        this.markLoaded(viewId);
        this.isUserActiveLoading = false;
        // Nach Fertigstellung des manuellen Moduls 1s kurz warten, dann Warteschlange starten
        this.scheduleNext(1000);
    },

    // Plant den nächsten Hintergrundschritt mit Verzögerung ein
    scheduleNext: function(delayMs) {
        if (this.nextTimerId) {
            clearTimeout(this.nextTimerId);
            this.nextTimerId = null;
        }
        const delay = typeof delayMs === 'number' ? delayMs : this.intervalMs;
        this.nextTimerId = setTimeout(() => {
            this.step();
        }, delay);
    },

    // Führt das nächste noch nicht geladene Modul aus
    step: async function() {
        if (this.isRunning) return;
        if (this.isUserActiveLoading) {
            this.scheduleNext(3000);
            return;
        }
        if (window.hasUnsavedChanges) {
            console.log("⏸️ Hintergrund-Laden pausiert: Ungespeicherte Änderungen vorhanden");
            this.scheduleNext(10000);
            return;
        }

        // Finde nächstes berechtigtes, ungeladenes Modul
        const nextMod = this.modules.find(m => this.isAccessible(m.id) && !this.isLoaded(m));
        if (!nextMod) {
            console.log("🎉 Alle berechtigten Module sind im Hintergrund vorgeladen!");
            return;
        }

        this.isRunning = true;
        console.log(`⏳ Hintergrund-Laden: Starte Modul "${nextMod.label || nextMod.id}"...`);
        window.setPreloadStatus(nextMod.id, 'loading');

        try {
            await nextMod.load();
            this.markLoaded(nextMod.id);
            window.setPreloadStatus(nextMod.id, 'success');
            console.log(`✅ Hintergrund-Laden: Modul "${nextMod.label || nextMod.id}" geliefert. Nächstes Modul in ${Math.round(this.intervalMs / 1000)}s...`);
        } catch (err) {
            console.warn(`⚠️ Hintergrund-Laden fehlgeschlagen für ${nextMod.id}:`, err);
            window.setPreloadStatus(nextMod.id, '');
        } finally {
            this.isRunning = false;
            // Sobald GAS geliefert hat, nach Intervall (10s) das nächste anstossen
            this.scheduleNext(this.intervalMs);
        }
    }
};
window.bgModuleLoader = bgModuleLoader;

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
            window._jbPreloadPromise = (async () => {
                try {
                    await loadJahresbeitragData(false, false);
                    console.log("✅ Initiales Bulk-Loading: Jahresbeitrag geladen.");
                } catch (jbErr) {
                    console.warn("⚠️ Fehler beim Preload des Jahresbeitrags:", jbErr);
                }
            })();
        }

        // 2. Mitglieder bulk load (Dedupliziert & sequentiell über ensureMitgliederLoaded)
        if (typeof window.ensureMitgliederLoaded === 'function' || typeof loadMitgliederData === 'function') {
            window._mglPreloadPromise = (async () => {
                if (typeof window.ensureMitgliederLoaded === 'function') {
                    await window.ensureMitgliederLoaded();
                } else if (typeof loadMitgliederData === 'function') {
                    await loadMitgliederData(false);
                }
                const activeView = document.querySelector('.module-view.active');
                const activeViewId = activeView ? activeView.id.replace('view-', '') : '';
                if (activeViewId === 'mitglieder') {
                    if (typeof renderMitgliederView === 'function') renderMitgliederView(window._mglData);
                    if (typeof mglFilter === 'function') mglFilter();
                }
                console.log("✅ Initiales Bulk-Loading: Mitglieder geladen.");
            })();
        }

        await Promise.all([
            window._jbPreloadPromise || Promise.resolve(),
            window._mglPreloadPromise || Promise.resolve()
        ]);
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

            const [beitraege, members, participations, positions, gebuehren, invoices] = await Promise.all([
                apiFetch('jahresbeitrag', `action=getBeitraege`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getMembers`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getParticipations`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getPositionen`).then(r => r.json()),
                apiFetch('jahresbeitrag', `action=getGebuehren`).then(r => r.json()).catch(err => {
                    console.warn("⚠️ Fehler beim Background Sync der Gebühren:", err);
                    return { success: false, data: [] };
                }),
                apiFetch('rechnungen', 'action=getInvoices').then(r => r.json()).catch(err => {
                    console.warn("⚠️ Fehler beim Background Sync der Rechnungen:", err);
                    return { success: false, data: [] };
                })
            ]);

            if (beitraege.success && members.success && participations.success && positions.success) {
                window._jbGebuehren = gebuehren && gebuehren.success ? (gebuehren.data || []) : [];
                window._jbAllInvoices = invoices && invoices.success ? (invoices.data || []) : [];
                window._invoices = window._jbAllInvoices; // Sync both caches!
                window._jbMembers = (members.data || []).filter(m => m.IsActive == 1 && m.Deceased != 1);
                window._jbMemberMap = {};
                (members.data || []).forEach(m => { 
                    window._jbMemberMap[String(m.PersonNumber)] = m; 
                });
                
                window._jbAllBeitraege = beitraege.data || [];
                window._jbAllParticipations = participations.data || [];
                window._jbAllPositions = positions.positions || [];
                
                window._jbData = window._jbAllBeitraege.filter(h => Number(h.year) === Number(year));

                // Invoices mergen
                if (typeof jbMergeInvoicesIntoData === 'function') {
                    jbMergeInvoicesIntoData(window._jbAllInvoices || []);
                }

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

        // 2. Synchronisierung Mitglieder (über deduplizierten Loader)
        if (typeof window.ensureMitgliederLoaded === 'function') {
            console.log("🔄 Background Sync: Synchronisiere Mitglieder...");
            await window.ensureMitgliederLoaded(true);
            if (activeViewId === 'mitglieder' && typeof renderMitgliederView === 'function') {
                renderMitgliederView(window._mglData);
                if (typeof mglFilter === 'function') mglFilter();
            }
            console.log("✅ Background Sync: Mitglieder erfolgreich synchronisiert.");
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
        'rechnungen':          ['admin', 'kassier', 'vorstand'],
        'mitglieder':          ['admin', 'schuetzenmeister', 'aktuar', 'vorstand'],
        'meeting-recorder':    ['schuetzenmeister', 'kassier', 'admin', 'aktuar', 'vorstand'],
        'anlaesse':            ['admin', 'vorstand', 'schuetzenmeister', 'aktuar', 'kassier', 'vermieter'],
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

    // Wenn der Nutzer manuell navigiert, Vorrang gewähren
    if (window.bgModuleLoader) {
        window.bgModuleLoader.isUserActiveLoading = true;
    }

    // 1. Nav-Links (nur in Sidebar, um Sub-Tabs in Modulen nicht zu beeinflussen)
    document.querySelectorAll('#sidebar .nav-link').forEach(l => l.classList.remove('active'));
    if (el && el.classList.contains('nav-link')) {
        el.classList.add('active');
    } else {
        const sidebarLink = document.querySelector(`#sidebar .nav-link[onclick*="'${viewId}'"]`);
        if (sidebarLink) sidebarLink.classList.add('active');
    }

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

    // 4. Module laden und Ladeabschluss überwachen
    let loadPromise = null;
    try {
        if (viewId === 'inventar'  && typeof loadInventarData  === 'function') loadPromise = loadInventarData();
        else if (viewId === 'termine'   && typeof loadTermineData   === 'function') loadPromise = loadTermineData();
        else if (viewId === 'resultate' && typeof loadResultateData === 'function') loadPromise = loadResultateData();
        else if (viewId === 'manager'   && typeof loadContestData   === 'function') loadPromise = loadContestData();
        else if (viewId === 'vermietung' && typeof loadVermietungData === 'function') loadPromise = loadVermietungData();
        else if (viewId === 'system-mails' && typeof loadSystemMailsData === 'function') loadPromise = loadSystemMailsData();
        else if (viewId === 'umfragen' && typeof loadUmfragenData === 'function') loadPromise = loadUmfragenData();
        else if (viewId === 'anlaesse' && typeof loadAnlaesseData === 'function') loadPromise = loadAnlaesseData();
        else if (viewId === 'logins' && typeof loadLoginsData === 'function') loadPromise = loadLoginsData();
        else if (viewId === 'jahresmeisterschaft' && typeof loadJahresmeisterschaftData === 'function') loadPromise = loadJahresmeisterschaftData();
        else if (viewId === 'jahresmeisterschaft-kk' && typeof loadJahresmeisterschaftKKData === 'function') loadPromise = loadJahresmeisterschaftKKData();
        else if (viewId === 'mail'          && typeof loadMailData          === 'function') loadPromise = loadMailData();
        else if (viewId === 'jahresbeitrag' && typeof loadJahresbeitragData === 'function') loadPromise = loadJahresbeitragData();
        else if (viewId === 'rechnungen'    && typeof loadRechnungenData    === 'function') loadPromise = loadRechnungenData();
        else if (viewId === 'mitglieder'    && typeof loadMitgliederData    === 'function') loadPromise = loadMitgliederData();
        else if (viewId === 'buchhaltung'      && typeof renderBuchhaltung     === 'function') loadPromise = renderBuchhaltung();
        else if (viewId === 'galerie'          && typeof initGalerieManager    === 'function') loadPromise = initGalerieManager();
        else if (viewId === 'news'             && typeof initNewsView          === 'function') loadPromise = initNewsView();
        else if (viewId === 'meeting-recorder' && typeof initMeetingRecorder   === 'function') loadPromise = initMeetingRecorder();
        else if (viewId === 'archiv'           && typeof initArchiv            === 'function') loadPromise = initArchiv();
    } catch (err) {
        console.error(`Fehler beim Laden von Modul ${viewId}:`, err);
    }

    // Nach erfolgreichem Laden das Hintergrund-Laden der verbleibenden Module anstossen
    if (viewId !== 'dashboard') {
        Promise.resolve(loadPromise).then(() => {
            if (window.bgModuleLoader) {
                window.bgModuleLoader.onUserModuleLoaded(viewId);
            }
        }).catch(err => {
            console.warn(`Fehler beim Laden von ${viewId}:`, err);
            if (window.bgModuleLoader) {
                window.bgModuleLoader.isUserActiveLoading = false;
                window.bgModuleLoader.scheduleNext(5000);
            }
        });
    } else {
        if (window.bgModuleLoader) {
            window.bgModuleLoader.isUserActiveLoading = false;
        }
    }
}

function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('show');
    document.body.classList.toggle('sidebar-open');
}

function closeSidebarMobile() {
    document.getElementById('sidebar').classList.remove('show');
    document.body.classList.remove('sidebar-open');
}

// =========================================================
//  ONLINE PRESENCE CHECK & LAST LOGIN
// =========================================================
let _presencePingTimerId = null;

function getSessionId() {
    let sessId = sessionStorage.getItem('portal_session_id');
    if (!sessId) {
        sessId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
        sessionStorage.setItem('portal_session_id', sessId);
    }
    return sessId;
}

async function pingPresence() {
    console.log("🔍 pingPresence called. window.currentUser:", window.currentUser);
    if (!window.currentUser) {
        console.warn("⚠️ pingPresence: window.currentUser is falsy!");
        return;
    }
    try {
        const sessId = getSessionId();
        const res = await apiFetch('logins', `action=ping&user=${encodeURIComponent(window.currentUser)}&sessionId=${sessId}`);
        if (!res.ok) {
            console.warn("⚠️ Presence-Ping HTTP Status nicht OK:", res.status);
            return;
        }
        const text = await res.text();
        let data;
        try {
            data = JSON.parse(text);
        } catch (e) {
            console.warn("⚠️ Presence-Ping: Server lieferte kein JSON (vorübergehendes Backend-Problem):", text.slice(0, 100));
            return;
        }
        console.log("🔍 pingPresence response data:", data);
        if (data.success && Array.isArray(data.onlineUsers)) {
            updatePresenceUI(data.onlineUsers);
        }
    } catch (e) {
        console.warn("⚠️ Fehler beim Presence-Ping (Netzwerkfehler):", e.message);
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

// Opens a base64-encoded PDF in a new browser tab using a local blob URL
function openPdfBase64(base64Str) {
    if (!base64Str) return;
    try {
        // Bereinige eventuelle data: URIs sowie Zeilenumbrüche/Whitespace (z. B. von Google Apps Script RFC 2045)
        const cleanBase64 = String(base64Str).replace(/^data:application\/pdf;base64,/, '').replace(/\s+/g, '');
        const byteCharacters = atob(cleanBase64);
        const byteNumbers = new Array(byteCharacters.length);
        for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], {type: 'application/pdf'});
        const fileURL = URL.createObjectURL(blob);
        window.open(fileURL, '_blank');
    } catch (err) {
        console.error("❌ openPdfBase64 Fehler beim Dekodieren:", err);
    }
}
