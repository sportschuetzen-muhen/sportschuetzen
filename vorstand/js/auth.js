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

// =========================================================
//  LOGIN UI HELPER
// =========================================================
function toggleLoginPasswordVisibility() {
    const pw = document.getElementById('login-pw');
    const icon = document.getElementById('login-pw-toggle-icon');
    if (!pw) return;
    if (pw.type === 'password') {
        pw.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        pw.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

function setLoginError(msg) {
    const errDiv = document.getElementById('login-error');
    const errText = document.getElementById('login-error-text');
    if (errText) errText.textContent = msg;
    else if (errDiv) errDiv.textContent = msg;
    if (errDiv) errDiv.classList.remove('d-none');
}

function togglePasswordVisibility(inputId, iconId) {
    const inp = document.getElementById(inputId);
    const icon = document.getElementById(iconId);
    if (!inp) return;
    if (inp.type === 'password') {
        inp.type = 'text';
        if (icon) {
            icon.classList.remove('fa-eye');
            icon.classList.add('fa-eye-slash');
        }
    } else {
        inp.type = 'password';
        if (icon) {
            icon.classList.remove('fa-eye-slash');
            icon.classList.add('fa-eye');
        }
    }
}

// =========================================================
//  AUTHENTICATED STATE HELPER
// =========================================================
async function applyAuthenticatedUser(authUser, loginIdentifier, profData, resolvedData) {
    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    const targetEmail = authUser.email;

    // Rollen ermitteln (JWT app_metadata oder user_roles Tabelle)
    let roles = (authUser.app_metadata && Array.isArray(authUser.app_metadata.roles)) ? authUser.app_metadata.roles : [];
    if (roles.length === 0 && supa) {
        try {
            const { data: rData } = await supa.from('user_roles').select('role').eq('user_id', authUser.id);
            if (rData && rData.length > 0) roles = rData.map(x => x.role);
        } catch (rErr) {
            console.warn("Konnte user_roles nicht abfragen:", rErr);
        }
    }

    let prof = profData;
    if (!prof && supa) {
        const { data: p } = await supa.from('admin_profiles')
            .select('*')
            .or(`auth_user_id.eq.${authUser.id},email.eq.${targetEmail}`)
            .maybeSingle();
        prof = p;
    }

    window.currentUser = (prof && prof.display_name) || (resolvedData && resolvedData.name) || authUser.email.split('@')[0];
    window.currentRoles = roles.length > 0 ? roles.map(r => String(r).trim().toLowerCase()) : ['vorstand'];
    window.userRole = window.currentRoles[0] || 'vorstand';
    window.currentRole = window.userRole;

    if (window.AppState) {
        AppState.set('currentUser', window.currentUser);
        AppState.set('currentRoles', window.currentRoles);
        AppState.set('userRole', window.userRole);
    }

    localStorage.setItem('portal_user', window.currentUser);
    localStorage.setItem('portal_role', window.userRole);
    localStorage.setItem('portal_roles', window.currentRoles.join(','));
    localStorage.setItem('portal_login_id', loginIdentifier || targetEmail);
    localStorage.setItem('portal_mailadresse', targetEmail);
    localStorage.setItem('portal_mailanzeige', targetEmail);
    localStorage.setItem('portal_personnumber', (prof && prof.person_number) || (resolvedData && resolvedData.person_number) || '');
    localStorage.setItem('portal_rolle_extern', (prof && prof.role_external) || '');

    // Letzten Login aktualisieren
    if (prof && prof.id && supa) {
        supa.from('admin_profiles').update({ last_login_at: new Date().toISOString() }).eq('id', prof.id).then();
    }

    if (typeof showApp === 'function') showApp();
    if (typeof pingPresence === 'function') pingPresence();
}

// =========================================================
//  MODALS & PASSWORT-RESET / MAGIC-LINK
// =========================================================
function openForgotPasswordModal() {
    const alertDiv = document.getElementById('forgot-pw-alert');
    if (alertDiv) alertDiv.classList.add('d-none');
    const existingVal = (document.getElementById('login-user')?.value || '').trim();
    const input = document.getElementById('forgot-pw-input');
    if (input && existingVal) input.value = existingVal;

    const modal = new bootstrap.Modal(document.getElementById('forgot-password-modal'));
    modal.show();
}

function openMagicLinkModal() {
    const alertDiv = document.getElementById('magic-link-alert');
    if (alertDiv) alertDiv.classList.add('d-none');
    const existingVal = (document.getElementById('login-user')?.value || '').trim();
    const input = document.getElementById('magic-link-input');
    if (input && existingVal) input.value = existingVal;

    const modal = new bootstrap.Modal(document.getElementById('magic-link-modal'));
    modal.show();
}

function openRecoveryPasswordModal() {
    const alertDiv = document.getElementById('recovery-alert');
    if (alertDiv) alertDiv.classList.add('d-none');
    const modalEl = document.getElementById('recovery-password-modal');
    if (modalEl) {
        const modal = new bootstrap.Modal(modalEl);
        modal.show();
    }
}

async function submitForgotPassword(e) {
    if (e && e.preventDefault) e.preventDefault();
    const inputVal = (document.getElementById('forgot-pw-input')?.value || '').trim();
    const btn = document.getElementById('btn-forgot-pw-submit');
    const alertDiv = document.getElementById('forgot-pw-alert');

    if (!inputVal) {
        if (alertDiv) {
            alertDiv.className = 'alert alert-danger py-2 px-3 small mb-3';
            alertDiv.textContent = 'Bitte Benutzername oder E-Mail eingeben.';
            alertDiv.classList.remove('d-none');
        }
        return;
    }

    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!supa || !supa.auth) {
        showError("Supabase Auth ist nicht verfügbar.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Prüfe & sende...';
    }

    try {
        let targetEmail = inputVal.includes('@') ? inputVal : null;

        // Falls Username / PersonNumber eingegeben wurde: auflösen
        if (!targetEmail) {
            try {
                const { data: res } = await supa.rpc('resolve_login_identifier', { p_identifier: inputVal });
                if (res && res.success && res.email) {
                    targetEmail = res.email;
                }
            } catch (rpcEx) {
                console.warn("Identifier resolution failed:", rpcEx);
            }
        }

        if (!targetEmail) {
            throw new Error(`Keine hinterlegte E-Mail-Adresse für «${inputVal}» gefunden. Bitte Admin kontaktieren.`);
        }

        const redirectUrl = window.location.origin + window.location.pathname;
        const { error: resetErr } = await supa.auth.resetPasswordForEmail(targetEmail, {
            redirectTo: redirectUrl
        });

        if (resetErr) throw resetErr;

        if (alertDiv) {
            alertDiv.className = 'alert alert-success py-2.5 px-3 small mb-3';
            alertDiv.innerHTML = `<i class="fas fa-check-circle me-1"></i> Ein Reset-Link wurde erfolgreich an <strong>${escapeHtml(targetEmail)}</strong> gesendet! Bitte prüfe deinen Posteingang.`;
            alertDiv.classList.remove('d-none');
        }
        if (btn) btn.classList.add('d-none');
    } catch (err) {
        console.error("Fehler bei submitForgotPassword:", err);
        if (alertDiv) {
            alertDiv.className = 'alert alert-danger py-2 px-3 small mb-3';
            alertDiv.textContent = err.message || 'Fehler beim Versenden des Links.';
            alertDiv.classList.remove('d-none');
        }
    } finally {
        if (btn && !alertDiv?.classList.contains('alert-success')) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-paper-plane me-1"></i> Reset-Link anfordern';
        }
    }
}

async function submitMagicLink(e) {
    if (e && e.preventDefault) e.preventDefault();
    const inputVal = (document.getElementById('magic-link-input')?.value || '').trim();
    const btn = document.getElementById('btn-magic-link-submit');
    const alertDiv = document.getElementById('magic-link-alert');

    if (!inputVal) {
        if (alertDiv) {
            alertDiv.className = 'alert alert-danger py-2 px-3 small mb-3';
            alertDiv.textContent = 'Bitte Benutzername oder E-Mail eingeben.';
            alertDiv.classList.remove('d-none');
        }
        return;
    }

    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!supa || !supa.auth) {
        showError("Supabase Auth ist nicht verfügbar.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Sende Anmelde-Link...';
    }

    try {
        let targetEmail = inputVal.includes('@') ? inputVal : null;

        if (!targetEmail) {
            try {
                const { data: res } = await supa.rpc('resolve_login_identifier', { p_identifier: inputVal });
                if (res && res.success && res.email) {
                    targetEmail = res.email;
                }
            } catch (rpcEx) {
                console.warn("Identifier resolution failed:", rpcEx);
            }
        }

        if (!targetEmail) {
            throw new Error(`Keine E-Mail-Adresse für «${inputVal}» gefunden. Bitte Admin kontaktieren.`);
        }

        const redirectUrl = window.location.origin + window.location.pathname;
        const { error: otpErr } = await supa.auth.signInWithOtp({
            email: targetEmail,
            options: {
                emailRedirectTo: redirectUrl
            }
        });

        if (otpErr) throw otpErr;

        if (alertDiv) {
            alertDiv.className = 'alert alert-success py-2.5 px-3 small mb-3';
            alertDiv.innerHTML = `<i class="fas fa-check-circle me-1"></i> Der Anmelde-Link wurde an <strong>${escapeHtml(targetEmail)}</strong> gesendet! Klicke in der E-Mail auf den Link, um dich sofort anzumelden.`;
            alertDiv.classList.remove('d-none');
        }
        if (btn) btn.classList.add('d-none');
    } catch (err) {
        console.error("Fehler bei submitMagicLink:", err);
        if (alertDiv) {
            alertDiv.className = 'alert alert-danger py-2 px-3 small mb-3';
            alertDiv.textContent = err.message || 'Fehler beim Versenden des Anmelde-Links.';
            alertDiv.classList.remove('d-none');
        }
    } finally {
        if (btn && !alertDiv?.classList.contains('alert-success')) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-magic me-1"></i> Anmelde-Link senden';
        }
    }
}

async function submitRecoveryPassword(e) {
    if (e && e.preventDefault) e.preventDefault();
    const newPw = (document.getElementById('recovery-new-pw')?.value || '').trim();
    const confirmPw = (document.getElementById('recovery-confirm-pw')?.value || '').trim();
    const btn = document.getElementById('btn-recovery-submit');
    const alertDiv = document.getElementById('recovery-alert');

    if (newPw.length < 6) {
        if (alertDiv) {
            alertDiv.className = 'alert alert-danger py-2 px-3 small mb-3';
            alertDiv.textContent = 'Das Passwort muss mindestens 6 Zeichen lang sein.';
            alertDiv.classList.remove('d-none');
        }
        return;
    }

    if (newPw !== confirmPw) {
        if (alertDiv) {
            alertDiv.className = 'alert alert-danger py-2 px-3 small mb-3';
            alertDiv.textContent = 'Die Passwörter stimmen nicht überein.';
            alertDiv.classList.remove('d-none');
        }
        return;
    }

    const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
    if (!supa || !supa.auth) {
        showError("Supabase Auth nicht verfügbar.");
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Speichere neues Passwort...';
    }

    try {
        const { data: updateData, error: updateErr } = await supa.auth.updateUser({
            password: newPw
        });

        if (updateErr) throw updateErr;

        if (alertDiv) {
            alertDiv.className = 'alert alert-success py-2 px-3 small mb-3';
            alertDiv.innerHTML = '<i class="fas fa-check-circle me-1"></i> Passwort erfolgreich geändert! Du wirst angemeldet...';
            alertDiv.classList.remove('d-none');
        }

        setTimeout(async () => {
            const modalEl = document.getElementById('recovery-password-modal');
            if (modalEl) {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            if (updateData && updateData.user) {
                await applyAuthenticatedUser(updateData.user, updateData.user.email);
                showSuccess("Willkommen zurück! Passwort wurde erfolgreich aktualisiert.");
            } else {
                location.reload();
            }
        }, 1200);

    } catch (err) {
        console.error("Fehler bei submitRecoveryPassword:", err);
        if (alertDiv) {
            alertDiv.className = 'alert alert-danger py-2 px-3 small mb-3';
            alertDiv.textContent = err.message || 'Passwort-Aktualisierung fehlgeschlagen.';
            alertDiv.classList.remove('d-none');
        }
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-check-circle me-1"></i> Passwort speichern & anmelden';
        }
    }
}

// === LOGIN / LOGOUT (Supabase Native Auth Integration) ===
async function doLogin() {
    const u = (document.getElementById('login-user')?.value || '').trim();
    const p = (document.getElementById('login-pw')?.value || '').trim();
    const btn = document.getElementById('btn-login-submit') || document.querySelector('button[onclick="doLogin()"]');
    const errDiv = document.getElementById('login-error');
    
    if (!u || !p) {
        setLoginError("Bitte Benutzername/E-Mail und Passwort eingeben.");
        return;
    }
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Prüfe Anmeldung...';
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
                    await applyAuthenticatedUser(authData.user, u, null, resolvedData);

                    loginSuccessful = true;
                    showSuccess('Willkommen, ' + window.currentUser + '! (Supabase Auth)');
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
                setLoginError("Login fehlgeschlagen: Ungültige Anmeldedaten.");
                showError("Login fehlgeschlagen. Bitte Benutzername und Passwort prüfen.");
            }
        }
    } catch (e) {
        console.error("❌ Login-Verbindungsfehler:", e);
        setLoginError("Verbindungsfehler: " + e.message);
        showError("Verbindungsfehler: " + e.message);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fas fa-sign-in-alt me-1"></i> Anmelden';
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

// Supabase Session Auto-Restore & Auth Event Listener
(async function initSupabaseAuthListener() {
    try {
        const setupAuth = async () => {
            const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
            if (!supa || !supa.auth) return;

            // 1. URL Hash prüfen (z.B. type=recovery von Supabase Reset-Mail)
            const hash = window.location.hash || '';
            if (hash.includes('type=recovery')) {
                console.log("🔑 Recovery-Token im URL-Hash erkannt!");
                setTimeout(() => openRecoveryPasswordModal(), 300);
            }

            // 2. Auth State Listener
            supa.auth.onAuthStateChange(async (event, session) => {
                console.log("🔔 Supabase Auth Event:", event);
                if (event === 'PASSWORD_RECOVERY') {
                    console.log("🔑 PASSWORD_RECOVERY Event ausgelöst!");
                    openRecoveryPasswordModal();
                } else if (event === 'SIGNED_IN' && session && session.user) {
                    if (!window.currentUser) {
                        console.log("✨ Automatische Anmeldung via Auth Event:", session.user.email);
                        await applyAuthenticatedUser(session.user, session.user.email);
                    }
                } else if (event === 'SIGNED_OUT') {
                    console.log("🚪 Abgemeldet via Supabase Auth");
                }
            });

            // 3. Bestehende Session beim Seitenstart prüfen
            const { data } = await supa.auth.getSession();
            if (data && data.session && !window.currentUser) {
                const user = data.session.user;
                console.log("🔄 Supabase Session wiederhergestellt für:", user.email);
                await applyAuthenticatedUser(user, user.email);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupAuth);
        } else {
            setTimeout(setupAuth, 400);
        }
    } catch (e) {
        console.warn("Auth Listener Check fehlgeschlagen:", e);
    }
})();


