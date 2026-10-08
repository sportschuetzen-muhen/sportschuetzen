/**
 * Sportschützen Muhen - Central Auth & Member Session Manager (SSO)
 * 
 * Verwaltet den Mitglieder-Anmeldestatus auf der Homepage:
 * - Übernimmt Session-Tickets aus der Schützen-Web-App (?auth_session=...)
 * - Synchronisiert Session über localStorage und Storage-Events
 * - Ermöglicht nahtlosen Absprung zum Web-App Login mit automatischem Rücksprung
 * - Bereitstellung von Rollen-Checks (member, vorstand, admin)
 */

(function(window) {
    'use strict';

    const STORAGE_KEY = 'sm_member_session';
    const MAX_SESSION_AGE_DAYS = 60;
    const SUPABASE_URL = 'https://supabase-muhen.danfamily.uk';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';

    class AuthSessionManager {
        constructor() {
            this._listeners = [];
            this._session = null;
            this._supabase = null;
            this.init();
        }

        async init() {
            // 0. Supabase Client initialisieren
            this._initSupabase();

            // 1. URL-Parameter prüfen (Rücksprung von der Web-App mit auth_session)
            this._checkUrlForAuthTicket();

            // 2. Lokale Session laden
            this._loadSession();

            // 3. Native Supabase Session verifizieren (falls GoTrue aktiv ist)
            await this._checkSupabaseSession();

            // 4. Tab-übergreifendes Synchronisieren
            window.addEventListener('storage', (e) => {
                if (e.key === STORAGE_KEY || e.key === 'sportschuetzen_user') {
                    this._loadSession();
                    this._notify();
                }
            });
        }

        _initSupabase() {
            try {
                if (window.supabase && typeof window.supabase.createClient === 'function') {
                    this._supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
                    this._supabase.auth.onAuthStateChange(async (event, session) => {
                        if (event === 'SIGNED_IN' && session) {
                            await this._syncFromSupabaseUser(session.user);
                        } else if (event === 'SIGNED_OUT') {
                            this.logout(false);
                        }
                    });
                }
            } catch (err) {
                console.warn('Supabase Client konnte nicht initialisiert werden:', err);
            }
        }

        async _checkSupabaseSession() {
            if (!this._supabase) return;
            try {
                const { data, error } = await this._supabase.auth.getSession();
                if (!error && data?.session?.user) {
                    if (!this.isLoggedIn()) {
                        await this._syncFromSupabaseUser(data.session.user);
                    }
                }
            } catch (e) {
                console.warn('Fehler bei Supabase Session-Prüfung:', e);
            }
        }

        async _syncFromSupabaseUser(user) {
            try {
                let authedUser = null;
                const { data: syncRes } = await this._supabase.rpc('sync_member_auth_session');
                if (syncRes && syncRes.success) {
                    authedUser = {
                        id: String(syncRes.person_number || syncRes.address_number || user.id),
                        lizenz: String(syncRes.person_number || syncRes.address_number || '').padStart(6, '0'),
                        vorname: syncRes.firstname || syncRes.display_name,
                        nachname: syncRes.lastname || '',
                        name: syncRes.display_name,
                        email: syncRes.email || user.email,
                        role: syncRes.primary_role || 'member',
                        roles: syncRes.roles || ['member'],
                        is_board: Boolean(syncRes.is_board),
                        savedAt: Date.now()
                    };
                } else {
                    const emailName = (user.email || '').split('@')[0];
                    authedUser = {
                        id: user.id,
                        name: emailName,
                        vorname: emailName,
                        email: user.email,
                        role: 'member',
                        roles: ['member'],
                        savedAt: Date.now()
                    };
                }

                this._session = authedUser;
                localStorage.setItem(STORAGE_KEY, JSON.stringify(authedUser));
                localStorage.setItem('sportschuetzen_user', JSON.stringify(authedUser));
                this._notify();
            } catch (err) {
                console.error('Konnte Mitgliedsdaten nicht über Supabase synchronisieren:', err);
            }
        }

        /**
         * Prüft, ob ein auth_session Ticket in der URL übergeben wurde.
         */
        _checkUrlForAuthTicket() {
            try {
                const urlParams = new URLSearchParams(window.location.search);
                const ticket = urlParams.get('auth_session');
                if (!ticket) return;

                // Base64 decodieren (sicher mit UTF-8 Sonderzeichen)
                const decodedStr = decodeURIComponent(atob(ticket));
                const sessionData = JSON.parse(decodedStr);

                if (sessionData && (sessionData.id || sessionData.name)) {
                    sessionData.savedAt = Date.now();
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(sessionData));
                    localStorage.setItem('sportschuetzen_user', JSON.stringify(sessionData));
                    console.log('✅ SSO-Session erfolgreich aus Web-App übernommen:', sessionData.name);
                }

                // URL sauber bereinigen ohne Neuladen
                urlParams.delete('auth_session');
                const cleanQuery = urlParams.toString() ? `?${urlParams.toString()}` : '';
                const cleanUrl = window.location.pathname + cleanQuery + window.location.hash;
                window.history.replaceState({}, document.title, cleanUrl);
            } catch (err) {
                console.warn('⚠️ Fehler beim Einlesen des Auth-Tickets:', err);
            }
        }

        /**
         * Lädt und validiert die Session aus localStorage.
         */
        _loadSession() {
            try {
                const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('sportschuetzen_user');
                if (!raw) {
                    this._session = null;
                    return;
                }

                const data = JSON.parse(raw);
                const now = Date.now();

                // Ablauf nach 60 Tagen prüfen
                if (data.savedAt && (now - data.savedAt > MAX_SESSION_AGE_DAYS * 24 * 60 * 60 * 1000)) {
                    console.info('Session ist abgelaufen.');
                    localStorage.removeItem(STORAGE_KEY);
                    localStorage.removeItem('sportschuetzen_user');
                    this._session = null;
                    return;
                }

                this._session = data;
            } catch (e) {
                console.error('Fehler beim Laden der Session:', e);
                this._session = null;
            }
        }

        /**
         * Ist der Benutzer aktuell als Vereinsmitglied angemeldet?
         */
        isLoggedIn() {
            return !!(this._session && (this._session.id || this._session.name));
        }

        /**
         * Liefert das Profil des angemeldeten Mitglieds oder null.
         */
        getUser() {
            return this._session ? { ...this._session } : null;
        }

        /**
         * Prüft, ob der Benutzer eine bestimmte Rolle hat (z. B. 'vorstand' oder 'admin').
         */
        hasRole(role) {
            if (!this.isLoggedIn()) return false;
            const r = String(this._session.role || '').toLowerCase();
            const roles = Array.isArray(this._session.roles) 
                ? this._session.roles.map(x => String(x).toLowerCase()) 
                : [];

            if (r === 'admin' || roles.includes('admin')) return true; // Admin hat alle Rechte
            return r === role.toLowerCase() || roles.includes(role.toLowerCase());
        }

        /**
         * Ist der Nutzer Vorstandsmitglied oder Admin?
         */
        isVorstand() {
            return this.hasRole('vorstand') || this.hasRole('admin') || Boolean(this._session?.is_board);
        }

        /**
         * Generiert die Ziel-URL zur Schützen-Web-App mit automatischem Rücksprung.
         */
        getLoginUrl(returnTarget) {
            const currentFullUrl = returnTarget 
                ? (returnTarget.startsWith('http') ? returnTarget : `${window.location.origin}${window.location.pathname.replace(/[^/]+$/, '')}${returnTarget.replace(/^\//, '')}`)
                : window.location.href;

            const hostname = window.location.hostname;
            let webAppBase = '';

            if (hostname === 'localhost' || hostname === '127.0.0.1') {
                webAppBase = window.location.pathname.includes('/sportschuetzen-website/') 
                    ? '../../index.html' 
                    : '/index.html';
            } else if (hostname.includes('pages.dev')) {
                webAppBase = window.location.origin + '/index.html';
            } else if (hostname.includes('sportschuetzen-muhen.ch')) {
                webAppBase = 'https://sportschuetzen-muhen.ch/app/';
            } else {
                webAppBase = 'https://sportschuetzen-muhen.github.io/sportschuetzen/';
            }

            const sep = webAppBase.includes('?') ? '&' : '?';
            return `${webAppBase}${sep}redirect=${encodeURIComponent(currentFullUrl)}`;
        }

        /**
         * Startet den Login-Prozess durch Weiterleitung zur Schützen-Web-App.
         */
        login(returnTarget) {
            const target = this.getLoginUrl(returnTarget);
            window.location.href = target;
        }

        /**
         * Meldet das Mitglied auf der Homepage ab.
         */
        logout(signOutSupabase = true) {
            if (signOutSupabase && this._supabase) {
                try {
                    this._supabase.auth.signOut().catch(() => {});
                } catch (_) {}
            }
            localStorage.removeItem(STORAGE_KEY);
            localStorage.removeItem('sportschuetzen_user');
            this._session = null;
            this._notify();
            console.log('Mitglied abgemeldet.');
        }

        /**
         * Registriert einen Callback bei Login/Logout-Änderungen.
         */
        onChange(callback) {
            if (typeof callback === 'function') {
                this._listeners.push(callback);
                // Direkt mit aktuellem Status aufrufen
                callback(this.getUser());
            }
        }

        _notify() {
            const user = this.getUser();
            this._listeners.forEach(fn => {
                try { fn(user); } catch (e) { console.error(e); }
            });
            window.dispatchEvent(new CustomEvent('sm:auth-change', { detail: { user } }));
        }
    }

    // Global instanziieren
    window.AuthSession = new AuthSessionManager();

})(window);
