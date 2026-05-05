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
    let overlay = document.getElementById('global-loading-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'global-loading-overlay';
        overlay.className = 'position-fixed inset-0 d-flex align-items-center justify-content-center';
        overlay.style.background = 'rgba(255,255,255,0.9)';
        overlay.style.zIndex = '9998';
        overlay.innerHTML = `
            <div class="text-center">
                <div class="spinner-border text-primary mb-2" role="status"></div>
                <div class="text-muted" id="global-loading-message">${escapeHtml(message)}</div>
            </div>`;
        document.body.appendChild(overlay);
    }
    document.getElementById('global-loading-message').textContent = message;
    overlay.style.display = 'flex';
    AppState.setLoading(true, message);
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('global-loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
    AppState.setLoading(false, '');
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
