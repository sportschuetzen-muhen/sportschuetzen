// Simple smooth scrolling for anchor links
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function (e) {
        const targetId = this.getAttribute('href');
        if (targetId === '#') return;
        
        const targetElement = document.querySelector(targetId);
        if (targetElement) {
            e.preventDefault();
            targetElement.scrollIntoView({
                behavior: 'smooth'
            });
            
            // Update active state in nav
            document.querySelectorAll('.desktop-nav a').forEach(navLink => {
                navLink.classList.remove('active');
            });
            this.classList.add('active');
            
            // Close mobile menu if open
            document.getElementById('nav-links').classList.remove('open');
            const toggle = document.getElementById('mobile-toggle');
            if (toggle) toggle.classList.remove('active');
            document.body.classList.remove('no-scroll');
        }
    });
});

// Mobile Menu Toggle (Fallback falls components.js nicht verwendet wird)
const mobileToggle = document.getElementById('mobile-toggle');
const navLinks = document.getElementById('nav-links');

if (mobileToggle && navLinks && !mobileToggle.hasAttribute('data-bound')) {
    mobileToggle.addEventListener('click', () => {
        navLinks.classList.toggle('open');
        mobileToggle.classList.toggle('active');
        document.body.classList.toggle('no-scroll');
    });
}

// Fetch Termine
async function loadTermine() {
    const container = document.getElementById('termine-container');
    if (!container) return;

    try {
        const WORKER_TERMINE_URL = "https://termine.dan-hunziker73.workers.dev?action=getTermine";
        
        const response = await fetch(WORKER_TERMINE_URL);
        if (!response.ok) throw new Error('Netzwerk-Antwort war nicht ok');
        
        let termine = await response.json();
        
        // Prefix logic
        const rules = {
            "Gruppenmeisterschaft SSV": 3,
            "Gruppenmeisterschaft AGSV": 3,
            "Grenzland-Cup": 3,
            "Mannschaftsmeisterschaft": 7
        };

        const counters = {};

        termine = termine.map(t => {
            const title = t.titel.trim();
            if (title.toLowerCase().startsWith("final")) return t;

            for (const baseTitle in rules) {
                if (title === baseTitle) {
                    counters[baseTitle] = (counters[baseTitle] || 0) + 1;
                    if (counters[baseTitle] <= rules[baseTitle]) {
                        return {
                            ...t,
                            titel: `${counters[baseTitle]}. Runde ${title}`
                        };
                    }
                }
            }
            return t;
        });

        // Filter out past events
        const today = new Date();
        today.setHours(0,0,0,0);
        
        termine = termine.filter(t => {
            const parse = (obj) => {
                if (obj.datum_iso) return new Date(obj.datum_iso);
                if (obj.datum && obj.datum.includes('.')) {
                    const [d, m, y] = obj.datum.split('.');
                    return new Date(y, m - 1, d);
                }
                return null;
            };
            const dateObj = parse(t);
            if (!dateObj) return false;
            dateObj.setHours(0,0,0,0);
            return dateObj >= today;
        });

        // Sort by date
        termine.sort((a, b) => {
            const parse = (obj) => {
                if (obj.datum_iso) return new Date(obj.datum_iso);
                if (obj.datum && obj.datum.includes('.')) {
                    const [d, m, y] = obj.datum.split('.');
                    return new Date(y, m - 1, d);
                }
                return new Date(8640000000000000);
            };
            return parse(a) - parse(b);
        });

        // Take next 4 events
        const nextTermine = termine.slice(0, 4);
        
        if (nextTermine.length === 0) {
            container.innerHTML = '<p class="text-center text-muted">Zurzeit stehen keine Termine an.</p>';
            return;
        }

        container.innerHTML = '';
        const months = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

        nextTermine.forEach(t => {
            let dObj;
            if (t.datum_iso) dObj = new Date(t.datum_iso);
            else if (t.datum && t.datum.includes('.')) {
                const [d, m, y] = t.datum.split('.');
                dObj = new Date(y, m - 1, d);
            }
            
            const day = dObj.getDate();
            const month = months[dObj.getMonth()];
            
            container.innerHTML += `
                <div class="termin-item">
                    <div class="termin-date">
                        <span class="day">${day}</span>
                        <span class="month">${month}</span>
                    </div>
                    <div class="termin-details">
                        <h3>${t.titel}</h3>
                        <p>${t.start ? '🕒 ' + t.start + ' Uhr | ' : ''}📍 ${t.ort || 'Schützenhaus Muhen'}</p>
                    </div>
                </div>
            `;
        });

    } catch (error) {
        console.error('Fehler beim Laden der Termine:', error);
        container.innerHTML = '<p class="text-center text-muted">Termine konnten nicht geladen werden.</p>';
    }
}

// Display and render reports in the DOM
function displayReports(reports, container) {
    // Ensure Modal exists in DOM
    if (!document.getElementById('news-reader-modal')) {
        const modalHtml = `
            <div id="news-reader-modal" class="news-modal-overlay" onclick="if(event.target === this) window.closeNewsModal()">
                <div class="news-modal-content">
                    <button class="news-modal-close" onclick="window.closeNewsModal()">&times;</button>
                    <div id="news-modal-image" class="news-modal-img"></div>
                    <div class="news-modal-body">
                        <span id="news-modal-date" style="color:var(--accent-color); font-weight:600; font-size: 0.9rem; text-transform:uppercase; letter-spacing:1px;"></span>
                        <h2 id="news-modal-title" style="margin:10px 0 20px 0; font-size:2.2rem; line-height:1.2; color:var(--primary-color);"></h2>
                        <div id="news-modal-content" style="line-height:1.8; color:var(--text-light); font-size:1.05rem;"></div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
    }

    // Global function to close the modal
    window.closeNewsModal = function() {
        const modal = document.getElementById('news-reader-modal');
        if (modal) modal.style.display = 'none';
        document.body.classList.remove('no-scroll');
    };

    // Global function to open the modal (defined always)
    window.openNewsModal = function(index) {
        const r = window.loadedReports[index];
        if (!r) return;
        
        let dateStr = 'Unbekanntes Datum';
        if (r.date) {
            const dateObj = new Date(r.date);
            if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
            }
        }
        
        document.getElementById('news-modal-date').innerText = dateStr + ' | ' + r.author;
        document.getElementById('news-modal-title').innerText = r.title;
        
        // Content + Additional Images Gallery
        let contentHtml = r.content;
        if (r.imageUrls && r.imageUrls.length > 1) {
            let galleryHtml = '<div style="margin-top: 30px; border-top: 1px solid var(--glass-border); padding-top: 20px;"><h4 style="color: var(--primary-color); margin-bottom: 15px; font-weight: 800;">Weitere Fotos</h4><div style="display:flex; gap:15px; overflow-x:auto; padding-bottom:15px;">';
            for (let i = 1; i < r.imageUrls.length; i++) {
                galleryHtml += `<img src="${r.imageUrls[i]}" style="height:150px; border-radius:8px; object-fit:cover; border: 1px solid var(--glass-border); cursor:pointer; box-shadow: 0 4px 6px rgba(15,58,93,0.06);" onclick="window.open(this.src, '_blank')">`;
            }
            galleryHtml += '</div></div>';
            contentHtml += galleryHtml;
        }
        
        document.getElementById('news-modal-content').innerHTML = contentHtml;
        
        const imgUrl = (r.imageUrls && r.imageUrls.length > 0) ? r.imageUrls[0] : (r.image || r.imageUrl);
        const imgEl = document.getElementById('news-modal-image');
        if (imgUrl) {
            imgEl.style.backgroundImage = `url('${imgUrl}')`;
            imgEl.style.display = 'block';
        } else {
            imgEl.style.display = 'none';
        }
        
        document.getElementById('news-reader-modal').style.display = 'flex';
        document.body.classList.add('no-scroll');
    };

    container.innerHTML = '';
    window.loadedReports = reports;

    // Display up to 6 reports
    const recentReports = reports.slice(0, 6);

    recentReports.forEach((r, index) => {
        let dateStr = 'Unbekanntes Datum';
        if (r.date) {
            const dateObj = new Date(r.date);
            if (!isNaN(dateObj.getTime())) {
                dateStr = dateObj.toLocaleDateString('de-CH', { day: '2-digit', month: 'long', year: 'numeric' });
            }
        }
        
        // Create a short excerpt from the HTML content
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = r.content;
        let excerpt = tempDiv.textContent || tempDiv.innerText || "";
        if (excerpt.length > 120) {
            excerpt = excerpt.substring(0, 120) + '...';
        }

        const coverImgUrl = (r.imageUrls && r.imageUrls.length > 0) ? r.imageUrls[0] : (r.image || r.imageUrl);
        const imgHtml = coverImgUrl 
            ? `<div class="report-image" style="background-image: url('${coverImgUrl}'); background-size: cover; background-position: center; cursor: pointer;" onclick="window.openNewsModal(${index})"></div>`
            : `<div class="report-image" style="background: linear-gradient(45deg, #1e293b, #334155); display: flex; align-items: center; justify-content: center; font-size: 2rem; cursor: pointer;" onclick="window.openNewsModal(${index})">📰</div>`;

        container.innerHTML += `
            <div class="glass-card report-card">
                ${imgHtml}
                <div class="report-content" style="padding: 20px;">
                    <span class="report-date" style="color: var(--primary-color); font-weight: 600; font-size: 0.85rem;">${dateStr} | ${r.author}</span>
                    <h3 style="margin: 10px 0; cursor: pointer;" onclick="window.openNewsModal(${index})">${r.title}</h3>
                    <p style="color: var(--text-muted); font-size: 0.95rem;">${excerpt}</p>
                    <button class="read-more btn btn-outline" style="margin-top: 15px; width: 100%;" onclick="window.openNewsModal(${index})">Ganzen Bericht lesen</button>
                </div>
            </div>
        `;
    });
}

// Fetch Reports
async function loadReports() {
    const container = document.getElementById('reports-container');
    if (!container) return;

    try {
        // Cache-Busting durch Timestamp hinzugefügt
        const response = await fetch('data/berichte.json?v=' + new Date().getTime());
        if (!response.ok) throw new Error('Berichte nicht gefunden');
        
        const reports = await response.json();
        
        if (!reports || reports.length === 0) {
            container.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1;">Zurzeit sind keine Berichte vorhanden.</p>';
            return;
        }

        displayReports(reports, container);

    } catch (error) {
        console.error('Fehler beim Laden der Berichte:', error);
        
        // Fallback-Berichte für lokale Entwicklung (CORS/Offline)
        const fallbackReports = [
            {
                "id": "report_initial",
                "title": "Willkommen zur neuen Website",
                "author": "Vorstand",
                "date": "2026-05-31T08:00:00.000Z",
                "content": "<p>Unsere neue Website ist online! In Zukunft werden hier an dieser Stelle regelmässig neue Vereinsberichte und News publiziert. Wir danken allen für die Unterstützung.</p>",
                "imageUrl": null
            }
        ];
        
        try {
            displayReports(fallbackReports, container);
        } catch (innerError) {
            container.innerHTML = '<p class="text-center text-muted" style="grid-column: 1 / -1;">Berichte konnten nicht geladen werden.</p>';
        }
    }
}

// Load Termine and Reports on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    loadTermine();
    loadReports();
    initContactForm();
});

// AJAX Contact Form Handler (Web3Forms)
function initContactForm() {
    const form = document.getElementById('contact-form');
    const status = document.getElementById('contact-status');
    const submitBtn = document.getElementById('contact-submit');
    if (!form || !status || !submitBtn) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        // Block consecutive submits
        submitBtn.disabled = true;
        const originalBtnText = submitBtn.innerText;
        submitBtn.innerText = "Wird gesendet...";

        status.style.display = "none";
        status.className = ""; // clear classes

        const formData = new FormData(form);

        try {
            const response = await fetch(form.action, {
                method: form.method,
                body: formData,
                headers: {
                    'Accept': 'application/json'
                }
            });

            const json = await response.json();

            if (response.status === 200 || json.success) {
                status.style.display = "block";
                status.style.backgroundColor = "rgba(16, 185, 129, 0.1)";
                status.style.color = "#10b981";
                status.style.border = "1px solid rgba(16, 185, 129, 0.2)";
                status.innerText = "Vielen Dank! Ihre Nachricht wurde erfolgreich an uns übermittelt. Wir setzen uns bald mit Ihnen in Verbindung.";
                form.reset();
            } else {
                throw new Error(json.message || "Es gab ein Problem beim Übermitteln der Nachricht.");
            }
        } catch (error) {
            console.error("Kontaktformular Fehler:", error);
            status.style.display = "block";
            status.style.backgroundColor = "rgba(239, 68, 68, 0.1)";
            status.style.color = "#ef4444";
            status.style.border = "1px solid rgba(239, 68, 68, 0.2)";
            status.innerText = "Fehler: " + (error.message || "Die Nachricht konnte nicht gesendet werden. Bitte versuchen Sie es später erneut.");
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerText = originalBtnText;
        }
    });
}

