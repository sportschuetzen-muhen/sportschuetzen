/**
 * Sportschützen Muhen - Web Components
 * Zentrale, wiederverwendbare Komponenten für Header & Footer (DRY-Prinzip)
 * Nativ kompatibel mit GitHub Pages ohne Build-Schritt.
 */

class SiteHeader extends HTMLElement {
    connectedCallback() {
        const active = this.getAttribute('active') || '';
        const type = this.getAttribute('type') || 'standard';

        if (type === 'admin') {
            this.innerHTML = `
                <header class="glass-nav">
                    <div class="container nav-content">
                        <a href="index.html" class="logo">
                            <span class="red-dot"></span>
                            Sportschützen <span class="text-bold">Muhen</span> <span style="font-size:0.85rem; background:rgba(15,60,92,0.1); padding:2px 8px; border-radius:4px; margin-left:6px; font-weight:600;">Intern</span>
                        </a>
                        <div style="display: flex; gap: 0.75rem;">
                            <a href="resultate.html" class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">Resultate</a>
                            <a href="index.html" class="btn btn-outline" style="padding: 0.4rem 0.8rem; font-size: 0.9rem;">Zur Website</a>
                        </div>
                    </div>
                </header>
            `;
            return;
        }

        this.innerHTML = `
            <header class="glass-nav">
                <div class="container nav-content">
                    <a href="index.html" class="logo">
                        <img src="assets/logo.png" alt="Sportschützen Muhen Logo" class="logo-img">
                        Sportschützen <span class="text-bold">Muhen</span>
                    </a>
                    
                    <!-- Mobile Menu Toggle Button -->
                    <button class="mobile-toggle" id="mobile-toggle" aria-label="Navigation öffnen" aria-expanded="false">
                        <span></span>
                        <span></span>
                        <span></span>
                    </button>

                    <nav class="desktop-nav" id="nav-links" aria-label="Hauptnavigation">
                        <a href="index.html#home" class="${active === 'home' ? 'active' : ''}">Willkommen</a>
                        <a href="verein.html" class="${active === 'verein' ? 'active' : ''}">Verein</a>
                        <a href="verein.html#galerie" class="${active === 'galerie' ? 'active' : ''}">Galerie</a>
                        <a href="index.html#termine" class="${active === 'termine' ? 'active' : ''}">Termine</a>
                        <a href="index.html#reports" class="${active === 'reports' ? 'active' : ''}">Berichte</a>
                        <a href="resultate.html" class="${active === 'resultate' ? 'active' : ''}">Resultate</a>
                        <a href="verein.html#mitglieder" id="nav-intern-link" class="${active === 'mitglieder' ? 'active' : ''}" style="display: none; color: var(--accent-color); font-weight: 700;">🔐 Intern</a>
                        <a href="schuetzenhaus_vermietung.html" class="nav-cta-btn ${active === 'vermietung' ? 'active' : ''}">🏠 Vermietung</a>
                        <div id="nav-member-badge" class="nav-member-badge" style="display: inline-flex; align-items: center; margin-left: 0.25rem;"></div>
                    </nav>
                </div>
            </header>
        `;

        this.initMobileNav();
        this.initMemberBadge();
    }

    initMobileNav() {
        const toggle = this.querySelector('#mobile-toggle');
        const nav = this.querySelector('#nav-links');
        if (!toggle || !nav) return;

        // Mark toggle to avoid duplicate listeners from legacy scripts
        toggle.setAttribute('data-bound', 'true');

        // Toggle mobile menu
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            const isOpen = nav.classList.toggle('open');
            toggle.classList.toggle('active', isOpen);
            toggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
            document.body.classList.toggle('no-scroll', isOpen);
        });

        // Close and smooth-scroll on link click
        nav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', (e) => {
                nav.classList.remove('open');
                toggle.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
                document.body.classList.remove('no-scroll');

                const href = link.getAttribute('href');
                const isCurrentIndex = window.location.pathname.endsWith('index.html') || 
                                       window.location.pathname === '/' || 
                                       window.location.pathname.endsWith('/');

                if (isCurrentIndex && href.includes('#')) {
                    const hash = '#' + href.split('#')[1];
                    const targetEl = document.querySelector(hash);
                    if (targetEl) {
                        e.preventDefault();
                        targetEl.scrollIntoView({ behavior: 'smooth' });
                        window.history.pushState(null, '', hash);
                        
                        // Active State aktualisieren
                        nav.querySelectorAll('a').forEach(a => a.classList.remove('active'));
                        link.classList.add('active');
                    }
                }
            });
        });

        // Close on Escape key
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && nav.classList.contains('open')) {
                nav.classList.remove('open');
                toggle.classList.remove('active');
                toggle.setAttribute('aria-expanded', 'false');
                document.body.classList.remove('no-scroll');
            }
        });
    }

    initMemberBadge() {
        const badge = this.querySelector('#nav-member-badge');
        const internLink = this.querySelector('#nav-intern-link');
        if (!badge) return;

        const updateUI = () => {
            if (!window.AuthSession) return;
            const user = window.AuthSession.getUser();
            if (user) {
                if (internLink) internLink.style.display = 'inline-block';
                const displayName = user.vorname || (user.name ? user.name.split(' ')[0] : 'Mitglied');
                const isVorstand = window.AuthSession.isVorstand();
                const roleText = isVorstand ? 'Vorstand' : 'Mitglied';
                badge.innerHTML = `
                    <div class="nav-user-menu" id="nav-user-menu" style="position: relative;">
                        <button class="nav-user-chip" id="nav-user-chip-btn" type="button" aria-expanded="false" aria-haspopup="true" style="display: flex; align-items: center; gap: 0.4rem; background: rgba(15, 60, 92, 0.08); border: 1px solid rgba(15, 60, 92, 0.15); padding: 0.3rem 0.75rem; border-radius: 20px; font-size: 0.82rem; font-weight: 600; cursor: pointer; color: var(--text-color); font-family: inherit;">
                            <span>👤 ${displayName}</span>
                            <span style="background: ${isVorstand ? 'var(--accent-color)' : 'var(--primary-color)'}; color: white; font-size: 0.65rem; padding: 2px 6px; border-radius: 6px; text-transform: uppercase;">${roleText}</span>
                            <span style="font-size: 0.7rem; opacity: 0.6;">▾</span>
                        </button>
                        <div class="nav-user-dropdown" id="nav-user-dropdown-menu" style="display: none; position: absolute; right: 0; top: calc(100% + 8px); background: #ffffff; min-width: 220px; border-radius: 12px; box-shadow: 0 10px 25px rgba(15, 60, 92, 0.15); border: 1px solid rgba(15, 60, 92, 0.1); padding: 0.5rem 0; z-index: 1000; text-align: left;">
                            <div style="padding: 0.5rem 1rem; border-bottom: 1px solid rgba(0,0,0,0.06); font-size: 0.78rem; color: var(--text-muted);">
                                Angemeldet als <b style="color: var(--primary-color); display: block;">${user.name || displayName}</b>
                            </div>
                            <a href="verein.html#mitglieder" class="dropdown-link" style="display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1rem; color: var(--text-color); text-decoration: none; font-size: 0.88rem; font-weight: 600;">
                                <span>📂</span> <span>Mitgliederbereich</span>
                            </a>
                            <a href="https://sportschuetzen-muhen.github.io/sportschuetzen/" target="_blank" rel="noopener" class="dropdown-link" style="display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1rem; color: var(--text-color); text-decoration: none; font-size: 0.88rem; font-weight: 600;">
                                <span>🎯</span> <span>Schützen-App (PWA)</span>
                            </a>
                            ${isVorstand ? `
                            <a href="vorstand/index.html" class="dropdown-link" style="display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1rem; color: var(--accent-color); text-decoration: none; font-size: 0.88rem; font-weight: 700; background: rgba(220, 38, 38, 0.04);">
                                <span>👑</span> <span>Vorstandsportal</span>
                            </a>` : ''}
                            <div style="height: 1px; background: rgba(0,0,0,0.06); margin: 0.4rem 0;"></div>
                            <button type="button" id="nav-logout-dropdown-btn" style="width: 100%; border: none; background: none; display: flex; align-items: center; gap: 0.6rem; padding: 0.6rem 1rem; color: #dc2626; font-size: 0.88rem; font-weight: 600; cursor: pointer; text-align: left; font-family: inherit;">
                                <span>🚪</span> <span>Abmelden</span>
                            </button>
                        </div>
                    </div>
                `;

                const chipBtn = badge.querySelector('#nav-user-chip-btn');
                const dropdownMenu = badge.querySelector('#nav-user-dropdown-menu');
                const logoutBtn = badge.querySelector('#nav-logout-dropdown-btn');

                if (chipBtn && dropdownMenu) {
                    chipBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const isHidden = dropdownMenu.style.display === 'none';
                        dropdownMenu.style.display = isHidden ? 'block' : 'none';
                        chipBtn.setAttribute('aria-expanded', isHidden ? 'true' : 'false');
                    });

                    // Outside click
                    const onOutsideClick = (e) => {
                        if (!badge.contains(e.target)) {
                            dropdownMenu.style.display = 'none';
                            chipBtn.setAttribute('aria-expanded', 'false');
                        }
                    };
                    document.removeEventListener('click', badge._outsideHandler);
                    badge._outsideHandler = onOutsideClick;
                    document.addEventListener('click', onOutsideClick);
                }

                if (logoutBtn) {
                    logoutBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        if (confirm('Möchtest du dich abmelden?')) {
                            window.AuthSession.logout();
                        }
                    });
                }
            } else {
                if (internLink) internLink.style.display = 'none';
                badge.innerHTML = `
                    <button id="nav-login-btn" class="nav-login-btn" type="button" style="padding: 0.35rem 0.85rem; font-size: 0.82rem; border-radius: 20px; font-weight: 600; display: inline-flex; align-items: center; gap: 0.35rem; border: 1px solid var(--primary-color); color: var(--primary-color); background: transparent; cursor: pointer; font-family: inherit; transition: var(--transition);">
                        <span>🔐</span> <span>Login</span>
                    </button>
                `;
                const loginBtn = badge.querySelector('#nav-login-btn');
                if (loginBtn) {
                    loginBtn.addEventListener('click', (e) => {
                        e.preventDefault();
                        window.AuthSession.login('verein.html#mitglieder');
                    });
                }
            }
        };

        if (window.AuthSession) {
            window.AuthSession.onChange(updateUI);
        } else {
            window.addEventListener('DOMContentLoaded', () => {
                if (window.AuthSession) window.AuthSession.onChange(updateUI);
            });
        }
    }
}

class SiteFooter extends HTMLElement {
    connectedCallback() {
        const year = new Date().getFullYear();
        this.innerHTML = `
            <footer>
                <div class="container footer-content">
                    <div class="footer-brand">
                        <div class="logo">
                            <span class="red-dot"></span> Sportschützen Muhen
                        </div>
                        <p>Präzision & Kameradschaft seit 1919.</p>
                    </div>
                    <div class="footer-links">
                        <h4>Navigation</h4>
                        <a href="index.html#home">Willkommen</a>
                        <a href="verein.html">Verein</a>
                        <a href="verein.html#galerie">Fotogalerie</a>
                        <a href="resultate.html">Resultate</a>
                        <a href="schuetzenhaus_vermietung.html">Schützenhaus Vermietung</a>
                        <a href="datenschutz.html">Datenschutz</a>
                    </div>
                    <div class="footer-contact">
                        <h4>Standort & Kontakt</h4>
                        <p><a href="https://maps.google.com/?q=Sportschützen+Muhen+Rütelistrasse+Muhen" target="_blank" rel="noopener noreferrer" style="color: var(--accent-color); font-weight: 600;">📍 Schützenhaus Muhen<br>Rütelistrasse, 5037 Muhen</a></p>
                        <p style="margin-top: 0.5rem;"><a href="mailto:sportschuetzen.muhen@gmail.com" style="color: var(--text-muted); font-size: 0.9rem;">sportschuetzen.muhen@gmail.com</a></p>
                    </div>
                    <div class="footer-social">
                        <h4>Social Media</h4>
                        <p style="margin-bottom: 0.75rem;">Folgen Sie uns für Impressionen, Resultate und Vereinsleben:</p>
                        <div class="footer-social-links">
                            <a href="https://www.instagram.com/sportschuetzen.muhen/" target="_blank" rel="noopener noreferrer" class="social-btn social-btn-instagram" title="Sportschützen Muhen auf Instagram">
                                <svg class="social-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
                                    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
                                    <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
                                </svg>
                                <span>@sportschuetzen.muhen</span>
                            </a>
                            <a href="https://www.facebook.com/search/top?q=sportsch%C3%BCtzen%20muhen" target="_blank" rel="noopener noreferrer" class="social-btn social-btn-facebook" title="Sportschützen Muhen auf Facebook">
                                <svg class="social-icon" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                                </svg>
                                <span>Sportschützen Muhen</span>
                            </a>
                        </div>
                    </div>
                </div>
                <div class="footer-bottom">
                    <p>&copy; ${year} Sportschützen Muhen. Alle Rechte vorbehalten.</p>
                </div>
            </footer>
        `;
    }
}

// Custom Elements registrieren
if (!customElements.get('site-header')) {
    customElements.define('site-header', SiteHeader);
}
if (!customElements.get('site-footer')) {
    customElements.define('site-footer', SiteFooter);
}

// PWA Service Worker Registrierung (Offline-Fähigkeit für Schiessstand & Mobilgeräte)
if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => {
                console.log('✅ Service Worker aktiv:', reg.scope);
            })
            .catch(err => {
                console.warn('Service Worker Registrierung übersprungen/fehlgeschlagen:', err);
            });
    });
}
