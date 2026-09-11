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
                        <a href="schuetzenhaus_vermietung.html" class="${active === 'vermietung' ? 'active' : ''}">Vermietung</a>
                        <a href="index.html#reports" class="${active === 'reports' ? 'active' : ''}">Berichte</a>
                        <a href="resultate.html" class="${active === 'resultate' ? 'active' : ''}">Resultate</a>
                    </nav>
                </div>
            </header>
        `;

        this.initMobileNav();
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
