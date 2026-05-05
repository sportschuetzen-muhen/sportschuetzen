// === KONFIGURATION ===
const WORKER_URL = "https://v1-vorstand-api.dan-hunziker73.workers.dev/"; 

// === STATE ===
// Wir verwenden window.* um sicherzustellen, dass diese Variablen global für alle Skripte verfügbar sind
window.currentUser = localStorage.getItem('portal_user') || null;
window.currentRoles = localStorage.getItem('portal_roles') ? localStorage.getItem('portal_roles').split(',') : [];
window.userRole = localStorage.getItem('portal_role') || (window.currentRoles[0] || 'gast');
window.currentRole = window.userRole; 
window.csrfToken = null;

console.log("🔐 Auth-State geladen:", { user: window.currentUser, roles: window.currentRoles });

// =========================================================
//  SECURITY: Passwort-Hashing (SHA-256)
// =========================================================
async function hashPassword(password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// =========================================================
//  SECURITY: CSRF-Token
// =========================================================
function generateCsrfToken() {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

function getCsrfToken() {
    if (!csrfToken) {
        csrfToken = sessionStorage.getItem('csrf_token');
        if (!csrfToken) {
            csrfToken = generateCsrfToken();
            sessionStorage.setItem('csrf_token', csrfToken);
        }
    }
    return csrfToken;
}

// =========================================================
//  API HELPER (mit CSRF-Schutz und flexibler Parameter-Handhabung)
// =========================================================
async function apiFetch(module, paramsOrObj, options) {
    const csrf = getCsrfToken();
    const role = userRole || localStorage.getItem('portal_role') || '';

    // Standard-Methode bestimmen
    let method = 'GET';
    if (typeof options === 'string') {
        method = options.toUpperCase();
    } else if (options && options.method) {
        method = options.method.toUpperCase();
    }

    const headers = {
        'X-CSRF-Token': csrf,
        'X-User-Role': role,
        'Content-Type': 'application/json'
    };

    let url;
    let fetchOptions = { method: method, headers: headers };

    const qs = (typeof paramsOrObj === 'string') ? paramsOrObj : new URLSearchParams(paramsOrObj || {}).toString();

    if (method === 'POST') {
        let bodyContent = "";
        if (options && typeof options === 'object' && options.body) {
            // Wenn body explizit übergeben wird, hängen wir qs an die URL an
            url = WORKER_URL + "?module=" + module + (qs ? "&" + qs : "");
            bodyContent = options.body;
        } else {
            // Ansonsten ist qs der Body und URL bleibt ohne qs
            url = WORKER_URL + "?module=" + module;
            bodyContent = (typeof paramsOrObj === 'object') ? JSON.stringify(paramsOrObj) : String(paramsOrObj || '');
        }
        fetchOptions.body = bodyContent;
    } else {
        url = WORKER_URL + "?module=" + module + (qs ? "&" + qs : "");
    }

    console.log('📡 apiFetch:', method, url);
    return fetch(url, fetchOptions);
}

// === LOGIN / LOGOUT ===
async function doLogin() {
    const u = document.getElementById('login-user').value;
    const p = document.getElementById('login-pw').value;
    const btn = document.querySelector('button[onclick="doLogin()"]');
    
    if (!u || !p) {
        document.getElementById('login-error').classList.remove('d-none');
        return;
    }
    
    btn.disabled = true;
    btn.innerText = "Prüfe...";

    try {
        // Passwort mit SHA-256 hashen
        const hashedPw = await hashPassword(p);
        
        console.log("🔐 Login versuch:", u);
        console.log("🔑 Worker URL:", WORKER_URL);
        
        const res = await fetch(
            `${WORKER_URL}?module=admin&action=checkLogin&user=${encodeURIComponent(u)}&pw=${encodeURIComponent(hashedPw)}`,
            { headers: { 'X-CSRF-Token': getCsrfToken(), 'Content-Type': 'application/json' } }
        );
        
        console.log("📡 Response Status:", res.status);
        const data = await res.json();
        console.log("📋 Response Data:", data);

        if (data.success) {
            currentUser = data.name;
            const roles = Array.isArray(data.roles)
                ? data.roles
                : [data.role || 'gast'];
            currentRoles = roles
                .map(r => String(r || '').trim().toLowerCase())
                .filter(Boolean);
            userRole = currentRoles[0] || 'gast';
            currentRole = userRole;
            
            // AppState aktualisieren
            AppState.set('currentUser', currentUser);
            AppState.set('currentRoles', currentRoles);
            AppState.set('userRole', userRole);
            
            localStorage.setItem('portal_user', currentUser);
            localStorage.setItem('portal_role', userRole);
            localStorage.setItem('portal_roles', currentRoles.join(','));
            
            // Neue Felder aus der DB für Mails speichern
            localStorage.setItem('portal_mailanzeige', data.mailanzeige || data.Mailanzeige || currentUser);
            localStorage.setItem('portal_rolle_extern', data.rolle_extern || data.Rolle_extern || '');

            showApp();
            showSuccess('Willkommen, ' + currentUser + '!');
        } else {
            document.getElementById('login-error').classList.remove('d-none');
            showError("Login fehlgeschlagen: " + (data.error || "Unbekannt"));
        }
    } catch (e) {
        console.error("❌ Verbindungsfehler:", e);
        showError("Verbindungsfehler: " + e.message);
    }
    btn.disabled = false;
    btn.innerText = "Einloggen";
}

function doLogout() {
    localStorage.removeItem('portal_user');
    localStorage.removeItem('portal_role');
    localStorage.removeItem('portal_roles');
    sessionStorage.removeItem('csrf_token');
    csrfToken = null;
    currentRoles = [];
    location.reload();
}
