/**
 * Galerie & Immich Management Cockpit
 * 
 * Zentrales Steuerungsmodul für das Fotoarchiv der Sportschützen Muhen.
 * - Anbindung an den nativen Immich Server (Proxmox CT 116 auf Medion Node)
 * - Überwachung des Sammelalbums «Mitglieder-Uploads» & Zähler-Badges
 * - Kuratierung & Freigabe via Immich Web-App
 * - 1-Klick-Synchronisation zur Vereins-Website & intern.html via Supabase
 */

let immichServerStatus = null;
let currentWebsiteAlbums = [];
let availableImmichAlbums = [];

const SUPABASE_REST_URL = "https://supabase-muhen.danfamily.uk/rest/v1";
const SUPABASE_FUNCTIONS_URL = "https://supabase-muhen.danfamily.uk/functions/v1";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

// =========================================================
//  INITIALISIERUNG & RENDERING
// =========================================================
async function initGalerieManager() {
    const container = document.getElementById('galerie-container');
    if (!container) return;

    container.innerHTML = `
        <div class="row g-3">
            <!-- STATUS KARTE -->
            <div class="col-12">
                <div class="card shadow-sm border-0 border-start border-4 border-primary">
                    <div class="card-body p-3 d-flex justify-content-between align-items-center flex-wrap gap-3">
                        <div class="d-flex align-items-center gap-3">
                            <div class="rounded-circle bg-primary-subtle text-primary p-3 d-flex align-items-center justify-content-center" style="width: 52px; height: 52px; font-size: 1.5rem;">
                                📸
                            </div>
                            <div>
                                <h5 class="mb-1 fw-bold text-primary">Immich Vereins-Fotoarchiv</h5>
                                <div class="text-muted small" id="immich-node-info">
                                    <span class="spinner-border spinner-border-sm me-1 text-primary" role="status"></span>
                                    Prüfe Verbindung zu Proxmox CT 116 (Foto-Server)...
                                </div>
                            </div>
                        </div>
                        <div class="d-flex gap-2 align-items-center flex-wrap">
                            <span class="badge bg-success-subtle text-success border border-success-subtle px-3 py-2 fw-bold" id="immich-live-badge">
                                <i class="fas fa-circle text-success me-1 small"></i> Online
                            </span>
                            <button class="btn btn-outline-secondary btn-sm" onclick="refreshImmichStatus()">
                                <i class="fas fa-sync-alt me-1"></i> Status aktualisieren
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- HAUPT-AKTION: KURATIERUNG IN IMMICH -->
            <div class="col-lg-7">
                <div class="card shadow-sm border-0 h-100">
                    <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-tools text-primary me-2"></i>Foto-Kuratierung & KI-Gesichtserkennung
                        </h6>
                        <span class="badge bg-light text-muted border">Server-KI aktiv</span>
                    </div>
                    <div class="card-body p-4">
                        <p class="text-muted mb-4">
                            Auf unserem Medion-Node (CT 116) läuft der leistungsstarke Immich-Server mit eigener Machine-Learning-Pipeline. Sämtliche Fotos werden serverseitig vollautomatisch analysiert, Gesichter geclustert und Duplikate erkannt.
                        </p>
                        
                        <div class="row g-3">
                            <div class="col-sm-6">
                                <div class="p-3 rounded bg-light border h-100 d-flex flex-column justify-content-between">
                                    <div>
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <div class="fw-bold text-primary">📥 Mitglieder-Uploads</div>
                                            <span id="gal-inbox-pill" class="badge rounded-pill bg-danger d-none">0</span>
                                        </div>
                                        <div class="small text-muted mb-3" id="inbox-album-info">
                                            Wird geladen...
                                        </div>
                                    </div>
                                    <a href="https://immich-muhen.danfamily.uk/albums/6184f06d-be38-426b-8737-1bec29ab045e" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm w-100 fw-bold shadow-xs">
                                        📥 Sammelalbum öffnen ↗
                                    </a>
                                </div>
                            </div>
                            <div class="col-sm-6">
                                <div class="p-3 rounded bg-light border h-100 d-flex flex-column justify-content-between">
                                    <div>
                                        <div class="fw-bold mb-1 text-primary">👤 Personen & Gesichter</div>
                                        <div class="small text-muted mb-3">
                                            Ordne erkannte Gesichter den Vereinsmitgliedern zu. Die Namens-Tags werden für die interne Suche synchronisiert.
                                        </div>
                                    </div>
                                    <a href="https://immich-muhen.danfamily.uk/people" target="_blank" rel="noopener noreferrer" class="btn btn-outline-primary btn-sm w-100 fw-bold">
                                        👤 Personen verwalten ↗
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div class="alert alert-info border-0 mt-4 mb-0 small d-flex align-items-start gap-2">
                            <i class="fas fa-info-circle mt-0.5 text-primary"></i>
                            <div>
                                <strong>Workflow für Vorstandsmitglieder:</strong><br>
                                Neue Fotos im Sammelalbum «Mitglieder-Uploads» prüfen, gewünschte Bilder in ein Zielalbum (z. B. «Endschiessen 2026») verschieben und anschliessend aus dem Sammelalbum entfernen. Sobald das Sammelalbum leer ist, erlischt der rote Pendenzen-Punkt automatisch.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SEITENLEISTE: SYNCHRONISATION & PUBLIZIERTE WEBSITE-ALBEN -->
            <div class="col-lg-5">
                <div class="card shadow-sm border-0 mb-3">
                    <div class="card-header bg-white border-bottom py-3">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-folder-plus text-primary me-2"></i>Website-Alben & Synchronisation
                        </h6>
                    </div>
                    <div class="card-body p-3">
                        <p class="small text-muted mb-3">
                            Hier synchronisierst du Alben mit 1 Klick direkt aus Immich für die Homepage (<a href="../sportschuetzen-website/frontend/verein.html#galerie" target="_blank">verein.html</a>) oder den geschützten Mitgliederbereich (<a href="../sportschuetzen-website/frontend/intern.html" target="_blank">intern.html</a>).
                        </p>

                        <!-- FORMULAR ZUR ALBUM-SYNCHRONISATION (1-KLICK) -->
                        <div class="p-3 rounded border bg-light mb-3">
                            <div class="fw-bold small text-dark mb-2">
                                <i class="fas fa-cloud-arrow-down text-primary me-1"></i> Album synchronisieren &amp; publizieren
                            </div>
                            
                            <!-- ALBUM-AUSWAHL DIREKT AUS IMMICH -->
                            <div class="mb-2">
                                <label class="form-label small fw-semibold mb-1" for="gal-sync-album-select">Immich-Album auswählen:</label>
                                <select id="gal-sync-album-select" class="form-select form-select-sm" onchange="onImmichAlbumSelected()">
                                    <option value="">Lade verfügbare Immich-Alben...</option>
                                </select>
                            </div>

                            <!-- ORDNERNAME AUF DER WEBSITE -->
                            <div class="mb-2">
                                <label class="form-label small fw-semibold mb-1" for="gal-sync-folder-name">Ordner- / Albumname auf der Website:</label>
                                <input type="text" id="gal-sync-folder-name" class="form-control form-control-sm" 
                                       placeholder="z. B. Endschiessen 2026">
                                <div class="text-muted" style="font-size: 0.72rem;">Unter diesem Namen wird das Album auf der Website dargestellt.</div>
                            </div>

                            <!-- SICHTBARKEIT & RUBRIK -->
                            <div class="row g-2 mb-3">
                                <div class="col-12">
                                    <label class="form-label small fw-semibold mb-1" for="gal-sync-visibility">Sichtbarkeit:</label>
                                    <select id="gal-sync-visibility" class="form-select form-select-sm">
                                        <option value="members" selected>🔒 Nur Mitglieder (geschützter Bereich)</option>
                                        <option value="public">🌐 Öffentlich und Mitglieder (Homepage &amp; geschützter Bereich)</option>
                                    </select>
                                </div>
                                <div class="col-12">
                                    <label class="form-label small fw-semibold mb-1" for="gal-sync-category">Rubrik:</label>
                                    <select id="gal-sync-category" class="form-select form-select-sm">
                                        <option value="events" selected>🎉 Anlässe &amp; Events</option>
                                        <option value="nachwuchs">🎯 Nachwuchs &amp; Jugend</option>
                                        <option value="geschichte">🏛️ Vereinsgeschichte</option>
                                    </select>
                                </div>
                            </div>

                            <!-- 1-KLICK SYNC BUTTON -->
                            <div>
                                <button id="btn-sync-gallery" class="btn btn-primary btn-sm w-100 fw-bold shadow-xs py-2" onclick="triggerAlbumSync()">
                                    <i class="fas fa-cloud-arrow-down me-1"></i> Album jetzt synchronisieren &amp; publizieren
                                </button>
                            </div>
                        </div>

                        <!-- AKTUELL PUBLIZIERTE ALBEN -->
                        <div class="mb-3">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <span class="fw-bold small text-dark">
                                    <i class="fas fa-images text-primary me-1"></i> Aktuell publizierte Alben:
                                </span>
                                <span id="gal-total-media-badge" class="badge bg-light text-muted border">Lade...</span>
                            </div>
                            <div id="gal-published-albums-list" class="list-group list-group-flush border rounded small" style="max-height: 220px; overflow-y: auto;">
                                <div class="p-2 text-center text-muted">Lade publizierte Alben...</div>
                            </div>
                        </div>

                        <div class="d-grid gap-2">
                            <a href="../sportschuetzen-website/frontend/intern.html" target="_blank" class="btn btn-outline-secondary btn-sm">
                                🔐 Geschützten Mitgliederbereich öffnen ↗
                            </a>
                            <a href="../sportschuetzen-website/frontend/verein.html#galerie" target="_blank" class="btn btn-outline-secondary btn-sm">
                                🖼️ Homepage-Galerie öffnen ↗
                            </a>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    await Promise.all([
        loadImmichDashboardData(),
        loadImmichAlbumsForDropdown(),
        loadPublishedWebsiteAlbums()
    ]);
}

// =========================================================
//  LADEN DER VERFÜGBAREN IMMICH-ALBEN FÜR DAS DROPDOWN
// =========================================================
async function loadImmichAlbumsForDropdown() {
    const selectEl = document.getElementById('gal-sync-album-select');
    if (!selectEl) return;

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        if (data.success && Array.isArray(data.immichAlbums)) {
            availableImmichAlbums = data.immichAlbums;

            if (availableImmichAlbums.length === 0) {
                selectEl.innerHTML = '<option value="">Keine Alben auf Immich gefunden</option>';
                return;
            }

            selectEl.innerHTML = `
                <option value="">-- Album aus Immich wählen (${availableImmichAlbums.length}) --</option>
                ${availableImmichAlbums.map(alb => `
                    <option value="${escapeHtml(alb.id)}" data-name="${escapeHtml(alb.name)}" data-count="${alb.assetCount}">
                        📁 ${escapeHtml(alb.name)} (${alb.assetCount} Medien)
                    </option>
                `).join('')}
            `;
        }
    } catch (err) {
        console.warn('Konnte Immich-Alben für Dropdown nicht laden:', err);
        selectEl.innerHTML = '<option value="">Fehler beim Laden der Immich-Alben</option>';
    }
}

function onImmichAlbumSelected() {
    const selectEl = document.getElementById('gal-sync-album-select');
    const folderInput = document.getElementById('gal-sync-folder-name');
    const catSelect = document.getElementById('gal-sync-category');
    if (!selectEl || !folderInput) return;

    const opt = selectEl.options[selectEl.selectedIndex];
    if (opt && opt.value) {
        const albumName = opt.getAttribute('data-name') || '';
        folderInput.value = albumName;

        // Automatische Kategorie-Vorauswahl
        const lower = albumName.toLowerCase();
        if (catSelect) {
            if (lower.includes('bau') || lower.includes('erstellung') || lower.includes('geschichte') || lower.includes('199') || lower.includes('198')) {
                catSelect.value = 'geschichte';
            } else if (lower.includes('nachwuchs') || lower.includes('junioren') || lower.includes('jugend') || lower.includes('kurs')) {
                catSelect.value = 'nachwuchs';
            } else {
                catSelect.value = 'events';
            }
        }
    }
}

// =========================================================
//  1-KLICK SYNCHRONISATION AUSLÖSEN
// =========================================================
async function triggerAlbumSync() {
    const selectEl = document.getElementById('gal-sync-album-select');
    const folderInput = document.getElementById('gal-sync-folder-name');
    const visSelect = document.getElementById('gal-sync-visibility');
    const catSelect = document.getElementById('gal-sync-category');
    const syncBtn = document.getElementById('btn-sync-gallery');

    const albumId = selectEl?.value;
    const websiteTitle = (folderInput?.value || '').trim();
    const visibility = visSelect?.value || 'members';
    const category = catSelect?.value || 'events';

    if (!albumId) {
        if (typeof showToast === 'function') {
            showToast('Bitte wähle zuerst ein Album aus Immich aus.', 'warning');
        } else {
            alert('Bitte wähle zuerst ein Album aus Immich aus.');
        }
        return;
    }

    if (!websiteTitle) {
        if (typeof showToast === 'function') {
            showToast('Bitte gib einen Ordner-/Albumnamen für die Website ein.', 'warning');
        } else {
            alert('Bitte gib einen Ordner-/Albumnamen für die Website ein.');
        }
        return;
    }

    // Button in Lade-Zustand versetzen
    if (syncBtn) {
        syncBtn.disabled = true;
        syncBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Synchronisiere Album mit Immich...`;
    }

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
                albumId,
                websiteTitle,
                visibility,
                category
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Serverfehler beim Synchronisieren');
        }

        const visLabel = (visibility === 'public') ? 'Öffentlich und Mitglieder' : 'Nur Mitglieder';
        if (typeof showToast === 'function') {
            showToast(`Album «${data.album}» (${data.count} Medien) erfolgreich synchronisiert! (${visLabel})`, 'success');
        } else {
            alert(`Album «${data.album}» (${data.count} Medien) erfolgreich synchronisiert!`);
        }

        // Aktualisiere die publizierten Alben
        await loadPublishedWebsiteAlbums();

    } catch (err) {
        console.error('Sync Fehler:', err);
        if (typeof showToast === 'function') {
            showToast(`Synchronisation fehlgeschlagen: ${err.message}`, 'error');
        } else {
            alert(`Synchronisation fehlgeschlagen: ${err.message}`);
        }
    } finally {
        if (syncBtn) {
            syncBtn.disabled = false;
            syncBtn.innerHTML = `<i class="fas fa-cloud-arrow-down me-1"></i> Album jetzt synchronisieren &amp; publizieren`;
        }
    }
}

// =========================================================
//  ALBUM DEPUBLIZIEREN (VON WEBSITE ENTFERNEN)
// =========================================================
async function unpublishAlbum(albumId, albumTitle) {
    if (!confirm(`Möchtest du das Album «${albumTitle}» wirklich von der Website entfernen?\n\nDie Original-Fotos auf Immich bleiben unverändert erhalten.`)) {
        return;
    }

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
                action: 'unpublish',
                albumId
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Fehler beim Entfernen des Albums');
        }

        if (typeof showToast === 'function') {
            showToast(`Album «${albumTitle}» erfolgreich von der Website entfernt.`, 'success');
        }

        await loadPublishedWebsiteAlbums();

    } catch (err) {
        console.error('Fehler beim Depublizieren:', err);
        if (typeof showToast === 'function') {
            showToast(`Konnte Album nicht entfernen: ${err.message}`, 'error');
        } else {
            alert(`Konnte Album nicht entfernen: ${err.message}`);
        }
    }
}

// =========================================================
//  LADEN DER PUBLIZIERTEN ALBEN (SUPABASE SINGLE SOURCE)
// =========================================================
async function loadPublishedWebsiteAlbums() {
    const listEl = document.getElementById('gal-published-albums-list');
    const badgeEl = document.getElementById('gal-total-media-badge');
    if (!listEl) return;

    try {
        // Primär: Direkt aus Supabase REST laden
        const res = await fetch(`${SUPABASE_REST_URL}/gallery_albums?select=*&order=created_at.desc`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });
        
        let albums = [];
        if (res.ok) {
            albums = await res.json();
        } else {
            // Fallback auf statische JSON
            const fallbackRes = await fetch('../sportschuetzen-website/frontend/data/galerie.json?v=' + Date.now());
            if (fallbackRes.ok) {
                const photos = await fallbackRes.json();
                const map = {};
                photos.forEach(p => {
                    const a = p.album || 'Vereinsarchiv';
                    if (!map[a]) {
                        map[a] = { id: p.albumId || a, website_title: a, media_count: 0, visibility: p.visibility || 'public' };
                    }
                    map[a].media_count++;
                });
                albums = Object.values(map);
            }
        }

        currentWebsiteAlbums = albums;

        const totalMedia = albums.reduce((sum, a) => sum + (parseInt(a.media_count) || 0), 0);
        if (badgeEl) {
            badgeEl.innerText = `${totalMedia} Medien`;
        }

        if (!albums || albums.length === 0) {
            listEl.innerHTML = '<div class="p-2 text-center text-muted">Noch keine Alben publiziert.</div>';
            return;
        }

        listEl.innerHTML = albums.map(alb => {
            const isPublic = alb.visibility === 'public';
            const visBadge = isPublic
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle" title="Auf Homepage und im Mitgliederbereich sichtbar">🌐 Öffentlich &amp; Mitglieder</span>`
                : `<span class="badge bg-primary-subtle text-primary border border-primary-subtle" title="Nur für angemeldete Vereinsmitglieder sichtbar">🔒 Nur Mitglieder</span>`;

            return `
                <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                    <div>
                        <div class="fw-semibold text-dark">${escapeHtml(alb.website_title || alb.album_name)}</div>
                        <div class="text-muted small">${alb.media_count || 0} Fotos/Medien</div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        ${visBadge}
                        <button class="btn btn-outline-danger btn-sm py-0 px-1.5" title="Von Website entfernen" onclick="unpublishAlbum('${alb.id}', '${escapeHtml(alb.website_title || alb.album_name)}')">
                            <i class="fas fa-trash-alt small"></i>
                        </button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (err) {
        console.warn('Konnte publizierte Alben nicht laden:', err);
        if (listEl) {
            listEl.innerHTML = '<div class="p-2 text-center text-muted">Alben-Übersicht derzeit nicht verfügbar.</div>';
        }
    }
}

// =========================================================
//  IMMICH DASHBOARD DATA & STATUS
// =========================================================
async function loadImmichDashboardData() {
    const nodeInfo = document.getElementById('immich-node-info');
    const inboxInfo = document.getElementById('inbox-album-info');
    const inboxPill = document.getElementById('gal-inbox-pill');
    const liveBadge = document.getElementById('immich-live-badge');

    try {
        const res = await fetch('https://supabase-muhen.danfamily.uk/functions/v1/immich-upload');
        if (res.ok) {
            const data = await res.json();
            immichServerStatus = data;

            if (data.status === 'online') {
                if (nodeInfo) {
                    nodeInfo.innerHTML = `Verbunden mit <strong>Proxmox CT 116</strong> (Foto-Server)`;
                }
                const count = data.album?.count || 0;
                if (inboxInfo) {
                    inboxInfo.innerHTML = `Aktuell <strong>${count} Fotos/Medien</strong> im Sammelalbum «${data.album?.name || 'Mitglieder-Uploads'}» vorhanden.`;
                }
                if (inboxPill) {
                    if (count > 0) {
                        inboxPill.innerText = count;
                        inboxPill.classList.remove('d-none');
                    } else {
                        inboxPill.classList.add('d-none');
                    }
                }
                if (liveBadge) {
                    liveBadge.className = 'badge bg-success-subtle text-success border border-success-subtle px-3 py-2 fw-bold';
                    liveBadge.innerHTML = `<i class="fas fa-circle text-success me-1 small"></i> Verbunden (CT 116)`;
                }

                // Badges in Navigation, Dashboard & Mobile Header synchronisieren
                updateGalerieBadge(count);
                return;
            }
        }
        throw new Error('Server antwortete nicht mit Status 200');
    } catch (err) {
        console.warn('Konnte Immich-Dashboard nicht laden:', err);
        if (nodeInfo) nodeInfo.innerHTML = `<span class="text-warning">Konnte Immich-Status nicht abrufen: ${err.message}</span>`;
        if (inboxInfo) inboxInfo.innerHTML = `Sammelalbum «Mitglieder-Uploads» bereit.`;
        if (liveBadge) {
            liveBadge.className = 'badge bg-warning-subtle text-warning border border-warning-subtle px-3 py-2 fw-bold';
            liveBadge.innerHTML = `<i class="fas fa-exclamation-triangle text-warning me-1 small"></i> Verbindung prüfen`;
        }
    }
}

async function refreshImmichStatus() {
    if (typeof showToast === 'function') {
        showToast('Prüfe Verbindung zu Immich Server...', 'info');
    }
    await Promise.all([
        loadImmichDashboardData(),
        loadImmichAlbumsForDropdown(),
        loadPublishedWebsiteAlbums()
    ]);
    if (typeof showToast === 'function') {
        showToast('Immich-Status erfolgreich aktualisiert.', 'success');
    }
}

// =========================================================
//  BADGE-SYNCHRONISATION (NAV, DASHBOARD & MOBILE HEADER)
// =========================================================
function updateGalerieBadge(count) {
    const navBadge = document.getElementById('galerie-nav-badge');
    const tileBadge = document.getElementById('galerie-tile-badge');

    [navBadge, tileBadge].forEach(el => {
        if (!el) return;
        if (count > 0) {
            el.innerText = count;
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });

    if (typeof window.updateMobileGlobalBadge === 'function') {
        window.updateMobileGlobalBadge();
    }
}
window.updateGalerieBadge = updateGalerieBadge;

async function checkGalerieInboxBadge() {
    try {
        const res = await fetch('https://supabase-muhen.danfamily.uk/functions/v1/immich-upload');
        if (res.ok) {
            const data = await res.json();
            const count = data.album?.count || 0;
            updateGalerieBadge(count);
        }
    } catch (e) {
        // Stille Unterdrückung bei Hintergrund-Check
    }
}
window.checkGalerieInboxBadge = checkGalerieInboxBadge;

// =========================================================
//  ZENTRALER SAMMEL-BADGE FÜR MOBIL & IPAD
// =========================================================
function updateMobileGlobalBadge() {
    const mobileBadge = document.getElementById('mobile-global-badge');
    if (!mobileBadge) return;

    const jmBadge = document.getElementById('jm-nav-badge');
    const galBadge = document.getElementById('galerie-nav-badge');

    const jmCount = (jmBadge && !jmBadge.classList.contains('d-none')) ? (parseInt(jmBadge.innerText) || 0) : 0;
    const galCount = (galBadge && !galBadge.classList.contains('d-none')) ? (parseInt(galBadge.innerText) || 0) : 0;

    const total = jmCount + galCount;
    if (total > 0) {
        mobileBadge.innerText = total > 99 ? '99+' : total;
        mobileBadge.classList.remove('d-none');
    } else {
        mobileBadge.classList.add('d-none');
    }
}
window.updateMobileGlobalBadge = updateMobileGlobalBadge;

// Initialer Check beim Start des Vorstands-Portals
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        checkGalerieInboxBadge();
    }, 1400);
});
