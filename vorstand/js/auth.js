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

// Worker-Version abfragen und zur Diagnose im Entwicklerfenster loggen
(async function checkWorkerVersion() {
    try {
        const res = await fetch(WORKER_URL + "?action=version");
        if (res.ok) {
            const data = await res.json();
            console.log(`📡 Aktive Worker-Version auf Cloudflare: %c${data.version}`, "color: #198754; font-weight: bold;");
        } else {
            console.warn("⚠️ Worker-Versionscheck fehlgeschlagen (HTTP Status " + res.status + ")");
        }
    } catch (e) {
        console.warn("⚠️ Fehler beim Abfragen der Worker-Version (Netzwerkfehler/CORS):", e.message);
    }
})();

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
        const actionParam = (paramsOrObj && typeof paramsOrObj === 'object' && paramsOrObj.action) ? `&action=${encodeURIComponent(paramsOrObj.action)}` : '';
        if (options && typeof options === 'object' && options.body) {
            // Wenn body explizit übergeben wird, hängen wir qs an die URL an
            url = WORKER_URL + "?module=" + module + actionParam + (qs ? "&" + qs : "");
            bodyContent = options.body;
        } else {
            // Ansonsten ist paramsOrObj der Body; action bleibt zur Sicherheit in der URL
            url = WORKER_URL + "?module=" + module + actionParam;
            bodyContent = (typeof paramsOrObj === 'object') ? JSON.stringify(paramsOrObj) : String(paramsOrObj || '');
        }
        fetchOptions.body = bodyContent;
    } else {
        url = WORKER_URL + "?module=" + module + (qs ? "&" + qs : "");
    }

    console.log('📡 apiFetch:', method, url);
    return fetch(url, fetchOptions);
}

// === LOGIN / LOGOUT (Supabase Native Auth Integration) ===
async function doLogin() {
    const u = (document.getElementById('login-user')?.value || '').trim();
    const p = (document.getElementById('login-pw')?.value || '').trim();
    const btn = document.querySelector('button[onclick="doLogin()"]');
    const errDiv = document.getElementById('login-error');
    
    if (!u || !p) {
        if (errDiv) {
            errDiv.textContent = "Bitte Benutzername/E-Mail und Passwort eingeben.";
            errDiv.classList.remove('d-none');
        }
        return;
    }
    
    if (btn) {
        btn.disabled = true;
        btn.innerText = "Prüfe Anmeldung...";
    }
    if (errDiv) errDiv.classList.add('d-none');

    try {
        const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
        let loginSuccessful = false;

        // 1. PRIMÄRER WEG: Supabase Auth
        if (supa) {
            console.log("🔐 Starte Supabase Auth-Check für:", u);
            let targetEmail = u.includes('@') ? u : null;
            let resolvedData = null;

            // Identifikator auflösen (Username / SSV-PersonNumber / PIN -> E-Mail)
            try {
                const { data: res, error: rpcErr } = await supa.rpc('resolve_login_identifier', { p_identifier: u });
                if (!rpcErr && res && res.success && res.email) {
                    targetEmail = res.email;
                    resolvedData = res;
                    console.log("✅ Identifikator aufgelöst zu Auth-E-Mail:", targetEmail);
                }
            } catch (rpcEx) {
                console.warn("⚠️ Identifier RPC fehlgeschlagen, versuche Direktanmeldung:", rpcEx.message);
            }

            if (targetEmail) {
                const { data: authData, error: authErr } = await supa.auth.signInWithPassword({
                    email: targetEmail,
                    password: p
                });

                if (!authErr && authData && authData.user) {
                    console.log("✅ Supabase Auth erfolgreich:", authData.user.email);
                    const authUser = authData.user;

                    // Rollen ermitteln (JWT app_metadata oder user_roles Tabelle)
                    let roles = (authUser.app_metadata && Array.isArray(authUser.app_metadata.roles)) ? authUser.app_metadata.roles : [];
                    if (roles.length === 0) {
                        const { data: rData } = await supa.from('user_roles').select('role').eq('user_id', authUser.id);
                        if (rData && rData.length > 0) roles = rData.map(x => x.role);
                    }

                    // Admin-Profil abfragen
                    const { data: prof } = await supa.from('admin_profiles')
                        .select('*')
                        .or(`auth_user_id.eq.${authUser.id},email.eq.${targetEmail},username.eq.${u}`)
                        .maybeSingle();

                    currentUser = (prof && prof.display_name) || (resolvedData && resolvedData.name) || authUser.email.split('@')[0];
                    currentRoles = roles.length > 0 ? roles.map(r => String(r).trim().toLowerCase()) : ['vorstand'];
                    userRole = currentRoles[0] || 'vorstand';
                    currentRole = userRole;

                    // State setzen
                    AppState.set('currentUser', currentUser);
                    AppState.set('currentRoles', currentRoles);
                    AppState.set('userRole', userRole);

                    localStorage.setItem('portal_user', currentUser);
                    localStorage.setItem('portal_role', userRole);
                    localStorage.setItem('portal_roles', currentRoles.join(','));
                    localStorage.setItem('portal_login_id', u);
                    localStorage.setItem('portal_mailadresse', targetEmail);
                    localStorage.setItem('portal_mailanzeige', targetEmail);
                    localStorage.setItem('portal_personnumber', (prof && prof.person_number) || (resolvedData && resolvedData.person_number) || '');
                    localStorage.setItem('portal_rolle_extern', (prof && prof.role_external) || '');

                    // Letzten Login aktualisieren
                    if (prof && prof.id) {
                        supa.from('admin_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', prof.id).then();
                    }

                    loginSuccessful = true;
                    showApp();
                    showSuccess('Willkommen, ' + currentUser + '! (Supabase Auth)');
                    if (typeof pingPresence === 'function') pingPresence();
                } else {
                    console.warn("ℹ️ Supabase Auth Passwort-Check ergab:", authErr ? authErr.message : "Keine Session");
                }
            }
        }

        // 2. ÜBERGANGS-FALLBACK (falls Supabase-Passwort noch nicht gesetzt ist)
        if (!loginSuccessful) {
            console.log("🔄 Übergangs-Check via Worker für Migration...");
            const hashedPw = await hashPassword(p);
            const res = await fetch(
                `${WORKER_URL}?module=admin&action=checkLogin&user=${encodeURIComponent(u)}&pw=${encodeURIComponent(hashedPw)}`,
                { headers: { 'X-CSRF-Token': getCsrfToken(), 'Content-Type': 'application/json' } }
            );
            const data = await res.json();

            if (data.success) {
                currentUser = data.name;
                const roles = Array.isArray(data.roles) ? data.roles : [data.role || 'vorstand'];
                currentRoles = roles.map(r => String(r || '').trim().toLowerCase()).filter(Boolean);
                userRole = currentRoles[0] || 'vorstand';
                currentRole = userRole;

                AppState.set('currentUser', currentUser);
                AppState.set('currentRoles', currentRoles);
                AppState.set('userRole', userRole);

                localStorage.setItem('portal_user', currentUser);
                localStorage.setItem('portal_role', userRole);
                localStorage.setItem('portal_roles', currentRoles.join(','));
                localStorage.setItem('portal_login_id', u);
                localStorage.setItem('portal_mailadresse', data.mailadresse || data.Mailadresse || '');
                localStorage.setItem('portal_mailanzeige', data.mailadresse || data.Mailadresse || '');
                localStorage.setItem('portal_rolle_extern', data.rolle_extern || data.Rolle_extern || '');
                localStorage.setItem('portal_personnumber', data.personnumber || data.PersonNumber || '');

                loginSuccessful = true;
                showApp();
                showSuccess('Willkommen, ' + currentUser + '!');
                if (typeof pingPresence === 'function') pingPresence();
            } else {
                if (errDiv) {
                    errDiv.textContent = "Login fehlgeschlagen: Ungültige Anmeldedaten.";
                    errDiv.classList.remove('d-none');
                }
                showError("Login fehlgeschlagen. Bitte Benutzername und Passwort prüfen.");
            }
        }
    } catch (e) {
        console.error("❌ Login-Verbindungsfehler:", e);
        if (errDiv) {
            errDiv.textContent = "Verbindungsfehler: " + e.message;
            errDiv.classList.remove('d-none');
        }
        showError("Verbindungsfehler: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerText = "Einloggen";
        }
    }
}

async function doLogout() {
    try {
        const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
        if (supa && supa.auth) {
            await supa.auth.signOut();
        }
    } catch (err) {
        console.warn("Fehler bei Supabase signOut:", err);
    }
    localStorage.removeItem('portal_user');
    localStorage.removeItem('portal_role');
    localStorage.removeItem('portal_roles');
    localStorage.removeItem('portal_login_id');
    localStorage.removeItem('portal_personnumber');
    localStorage.removeItem('portal_mailadresse');
    localStorage.removeItem('portal_mailanzeige');
    localStorage.removeItem('portal_rolle_extern');
    sessionStorage.removeItem('csrf_token');
    sessionStorage.removeItem('portal_session_id');
    csrfToken = null;
    currentRoles = [];
    location.reload();
}

// Supabase Session Auto-Restore beim Seitenaufruf
(async function initSupabaseAuthListener() {
    try {
        const checkSession = async () => {
            const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
            if (!supa || !supa.auth) return;

            const { data } = await supa.auth.getSession();
            if (data && data.session && !window.currentUser) {
                const user = data.session.user;
                console.log("🔄 Supabase Session wiederhergestellt für:", user.email);
                const { data: prof } = await supa.from('admin_profiles').select('*').eq('auth_user_id', user.id).maybeSingle();
                
                window.currentUser = (prof && prof.display_name) || user.email.split('@')[0];
                window.userRole = 'vorstand';
                window.currentRole = 'vorstand';
                window.currentRoles = ['vorstand'];
                if (typeof showApp === 'function') showApp();
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkSession);
        } else {
            setTimeout(checkSession, 500);
        }
    } catch (e) {
        console.warn("Auth Listener Check fehlgeschlagen:", e);
    }
})();

