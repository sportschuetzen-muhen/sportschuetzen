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
    const MAX_SESSION_AGE_DAYS = 30;

    class AuthSessionManager {
        constructor() {
            this._listeners = [];
            this._session = null;
            this.init();
        }

        init() {
            // 1. URL-Parameter prüfen (Rücksprung von der Web-App)
            this._checkUrlForAuthTicket();

            // 2. Lokale Session laden
            this._loadSession();

            // 3. Tab-übergreifendes Synchronisieren
            window.addEventListener('storage', (e) => {
                if (e.key === STORAGE_KEY) {
                    this._loadSession();
                    this._notify();
                }
            });
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
                const raw = localStorage.getItem(STORAGE_KEY);
                if (!raw) {
                    this._session = null;
                    return;
                }

                const data = JSON.parse(raw);
                const now = Date.now();

                // Ablauf nach z. B. 30 Tagen prüfen
                if (data.savedAt && (now - data.savedAt > MAX_SESSION_AGE_DAYS * 24 * 60 * 60 * 1000)) {
                    console.info('Session ist abgelaufen.');
                    localStorage.removeItem(STORAGE_KEY);
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
            return this.hasRole('vorstand') || this.hasRole('admin');
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

            if (hostname.includes('github.io')) {
                // Auf GitHub Pages
                webAppBase = 'https://sportschuetzen-muhen.github.io/sportschuetzen/';
            } else if (hostname.includes('sportschuetzen-muhen.ch')) {
                // Künftige Vereinsdomain
                webAppBase = 'https://sportschuetzen-muhen.ch/app/';
            } else {
                // Lokale Entwicklung oder Test-Server
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
        logout() {
            localStorage.removeItem(STORAGE_KEY);
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
