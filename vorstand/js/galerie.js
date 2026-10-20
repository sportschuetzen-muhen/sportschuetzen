/**
 * Galerie & Immich Management Cockpit
 * 
 * Zentrales Steuerungsmodul für das Fotoarchiv der Sportschützen Muhen.
 * - Anbindung an den nativen Immich Server (Proxmox CT 116 auf Medion Node)
 * - Überwachung des Sammelalbums «Mitglieder-Uploads» & Zähler-Badges
 * - Kuratierung & Freigabe via Immich Web-App
 * - Synchronisation zur Vereins-Website & intern.html mit Ordnernamen & Sichtbarkeit
 */

let immichServerStatus = null;
let currentWebsiteAlbums = [];

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

            <!-- SEITENLEISTE: SYNCHRONISATION, ORDNERNAME & WEBSITE-STATUS -->
            <div class="col-lg-5">
                <div class="card shadow-sm border-0 mb-3">
                    <div class="card-header bg-white border-bottom py-3">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-folder-plus text-primary me-2"></i>Website-Alben & Synchronisation
                        </h6>
                    </div>
                    <div class="card-body p-3">
                        <p class="small text-muted mb-3">
                            Hier steuerst du, welche Alben auf der öffentlichen Homepage (<a href="../sportschuetzen-website/frontend/verein.html#galerie" target="_blank">verein.html</a>) oder im geschützten Mitgliederbereich (<a href="../sportschuetzen-website/frontend/intern.html" target="_blank">intern.html</a>) publiziert werden.
                        </p>

                        <!-- FORMULAR ZUR ALBUM-SYNCHRONISATION -->
                        <div class="p-3 rounded border bg-light mb-3">
                            <div class="fw-bold small text-dark mb-2">
                                <i class="fas fa-cloud-arrow-down text-primary me-1"></i> Neues Album aufnehmen
                            </div>
                            
                            <div class="mb-2">
                                <label class="form-label small fw-semibold mb-1" for="gal-sync-share-url">Immich Freigabelink (Share URL):</label>
                                <input type="url" id="gal-sync-share-url" class="form-control form-control-sm" 
                                       placeholder="https://immich-muhen.danfamily.uk/share/..." oninput="updateSyncCommandPreview()">
                            </div>

                            <div class="mb-2">
                                <label class="form-label small fw-semibold mb-1" for="gal-sync-folder-name">Ordner- / Albumname auf der Website:</label>
                                <input type="text" id="gal-sync-folder-name" class="form-control form-control-sm" 
                                       placeholder="z. B. Endschiessen 2026" oninput="updateSyncCommandPreview()">
                                <div class="text-muted" style="font-size: 0.72rem;">Unter diesem Namen wird das Album auf der Website dargestellt.</div>
                            </div>

                            <div class="row g-2 mb-2">
                                <div class="col-sm-6">
                                    <label class="form-label small fw-semibold mb-1" for="gal-sync-visibility">Sichtbarkeit:</label>
                                    <select id="gal-sync-visibility" class="form-select form-select-sm" onchange="updateSyncCommandPreview()">
                                        <option value="members" selected>🔒 Nur Mitglieder (intern.html)</option>
                                        <option value="public">🌐 Öffentlich (Homepage verein.html)</option>
                                    </select>
                                </div>
                                <div class="col-sm-6">
                                    <label class="form-label small fw-semibold mb-1" for="gal-sync-category">Rubrik:</label>
                                    <select id="gal-sync-category" class="form-select form-select-sm" onchange="updateSyncCommandPreview()">
                                        <option value="events" selected>🎉 Anlässe &amp; Events</option>
                                        <option value="nachwuchs">🎯 Nachwuchs &amp; Jugend</option>
                                        <option value="geschichte">🏛️ Vereinsgeschichte</option>
                                    </select>
                                </div>
                            </div>

                            <div class="mt-3">
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <span class="text-muted fw-semibold" style="font-size: 0.74rem;">Vorbereiteter Sync-Befehl:</span>
                                    <button class="btn btn-outline-secondary btn-sm py-0 px-2" style="font-size: 0.7rem;" onclick="copySyncCommand()">
                                        <i class="fas fa-copy me-1"></i> Kopieren
                                    </button>
                                </div>
                                <code id="gal-sync-cmd-preview" class="d-block p-1.5 bg-white border rounded text-dark font-monospace" style="font-size: 0.72rem; word-break: break-all; user-select: all;">
                                    node sportschuetzen-website/sync-immich-album.js "&lt;SHARE_URL&gt;" "&lt;ORDNERNAME&gt;" members events
                                </code>
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
                            <div id="gal-published-albums-list" class="list-group list-group-flush border rounded small" style="max-height: 200px; overflow-y: auto;">
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

    updateSyncCommandPreview();
    await Promise.all([
        loadImmichDashboardData(),
        loadPublishedWebsiteAlbums()
    ]);
}

// =========================================================
//  SYNC-COMMAND PREVIEW & HELPER
// =========================================================
function updateSyncCommandPreview() {
    const urlInput = document.getElementById('gal-sync-share-url');
    const folderInput = document.getElementById('gal-sync-folder-name');
    const visInput = document.getElementById('gal-sync-visibility');
    const catInput = document.getElementById('gal-sync-category');
    const previewEl = document.getElementById('gal-sync-cmd-preview');
    if (!previewEl) return;

    const url = (urlInput?.value || '').trim() || '<SHARE_URL>';
    const folder = (folderInput?.value || '').trim();
    const vis = visInput?.value || 'members';
    const cat = catInput?.value || 'events';

    let cmd = `node sportschuetzen-website/sync-immich-album.js "${url}"`;
    if (folder) {
        cmd += ` "${folder}" ${vis} ${cat}`;
    } else {
        cmd += ` "" ${vis} ${cat}`;
    }

    previewEl.textContent = cmd;
}

function copySyncCommand() {
    const previewEl = document.getElementById('gal-sync-cmd-preview');
    if (!previewEl) return;
    const text = previewEl.textContent.trim();
    navigator.clipboard.writeText(text).then(() => {
        if (typeof showToast === 'function') {
            showToast('Sync-Befehl in Zwischenablage kopiert!', 'success');
        } else {
            alert('Befehl kopiert: ' + text);
        }
    }).catch(() => {
        prompt('Befehl kopieren:', text);
    });
}

// =========================================================
//  LADEN DER PUBLIZIERTEN ALBEN (galerie.json)
// =========================================================
async function loadPublishedWebsiteAlbums() {
    const listEl = document.getElementById('gal-published-albums-list');
    const badgeEl = document.getElementById('gal-total-media-badge');
    if (!listEl) return;

    try {
        const res = await fetch('../sportschuetzen-website/frontend/data/galerie.json?v=' + Date.now());
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        currentWebsiteAlbums = data;

        if (badgeEl) {
            badgeEl.innerText = `${data.length} Medien`;
        }

        // Gruppierung nach Album
        const albumMap = {};
        data.forEach(item => {
            const alb = item.album || 'Vereinsarchiv';
            if (!albumMap[alb]) {
                albumMap[alb] = {
                    count: 0,
                    visibility: item.visibility || 'public',
                    category: item.category || 'events'
                };
            }
            albumMap[alb].count++;
        });

        const albumNames = Object.keys(albumMap);
        if (albumNames.length === 0) {
            listEl.innerHTML = '<div class="p-2 text-center text-muted">Noch keine Alben publiziert.</div>';
            return;
        }

        listEl.innerHTML = albumNames.map(name => {
            const alb = albumMap[name];
            const isPublic = alb.visibility === 'public';
            const visBadge = isPublic
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle">🌐 Öffentlich</span>`
                : `<span class="badge bg-primary-subtle text-primary border border-primary-subtle">🔒 Nur Mitglieder</span>`;

            return `
                <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                    <div>
                        <div class="fw-semibold text-dark">${escapeHtml(name)}</div>
                        <div class="text-muted small">${alb.count} Fotos/Medien</div>
                    </div>
                    <div>
                        ${visBadge}
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
    await loadImmichDashboardData();
    await loadPublishedWebsiteAlbums();
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
