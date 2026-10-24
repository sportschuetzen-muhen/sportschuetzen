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
    ensureGalerieModals();
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
                    <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-tools text-primary me-2"></i>Foto-Kuratierung & KI-Gesichtserkennung
                        </h6>
                        <div class="d-flex align-items-center gap-2">
                            <button type="button" class="btn btn-outline-primary btn-xs py-1 px-2.5 fw-semibold" id="btn-trigger-immich-ml" onclick="triggerImmichMlJobs()" title="KI-Gesichtserkennung & Smart Search auf Proxmox CT 116 jetzt starten">
                                <i class="fas fa-brain me-1" id="icon-trigger-immich-ml"></i> KI-Erkennung anstossen
                            </button>
                            <span class="badge bg-light text-muted border">Server-KI aktiv</span>
                        </div>
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
                                    <div class="d-flex flex-column gap-2">
                                        <button type="button" class="btn btn-primary btn-sm w-100 fw-bold shadow-xs py-1.5" onclick="openCurateInboxModal()" id="btn-open-curate-modal">
                                            <i class="fas fa-magic me-1"></i> Fotos sichten &amp; einsortieren
                                        </button>
                                        <a href="https://immich-muhen.danfamily.uk/albums/6184f06d-be38-426b-8737-1bec29ab045e" target="_blank" rel="noopener noreferrer" class="btn btn-outline-secondary btn-xs w-100 text-truncate" style="font-size: 0.75rem;">
                                            📥 In Immich Web-App öffnen ↗
                                        </a>
                                    </div>
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

                        <div class="alert alert-info border-0 mt-4 mb-0 small">
                            <div class="d-flex align-items-start gap-2 mb-2">
                                <i class="fas fa-info-circle mt-0.5 text-primary fs-6"></i>
                                <div>
                                    <strong>Workflow für Vorstandsmitglieder:</strong><br>
                                    Neue Fotos im Sammelalbum «Mitglieder-Uploads» prüfen, gewünschte Bilder in ein Zielalbum (z. B. «Endschiessen 2026») verschieben und anschliessend aus dem Sammelalbum entfernen. Sobald das Sammelalbum leer ist, erlischt der rote Pendenzen-Punkt automatisch.
                                </div>
                            </div>
                            <div class="pt-2 border-top border-info-subtle d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <span class="text-muted" style="font-size: 0.8rem;">
                                    <i class="fas fa-exclamation-triangle text-warning me-1"></i> Wichtig: Beim Einsortieren <strong>nicht löschen</strong>, sondern <strong>«Aus Album entfernen»</strong> wählen!
                                </span>
                                <button type="button" class="btn btn-primary btn-sm py-1 px-2.5 fw-bold" onclick="openGalerieWorkflowGuideModal()" style="font-size: 0.78rem;">
                                    <i class="fas fa-book-open me-1"></i> Anleitung für Vorstandsmitglieder
                                </button>
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
                            <i class="fas fa-folder-plus text-primary me-2"></i>Website-Alben &amp; Synchronisation
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
                                <div class="d-flex justify-content-between align-items-center mb-1">
                                    <label class="form-label small fw-semibold mb-0" for="gal-sync-album-select">Immich-Album auswählen:</label>
                                    <div class="d-flex gap-1">
                                        <button type="button" class="btn btn-outline-primary btn-xs py-0 px-2 fw-semibold" onclick="openCreateImmichAlbumModal()" title="Neues Album direkt auf Immich erstellen" style="font-size: 0.75rem; line-height: 1.6;">
                                            <i class="fas fa-plus me-1"></i>Neues Album
                                        </button>
                                        <button type="button" class="btn btn-outline-secondary btn-xs py-0 px-2" id="btn-refresh-immich-albums" onclick="refreshImmichAlbumsDropdown()" title="Albenliste aus Immich neu laden (CT 116)" style="font-size: 0.75rem; line-height: 1.6;">
                                            <i class="fas fa-sync-alt" id="icon-refresh-immich-albums"></i>
                                        </button>
                                    </div>
                                </div>
                                <select id="gal-sync-album-select" class="form-select form-select-sm" onchange="onImmichAlbumSelected()">
                                    <option value="">Lade verfügbare Immich-Alben...</option>
                                </select>
                                <div id="gal-album-live-info" class="text-muted mt-1" style="font-size: 0.72rem;">
                                    Wird live mit Proxmox CT 116 synchron gehalten.
                                </div>
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
async function loadImmichAlbumsForDropdown(options = {}) {
    const { silent = false, preferredAlbumId = null } = options;
    const selectEl = document.getElementById('gal-sync-album-select');
    const liveInfoEl = document.getElementById('gal-album-live-info');
    if (!selectEl) return;

    const previousValue = preferredAlbumId || selectEl.value;

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        if (data.success && Array.isArray(data.immichAlbums)) {
            availableImmichAlbums = data.immichAlbums;

            if (availableImmichAlbums.length === 0) {
                selectEl.innerHTML = '<option value="">Keine Alben auf Immich gefunden</option>';
                if (liveInfoEl) liveInfoEl.innerText = 'Keine Alben auf CT 116 gefunden.';
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

            // Vorherige Auswahl wiederherstellen oder neues Album selektieren
            if (previousValue) {
                selectEl.value = previousValue;
                if (selectEl.value === previousValue) {
                    onImmichAlbumSelected();
                }
            }

            if (liveInfoEl) {
                const timeStr = new Date().toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
                liveInfoEl.innerHTML = `<i class="fas fa-check text-success me-1"></i>${availableImmichAlbums.length} Alben auf CT 116 (Stand: ${timeStr})`;
            }
        }
    } catch (err) {
        if (!silent) console.warn('Konnte Immich-Alben für Dropdown nicht laden:', err);
        if (!availableImmichAlbums || availableImmichAlbums.length === 0) {
            selectEl.innerHTML = '<option value="">Fehler beim Laden der Immich-Alben</option>';
        }
    }
}

// Manuelles Neuladen via Refresh-Button
async function refreshImmichAlbumsDropdown() {
    const btn = document.getElementById('btn-refresh-immich-albums');
    const icon = document.getElementById('icon-refresh-immich-albums');
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        await loadImmichAlbumsForDropdown({ silent: false });
        await loadImmichDashboardData();
        if (typeof showToast === 'function') {
            showToast(`Immich-Alben aktualisiert (${availableImmichAlbums.length} Alben gefunden).`, 'info');
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}

// =========================================================
//  NEUES ALBUM DIREKT AUF IMMICH ERSTELLEN
// =========================================================
function openCreateImmichAlbumModal() {
    ensureGalerieModals();
    const modalEl = document.getElementById('modalCreateImmichAlbum');
    if (!modalEl) return;
    applyGlobalModalStandard('modalCreateImmichAlbum');

    // Felder zurücksetzen
    const nameInput = document.getElementById('new-immich-album-name');
    const descInput = document.getElementById('new-immich-album-desc');
    const feedbackEl = document.getElementById('new-immich-album-feedback');
    const submitBtn = document.getElementById('btn-submit-create-album');

    if (nameInput) nameInput.value = '';
    if (descInput) descInput.value = '';
    if (feedbackEl) {
        feedbackEl.className = 'small mt-1 text-muted';
        feedbackEl.innerHTML = '<i class="fas fa-info-circle me-1"></i>Verwende einen prägnanten Namen, z. B. «Endschiessen 2026».';
    }
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fas fa-check me-1"></i> Album jetzt anlegen';
    }

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    setTimeout(() => {
        if (nameInput) nameInput.focus();
    }, 300);
}

function checkAlbumNameDuplicate(val) {
    const clean = (val || '').trim();
    const feedbackEl = document.getElementById('new-immich-album-feedback');
    const submitBtn = document.getElementById('btn-submit-create-album');

    if (!clean) {
        if (feedbackEl) {
            feedbackEl.className = 'small mt-1 text-muted';
            feedbackEl.innerHTML = '<i class="fas fa-info-circle me-1"></i>Gib einen Albumnamen ein.';
        }
        if (submitBtn) submitBtn.disabled = true;
        return false;
    }

    // Prüfe Duplikat (case-insensitive) gegen vorhandene Immich-Alben
    const duplicate = availableImmichAlbums.find(a => (a.name || '').toLowerCase() === clean.toLowerCase());
    if (duplicate) {
        if (feedbackEl) {
            feedbackEl.className = 'small mt-1 text-danger fw-semibold';
            feedbackEl.innerHTML = `<i class="fas fa-exclamation-triangle me-1"></i>Ein Album mit dem Namen «${escapeHtml(duplicate.name)}» existiert bereits in Immich! Bitte wähle einen anderen Namen.`;
        }
        if (submitBtn) submitBtn.disabled = true;
        return false;
    }

    if (feedbackEl) {
        feedbackEl.className = 'small mt-1 text-success';
        feedbackEl.innerHTML = `<i class="fas fa-check-circle me-1"></i>Name «${escapeHtml(clean)}» ist frei verfügbar.`;
    }
    if (submitBtn) submitBtn.disabled = false;
    return true;
}

async function submitCreateImmichAlbum() {
    const nameInput = document.getElementById('new-immich-album-name');
    const descInput = document.getElementById('new-immich-album-desc');
    const submitBtn = document.getElementById('btn-submit-create-album');
    const modalEl = document.getElementById('modalCreateImmichAlbum');

    const albumName = (nameInput?.value || '').trim();
    const description = (descInput?.value || '').trim();

    if (!albumName) {
        checkAlbumNameDuplicate('');
        return;
    }

    if (!checkAlbumNameDuplicate(albumName)) {
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1" role="status"></span> Lege Album in Immich an...';
    }

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
                action: 'create_album',
                albumName,
                description
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Fehler beim Anlegen des Albums auf Immich');
        }

        // Modal schliessen
        if (modalEl) {
            bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        if (typeof showToast === 'function') {
            showToast(`Album «${data.album?.name || albumName}» erfolgreich in Immich erstellt!`, 'success');
        }

        // Dropdown neu laden und neues Album direkt auswählen (sowohl Hauptseite als auch Kuratierungs-Modal)
        await loadImmichAlbumsForDropdown({ silent: false, preferredAlbumId: data.album?.id });
        populateCurateAlbumDropdowns(data.album?.id);

    } catch (err) {
        console.error('Fehler beim Erstellen des Albums:', err);
        if (typeof showToast === 'function') {
            showToast(`Konnte Album nicht anlegen: ${err.message}`, 'error');
        } else {
            alert(`Konnte Album nicht anlegen: ${err.message}`);
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fas fa-check me-1"></i> Album jetzt anlegen';
        }
    }
}

// State für Foto-Kuratierungs-Cockpit
let currentInboxAssets = [];
let selectedInboxAssetIds = new Set();

// =========================================================
//  ANLEITUNGS-MODAL FÜR VORSTANDSMITGLIEDER
// =========================================================
function openGalerieWorkflowGuideModal() {
    ensureGalerieModals();
    const modalEl = document.getElementById('modalGalerieWorkflowGuide');
    if (!modalEl) return;
    applyGlobalModalStandard('modalGalerieWorkflowGuide');
    bootstrap.Modal.getOrCreateInstance(modalEl).show();
}

// =========================================================
//  FOTO-KURATIERUNGS-COCKPIT (1-KLICK BEREINIGUNG)
// =========================================================
async function openCurateInboxModal() {
    ensureGalerieModals();
    const modalEl = document.getElementById('modalCurateInbox');
    if (!modalEl) return;
    applyGlobalModalStandard('modalCurateInbox');

    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();

    const gridContainer = document.getElementById('curate-grid-container');
    if (gridContainer) {
        gridContainer.innerHTML = `
            <div class="text-center py-5 text-muted">
                <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
                Lade Fotos aus dem Sammelalbum «Mitglieder-Uploads»...
            </div>
        `;
    }

    try {
        // Alben immer frisch von CT 116 nachladen & Dropdowns vorbereiten
        await loadImmichAlbumsForDropdown({ silent: true });
        populateCurateAlbumDropdowns();

        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync?action=get_inbox_assets`);
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();

        if (data.success && Array.isArray(data.assets)) {
            currentInboxAssets = data.assets;
            // Alle Fotos standardmässig vorselektieren
            selectedInboxAssetIds = new Set(currentInboxAssets.map(a => a.id));
            renderCurateGrid();
            return;
        }
        throw new Error(data.error || 'Konnte Fotos nicht laden');
    } catch (err) {
        console.error('Fehler beim Laden der Inbox-Fotos:', err);
        if (gridContainer) {
            gridContainer.innerHTML = `
                <div class="alert alert-warning m-3 small">
                    <i class="fas fa-exclamation-triangle me-1"></i> Konnte Fotos aus dem Sammelalbum nicht laden: ${escapeHtml(err.message)}
                </div>
            `;
        }
    }
}

function populateCurateAlbumDropdowns(preferredTargetId = null) {
    const targetSelect = document.getElementById('curate-target-album-select');
    const archiveSelect = document.getElementById('curate-archive-album-select');
    if (!targetSelect || !archiveSelect) return;

    if (!availableImmichAlbums || availableImmichAlbums.length === 0) {
        targetSelect.innerHTML = '<option value="">Keine Alben vorhanden (bitte erstellen)</option>';
        archiveSelect.innerHTML = '<option value="">Keine Alben vorhanden</option>';
        return;
    }

    targetSelect.innerHTML = `
        <option value="">-- Zielalbum wählen (${availableImmichAlbums.length}) --</option>
        ${availableImmichAlbums.map(alb => `
            <option value="${escapeHtml(alb.id)}">
                📁 ${escapeHtml(alb.name)} (${alb.assetCount} Medien)
            </option>
        `).join('')}
    `;

    archiveSelect.innerHTML = `
        ${availableImmichAlbums.map(alb => `
            <option value="${escapeHtml(alb.id)}">
                📁 ${escapeHtml(alb.name)}
            </option>
        `).join('')}
    `;

    // Sinnvolle Standardauswahl für Zielalbum: Bevorzugtes Album > "Endschiessen" > erstes Album
    if (preferredTargetId && availableImmichAlbums.some(a => a.id === preferredTargetId)) {
        targetSelect.value = preferredTargetId;
    } else {
        const endschiessenAlbum = availableImmichAlbums.find(a => (a.name || '').toLowerCase().includes('endschiessen'));
        if (endschiessenAlbum) {
            targetSelect.value = endschiessenAlbum.id;
        } else if (availableImmichAlbums.length > 0) {
            targetSelect.value = availableImmichAlbums[0].id;
        }
    }

    // Sinnvolle Standardauswahl für Sammelbecken (z.B. "Archiv")
    const archiveAlbum = availableImmichAlbums.find(a => (a.name || '').toLowerCase().includes('archiv'));
    if (archiveAlbum) {
        archiveSelect.value = archiveAlbum.id;
    } else if (availableImmichAlbums.length > 0) {
        archiveSelect.value = availableImmichAlbums[availableImmichAlbums.length - 1].id;
    }
}

async function refreshCurateAlbumsDropdown() {
    const btn = document.getElementById('btn-refresh-curate-albums');
    const icon = document.getElementById('icon-refresh-curate-albums');
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        const targetSelect = document.getElementById('curate-target-album-select');
        const currentVal = targetSelect?.value;
        await loadImmichAlbumsForDropdown({ silent: false });
        populateCurateAlbumDropdowns(currentVal);
        if (typeof showToast === 'function') {
            showToast(`Albenliste aktualisiert (${availableImmichAlbums.length} Alben gefunden).`, 'info');
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}
window.refreshCurateAlbumsDropdown = refreshCurateAlbumsDropdown;

async function triggerImmichMlJobs() {
    const btn = document.getElementById('btn-trigger-immich-ml');
    const icon = document.getElementById('icon-trigger-immich-ml');
    if (btn) btn.disabled = true;
    if (icon) icon.classList.add('fa-spin');

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({ action: 'trigger_ml_jobs' })
        });

        const data = await res.json();
        if (data.success) {
            const msg = '⚡ KI-Gesichtserkennung & Smart Search auf CT 116 erfolgreich gestartet!';
            if (typeof showToast === 'function') {
                showToast(msg, 'success');
            } else {
                alert(msg);
            }
        } else {
            throw new Error(data.error || 'Serverfehler');
        }
    } catch (err) {
        console.error('Fehler beim Starten der KI-Jobs:', err);
        if (typeof showToast === 'function') {
            showToast(`Konnte KI-Jobs nicht starten: ${err.message}`, 'error');
        } else {
            alert(`Konnte KI-Jobs nicht starten: ${err.message}`);
        }
    } finally {
        if (btn) btn.disabled = false;
        if (icon) icon.classList.remove('fa-spin');
    }
}
window.triggerImmichMlJobs = triggerImmichMlJobs;

function renderCurateGrid() {
    const gridContainer = document.getElementById('curate-grid-container');
    const summaryEl = document.getElementById('curate-selection-summary');
    const countBadge = document.getElementById('curate-modal-count-badge');
    const submitBtn = document.getElementById('btn-submit-curate');
    if (!gridContainer) return;

    if (!currentInboxAssets || currentInboxAssets.length === 0) {
        gridContainer.innerHTML = `
            <div class="text-center py-5">
                <div class="fs-1 text-success mb-2">🎉</div>
                <h6 class="fw-bold text-dark">Keine offenen Uploads!</h6>
                <p class="text-muted small mb-0">Das Sammelalbum «Mitglieder-Uploads» ist bereits vollständig aufgeräumt.</p>
            </div>
        `;
        if (summaryEl) summaryEl.innerText = '0 Fotos vorhanden';
        if (countBadge) countBadge.innerText = '0 Fotos';
        if (submitBtn) submitBtn.disabled = true;
        return;
    }

    if (countBadge) countBadge.innerText = `${currentInboxAssets.length} Fotos`;
    if (summaryEl) summaryEl.innerText = `${selectedInboxAssetIds.size} von ${currentInboxAssets.length} für Zielalbum ausgewählt`;
    if (submitBtn) submitBtn.disabled = false;

    const html = `
        <div class="row row-cols-2 row-cols-sm-3 row-cols-md-4 row-cols-lg-5 g-2">
            ${currentInboxAssets.map(asset => {
                const isSelected = selectedInboxAssetIds.has(asset.id);
                const dateStr = asset.fileCreatedAt ? new Date(asset.fileCreatedAt).toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
                return `
                    <div class="col">
                        <div class="card h-100 border ${isSelected ? 'border-primary border-2 shadow-sm' : 'border-light-subtle'} curate-photo-card position-relative overflow-hidden" 
                             onclick="toggleCurateItem('${asset.id}')"
                             style="cursor: pointer; transition: all 0.15s ease;">
                            
                            <!-- SELECTION CHECK BADGE -->
                            <div class="position-absolute top-0 end-0 m-1.5 z-2">
                                <span class="badge ${isSelected ? 'bg-primary' : 'bg-light text-muted border'} rounded-circle p-1.5 d-flex align-items-center justify-content-center" style="width: 24px; height: 24px;">
                                    <i class="fas ${isSelected ? 'fa-check text-white' : 'fa-minus small'}"></i>
                                </span>
                            </div>

                            <!-- THUMBNAIL -->
                            <div class="ratio ratio-4x3 bg-dark-subtle">
                                <img src="${asset.thumbnailUrl}" 
                                     alt="${escapeHtml(asset.originalFileName)}" 
                                     loading="lazy" 
                                     class="object-fit-cover w-100 h-100"
                                     onerror="this.onerror=null; this.src='https://placehold.co/300x225?text=Foto';">
                            </div>

                            <!-- INFO -->
                            <div class="p-1.5 bg-white small">
                                <div class="text-truncate fw-semibold text-dark" style="font-size: 0.76rem;" title="${escapeHtml(asset.originalFileName)}">
                                    ${escapeHtml(asset.originalFileName)}
                                </div>
                                <div class="text-muted" style="font-size: 0.68rem;">
                                    ${dateStr || 'Foto'}
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;

    gridContainer.innerHTML = html;
}

function toggleCurateItem(id) {
    if (selectedInboxAssetIds.has(id)) {
        selectedInboxAssetIds.delete(id);
    } else {
        selectedInboxAssetIds.add(id);
    }
    renderCurateGrid();
}

function curateSelectAll(selectAll) {
    if (selectAll) {
        selectedInboxAssetIds = new Set(currentInboxAssets.map(a => a.id));
    } else {
        selectedInboxAssetIds.clear();
    }
    renderCurateGrid();
}

function onCurateUnselectedActionChanged() {
    const actionSelect = document.getElementById('curate-unselected-action');
    const wrapper = document.getElementById('curate-archive-select-wrapper');
    if (!actionSelect || !wrapper) return;
    if (actionSelect.value === 'archive') {
        wrapper.classList.remove('d-none');
    } else {
        wrapper.classList.add('d-none');
    }
}

async function submitCurateInbox() {
    const targetSelect = document.getElementById('curate-target-album-select');
    const actionSelect = document.getElementById('curate-unselected-action');
    const archiveSelect = document.getElementById('curate-archive-album-select');
    const submitBtn = document.getElementById('btn-submit-curate');
    const modalEl = document.getElementById('modalCurateInbox');

    const targetAlbumId = targetSelect?.value;
    const unselectedAction = actionSelect?.value || 'keep';
    const archiveAlbumId = archiveSelect?.value;

    const selectedIds = Array.from(selectedInboxAssetIds);
    const unselectedIds = currentInboxAssets.filter(a => !selectedInboxAssetIds.has(a.id)).map(a => a.id);

    if (selectedIds.length === 0 && unselectedIds.length === 0) {
        if (typeof showToast === 'function') showToast('Keine Fotos zum Einsortieren vorhanden.', 'info');
        return;
    }

    if (selectedIds.length > 0 && !targetAlbumId) {
        if (typeof showToast === 'function') showToast('Bitte wähle ein Zielalbum für die ausgewählten Fotos aus.', 'warning');
        targetSelect?.focus();
        return;
    }

    if (unselectedAction === 'archive' && unselectedIds.length > 0 && !archiveAlbumId) {
        if (typeof showToast === 'function') showToast('Bitte wähle ein Sammelbecken für die nicht ausgewählten Fotos aus.', 'warning');
        archiveSelect?.focus();
        return;
    }

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status"></span> Einsortieren &amp; Bereinigen...`;
    }

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
                action: 'curate_inbox',
                selectedIds,
                targetAlbumId,
                unselectedIds,
                unselectedAction,
                archiveAlbumId
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Serverfehler beim Einsortieren der Fotos');
        }

        // Modal schliessen
        if (modalEl) {
            bootstrap.Modal.getInstance(modalEl)?.hide();
        }

        const msg = `🎉 ${data.movedToTarget} Fotos erfolgreich einsortiert! Das Sammelalbum wurde bereinigt.`;
        if (typeof showToast === 'function') {
            showToast(msg, 'success');
        } else {
            alert(msg);
        }

        // Badges & Dropdown live aktualisieren
        updateGalerieBadge(data.remainingCount || 0);
        await Promise.all([
            loadImmichDashboardData(),
            loadImmichAlbumsForDropdown({ silent: true, preferredAlbumId: targetAlbumId })
        ]);

    } catch (err) {
        console.error('Fehler beim Einsortieren:', err);
        if (typeof showToast === 'function') {
            showToast(`Einsortieren fehlgeschlagen: ${err.message}`, 'error');
        } else {
            alert(`Einsortieren fehlgeschlagen: ${err.message}`);
        }
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas fa-paper-plane me-1.5"></i> Fotos jetzt einsortieren &amp; Bereinigen`;
        }
    }
}

// =========================================================
//  MODALS DYNAMISCH IN DEN DOM INJIZIEREN
// =========================================================
function ensureGalerieModals() {
    if (!document.getElementById('modalCreateImmichAlbum') || !document.getElementById('modalGalerieWorkflowGuide') || !document.getElementById('modalCurateInbox')) {
        const existing = document.getElementById('galerie-modals-container');
        if (existing) existing.remove();

        const modalWrapper = document.createElement('div');
        modalWrapper.id = 'galerie-modals-container';
        modalWrapper.innerHTML = `
        <!-- MODAL: INBOX KURATIERUNGS-COCKPIT -->
        <div class="modal fade" id="modalCurateInbox" tabindex="-1" aria-labelledby="modalCurateInboxLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-xl modal-dialog-scrollable">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-primary text-white py-2.5 px-3 d-flex justify-content-between align-items-center">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fs-5">✨</span>
                            <h6 class="modal-title fw-bold mb-0" id="modalCurateInboxLabel">
                                Foto-Eingangskorb: Uploads sichten &amp; einsortieren
                            </h6>
                            <span id="curate-modal-count-badge" class="badge bg-light text-primary fw-bold ms-2">Lade...</span>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    
                    <div class="modal-body p-3 bg-light d-flex flex-column" style="min-height: 420px; overflow-y: auto;">
                        <!-- SCHNELL-STEUERUNG & AUSWAHL -->
                        <div class="card border-0 shadow-xs mb-3 flex-shrink-0">
                            <div class="card-body p-2.5 d-flex justify-content-between align-items-center flex-wrap gap-2">
                                <div class="d-flex align-items-center gap-2">
                                    <span class="small fw-semibold text-muted">Auswahl:</span>
                                    <button type="button" class="btn btn-outline-primary btn-xs py-1 px-2.5 fw-semibold" onclick="curateSelectAll(true)">
                                        <i class="fas fa-check-double me-1"></i>Alle auswählen
                                    </button>
                                    <button type="button" class="btn btn-outline-secondary btn-xs py-1 px-2.5" onclick="curateSelectAll(false)">
                                        <i class="fas fa-times me-1"></i>Keine
                                    </button>
                                </div>
                                <div class="small fw-bold text-dark" id="curate-selection-summary">
                                    0 von 0 ausgewählt
                                </div>
                            </div>
                        </div>

                        <!-- FOTO-GRID -->
                        <div id="curate-grid-container" class="flex-grow-1 overflow-y-auto mb-3" style="min-height: 240px;">
                            <div class="text-center py-5 text-muted">
                                <div class="spinner-border text-primary spinner-border-sm me-2" role="status"></div>
                                Lade Fotos aus dem Sammelalbum...
                            </div>
                        </div>

                        <!-- AKTIONEN & ZIELALBEN -->
                        <div class="card border-0 shadow-xs flex-shrink-0 mt-auto">
                            <div class="card-body p-3 bg-white rounded">
                                <div class="row g-3 align-items-end">
                                    <div class="col-md-5">
                                        <label class="form-label small fw-bold mb-1" for="curate-target-album-select">
                                            <i class="fas fa-folder-open text-primary me-1"></i> 1. Zielalbum für ausgewählte Fotos:
                                        </label>
                                        <div class="d-flex gap-1">
                                            <select id="curate-target-album-select" class="form-select form-select-sm">
                                                <option value="">Lade Alben...</option>
                                            </select>
                                            <button type="button" class="btn btn-outline-primary btn-sm px-2" onclick="openCreateImmichAlbumModal()" title="Neues Album anlegen">
                                                <i class="fas fa-plus"></i>
                                            </button>
                                            <button type="button" class="btn btn-outline-secondary btn-sm px-2" id="btn-refresh-curate-albums" onclick="refreshCurateAlbumsDropdown()" title="Albenliste aus Immich neu laden (CT 116)">
                                                <i class="fas fa-sync-alt" id="icon-refresh-curate-albums"></i>
                                            </button>
                                        </div>
                                    </div>
                                    
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold mb-1" for="curate-unselected-action">
                                            <i class="fas fa-inbox text-muted me-1"></i> 2. Nicht ausgewählte Fotos:
                                        </label>
                                        <select id="curate-unselected-action" class="form-select form-select-sm" onchange="onCurateUnselectedActionChanged()">
                                            <option value="archive" selected>📦 In Sammelbecken verschieben</option>
                                            <option value="keep">⏳ Im Eingangskorb belassen</option>
                                            <option value="delete">🗑️ Ablehnen &amp; Löschen</option>
                                        </select>
                                    </div>

                                    <div class="col-md-3" id="curate-archive-select-wrapper">
                                        <label class="form-label small fw-semibold text-muted mb-1" for="curate-archive-album-select">
                                            Sammelbecken:
                                        </label>
                                        <select id="curate-archive-album-select" class="form-select form-select-sm">
                                            <option value="">Lade Sammelbecken...</option>
                                        </select>
                                    </div>
                                </div>

                                <div class="alert alert-light border mt-3 mb-0 py-2.5 px-3 small d-flex align-items-center justify-content-between flex-wrap gap-2">
                                    <span class="text-muted" style="font-size: 0.82rem;">
                                        <i class="fas fa-check-circle text-success me-1"></i> Gewählte Fotos werden dem Zielalbum zugewiesen und automatisch aus «Mitglieder-Uploads» ausgetragen.
                                    </span>
                                    <button type="button" class="btn btn-success btn-sm fw-bold px-3 py-2 shadow-xs" id="btn-submit-curate" onclick="submitCurateInbox()">
                                        <i class="fas fa-paper-plane me-1.5"></i> Fotos jetzt einsortieren &amp; Bereinigen
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- MODAL: NEUES ALBUM ERSTELLEN -->
        <div class="modal fade" id="modalCreateImmichAlbum" tabindex="-1" aria-labelledby="modalCreateImmichAlbumLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-primary text-white py-2 px-3">
                        <h6 class="modal-title fw-bold" id="modalCreateImmichAlbumLabel">
                            <i class="fas fa-folder-plus me-1.5"></i> Neues Immich-Album erstellen
                        </h6>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <div class="modal-body p-3">
                        <p class="small text-muted mb-3">
                            Erstelle direkt auf unserem Proxmox-Server (CT 116) ein neues Album. Es steht sofort in Immich und hier im Portal zur Verfügung.
                        </p>
                        <div class="mb-3">
                            <label class="form-label small fw-semibold mb-1" for="new-immich-album-name">Name des Albums / Anlasses:</label>
                            <input type="text" id="new-immich-album-name" class="form-control form-control-sm" placeholder="z. B. Endschiessen 2026" oninput="checkAlbumNameDuplicate(this.value)">
                            <div id="new-immich-album-feedback" class="small mt-1 text-muted">
                                <i class="fas fa-info-circle me-1"></i>Verwende einen prägnanten Namen, z. B. «Endschiessen 2026».
                            </div>
                        </div>
                        <div class="mb-2">
                            <label class="form-label small fw-semibold mb-1" for="new-immich-album-desc">Optionale Beschreibung (Notiz):</label>
                            <input type="text" id="new-immich-album-desc" class="form-control form-control-sm" placeholder="z. B. Vereinsanlass Herbst 2026">
                        </div>
                    </div>
                    <div class="modal-footer bg-light py-2 px-3">
                        <button type="button" class="btn btn-outline-secondary btn-sm" data-bs-dismiss="modal">Abbrechen</button>
                        <button type="button" class="btn btn-primary btn-sm fw-bold" id="btn-submit-create-album" onclick="submitCreateImmichAlbum()" disabled>
                            <i class="fas fa-check me-1"></i> Album jetzt anlegen
                        </button>
                    </div>
                </div>
            </div>
        </div>

        <!-- MODAL: DETAILLIERTE WORKFLOW-ANLEITUNG -->
        <div class="modal fade" id="modalGalerieWorkflowGuide" tabindex="-1" aria-labelledby="modalGalerieWorkflowGuideLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered modal-lg modal-dialog-scrollable">
                <div class="modal-content border-0 shadow">
                    <div class="modal-header bg-dark text-white py-2.5 px-3">
                        <h6 class="modal-title fw-bold" id="modalGalerieWorkflowGuideLabel">
                            <i class="fas fa-book-open text-primary me-2"></i>Anleitung: Fotos sichten, ordnen &amp; publizieren
                        </h6>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <div class="modal-body p-4">
                        <!-- ÜBERSICHT -->
                        <div class="d-flex align-items-center gap-3 p-3 bg-light rounded border mb-3">
                            <div class="fs-1 text-primary">🔄</div>
                            <div class="small">
                                <strong>Der Foto-Kreislauf bei den Sportschützen Muhen:</strong><br>
                                Vereinsmitglieder laden Schnappschüsse via <a href="../sportschuetzen-website/frontend/intern.html" target="_blank">intern.html</a> hoch. Diese landen automatisch im zentralen Sammelalbum <strong>«Mitglieder-Uploads»</strong> auf unserem Immich-Server (CT 116). Der rote Pendenzen-Badge signalisiert dir offene Uploads.
                            </div>
                        </div>

                        <!-- ZWEI VARIANTEN -->
                        <h6 class="fw-bold text-dark border-bottom pb-2 mb-3">
                            Wie sortiere ich Bilder in ein Zielalbum ein? (2 Varianten)
                        </h6>

                        <!-- VARIANTE 1 -->
                        <div class="card border mb-3 shadow-none">
                            <div class="card-header bg-primary-subtle py-2 d-flex justify-content-between align-items-center">
                                <span class="fw-bold text-primary small">
                                    <i class="fas fa-magic me-1"></i> Variante 1: Direkt im Portal mit dem Kuratierungs-Cockpit (Empfohlen)
                                </span>
                                <span class="badge bg-primary">1-Klick</span>
                            </div>
                            <div class="card-body p-3 small">
                                <ol class="mb-0 ps-3">
                                    <li class="mb-1.5">Klicke auf <strong>«✨ Fotos sichten &amp; einsortieren»</strong>.</li>
                                    <li class="mb-1.5">Wähle die gewünschten Bilder per Klick auf die Bildkacheln aus.</li>
                                    <li class="mb-1.5">Wähle dein <strong>Zielalbum</strong> (z. B. <em>2026 Endschiessen</em>) und das Sammelbecken für die restlichen Bilder.</li>
                                    <li class="mb-0">Klicke auf <strong>«Fotos jetzt einsortieren &amp; Bereinigen»</strong>. Das System ordnet die Bilder per API zu und leert das Sammelalbum automatisch!</li>
                                </ol>
                            </div>
                        </div>

                        <!-- VARIANTE 2 -->
                        <div class="card border mb-3 shadow-none">
                            <div class="card-header bg-light py-2 d-flex justify-content-between align-items-center">
                                <span class="fw-bold text-dark small">
                                    <i class="fas fa-external-link-alt me-1 text-secondary"></i> Variante 2: Manuell in der Immich Web-App
                                </span>
                                <span class="badge bg-secondary">Erweitert</span>
                            </div>
                            <div class="card-body p-3 small">
                                <ol class="mb-3 ps-3">
                                    <li class="mb-1.5">Klicke auf <strong>«📥 In Immich öffnen ↗»</strong>.</li>
                                    <li class="mb-1.5">Fahre mit der Maus über die gewünschten Bilder und setze das <strong>blaue Häkchen</strong>.</li>
                                    <li class="mb-1.5">Klicke oben rechts auf <strong><code>+</code></strong> und wähle das Zielalbum.</li>
                                    <li class="mb-0">Klicke anschliessend oben rechts auf <strong><code>⋮</code> &rarr; «Aus Album entfernen»</strong>.</li>
                                </ol>
                                <div class="alert alert-danger py-2 px-3 mb-0 border-0 small d-flex align-items-start gap-2">
                                    <i class="fas fa-exclamation-triangle mt-0.5 fs-6"></i>
                                    <div>
                                        <strong>⚠️ ACHTUNG:</strong> Niemals auf «Löschen» oder den Papierkorb klicken! Wähle beim manuellen Sortieren in Immich immer «Aus Album entfernen».
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- SCHRITT 3: PUBLIKATION -->
                        <div class="card border-0 bg-light p-3 small">
                            <div class="fw-bold text-dark mb-1">
                                <i class="fas fa-cloud-arrow-down text-primary me-1"></i> Schritt 3: Album auf der Website publizieren
                            </div>
                            <p class="text-muted mb-0">
                                Sobald die Fotos im Zielalbum liegen, wählst du das Album rechts im Dropdown aus, wählst die Sichtbarkeit (<strong>🔒 Nur Mitglieder</strong> für intern oder <strong>🌐 Öffentlich &amp; Mitglieder</strong> für die Homepage) und klickst auf <strong>«Album jetzt synchronisieren &amp; publizieren»</strong>. Das Album ist sofort live!
                            </p>
                        </div>
                    </div>
                    <div class="modal-footer bg-light py-2 px-3">
                        <button type="button" class="btn btn-primary btn-sm fw-bold px-3" data-bs-dismiss="modal">
                            <i class="fas fa-check me-1"></i> Alles klar, verstanden!
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
        document.body.appendChild(modalWrapper);
    }

    // Globalen UIModalKit / TableKit Standard für alle Modale aktivieren (Verschieben, Vergrössern, Verkleinern, Maximieren)
    ['modalCurateInbox', 'modalCreateImmichAlbum', 'modalGalerieWorkflowGuide'].forEach(id => {
        applyGlobalModalStandard(id);
    });
}

// =========================================================
//  GLOBALER MODAL-STANDARD (UIModalKit: Drag, Resize, Maximize)
// =========================================================
function applyGlobalModalStandard(modalId) {
    const modalEl = (typeof modalId === 'string') ? document.getElementById(modalId) : modalId;
    if (!modalEl) return;

    if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
        window.UIModalKit.makeMovableAndResizable(modalEl);
    } else if (window.TableKit && typeof window.TableKit.setupDraggableModal === 'function') {
        window.TableKit.setupDraggableModal(modalEl);
    }
}
window.applyGlobalModalStandard = applyGlobalModalStandard;

// Globale Bereitstellung
window.openCreateImmichAlbumModal = openCreateImmichAlbumModal;
window.checkAlbumNameDuplicate = checkAlbumNameDuplicate;
window.submitCreateImmichAlbum = submitCreateImmichAlbum;
window.refreshImmichAlbumsDropdown = refreshImmichAlbumsDropdown;
window.openGalerieWorkflowGuideModal = openGalerieWorkflowGuideModal;
window.loadImmichAlbumsForDropdown = loadImmichAlbumsForDropdown;
window.openCurateInboxModal = openCurateInboxModal;
window.toggleCurateItem = toggleCurateItem;
window.curateSelectAll = curateSelectAll;
window.onCurateUnselectedActionChanged = onCurateUnselectedActionChanged;
window.submitCurateInbox = submitCurateInbox;

// Auto-Refresh beim Tab-Wechsel zurück ins Portal (z.B. nach Erstellen in Immich)
window.addEventListener('focus', () => {
    const selectEl = document.getElementById('gal-sync-album-select');
    if (selectEl && selectEl.offsetParent !== null) {
        loadImmichAlbumsForDropdown({ silent: true });
        loadImmichDashboardData();
    }
    const curateSelect = document.getElementById('curate-target-album-select');
    if (curateSelect && curateSelect.offsetParent !== null) {
        const curVal = curateSelect.value;
        loadImmichAlbumsForDropdown({ silent: true }).then(() => {
            populateCurateAlbumDropdowns(curVal);
        });
    }
});

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
window.unpublishAlbum = unpublishAlbum;

// =========================================================
//  SICHTBARKEIT UMSCHALTEN (ÖFFENTLICH <-> NUR MITGLIEDER)
// =========================================================
async function toggleAlbumVisibility(albumId, newVisibility, albumTitle, btnEl) {
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" style="width: 0.65rem; height: 0.65rem;"></span> Ändere...`;
    }

    try {
        const res = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'apikey': SUPABASE_ANON_KEY
            },
            body: JSON.stringify({
                action: 'set_visibility',
                albumId,
                visibility: newVisibility
            })
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.error || 'Fehler beim Ändern der Sichtbarkeit');
        }

        const visLabel = (newVisibility === 'public') ? '🌐 Öffentlich & Mitglieder' : '🔒 Nur Mitglieder';
        if (typeof showToast === 'function') {
            showToast(`Sichtbarkeit für «${albumTitle}» geändert: ${visLabel}`, 'success');
        }

        await loadPublishedWebsiteAlbums();
    } catch (err) {
        console.error('Fehler beim Ändern der Sichtbarkeit:', err);
        if (typeof showToast === 'function') {
            showToast(`Konnte Sichtbarkeit nicht ändern: ${err.message}`, 'error');
        } else {
            alert(`Konnte Sichtbarkeit nicht ändern: ${err.message}`);
        }
        await loadPublishedWebsiteAlbums();
    }
}
window.toggleAlbumVisibility = toggleAlbumVisibility;

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
            // Fallback auf Edge Function (nutzt Service Role)
            try {
                const fnRes = await fetch(`${SUPABASE_FUNCTIONS_URL}/immich-sync`);
                if (fnRes.ok) {
                    const fnData = await fnRes.json();
                    if (Array.isArray(fnData.publishedAlbums)) {
                        albums = fnData.publishedAlbums;
                    }
                }
            } catch(e) {}
            
            // Sekundaerer Fallback auf statische JSON
            if (!albums || albums.length === 0) {
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
            const safeTitle = escapeHtml(alb.website_title || alb.album_name);
            const visBadge = isPublic
                ? `<button type="button" class="btn btn-xs py-0.5 px-2 rounded-pill bg-success-subtle text-success border border-success-subtle fw-semibold d-inline-flex align-items-center gap-1 shadow-none" 
                        title="Aktuell: Öffentlich &amp; Mitglieder (Homepage &amp; intern). Klicke hier, um auf «Nur Mitglieder» umzustellen." 
                        onclick="toggleAlbumVisibility('${alb.id}', 'members', '${safeTitle}', this)" 
                        style="font-size: 0.72rem; cursor: pointer; transition: all 0.15s ease;">
                        <span>🌐 Öffentlich &amp; Mitglieder</span>
                        <i class="fas fa-exchange-alt small opacity-50 ms-0.5"></i>
                   </button>`
                : `<button type="button" class="btn btn-xs py-0.5 px-2 rounded-pill bg-primary-subtle text-primary border border-primary-subtle fw-semibold d-inline-flex align-items-center gap-1 shadow-none" 
                        title="Aktuell: Nur Mitglieder (geschützt). Klicke hier, um auf «Öffentlich &amp; Mitglieder» umzustellen." 
                        onclick="toggleAlbumVisibility('${alb.id}', 'public', '${safeTitle}', this)" 
                        style="font-size: 0.72rem; cursor: pointer; transition: all 0.15s ease;">
                        <span>🔒 Nur Mitglieder</span>
                        <i class="fas fa-exchange-alt small opacity-50 ms-0.5"></i>
                   </button>`;

            return `
                <div class="list-group-item d-flex justify-content-between align-items-center py-2 px-3">
                    <div>
                        <div class="fw-semibold text-dark">${safeTitle}</div>
                        <div class="text-muted small">${alb.media_count || 0} Fotos/Medien</div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        ${visBadge}
                        <button class="btn btn-outline-danger btn-sm py-0 px-1.5" title="Von Website entfernen" onclick="unpublishAlbum('${alb.id}', '${safeTitle}')">
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
    window._galInboxCount = parseInt(count) || 0;
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

function updateRentalBadge(count) {
    window._rentalInboxCount = parseInt(count) || 0;
    const navBadge = document.getElementById('vermietung-nav-badge');
    const tileBadge = document.getElementById('vermietung-tile-badge');
    [navBadge, tileBadge].forEach(el => {
        if (!el) return;
        if (window._rentalInboxCount > 0) {
            el.innerText = window._rentalInboxCount;
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });
    if (typeof window.updateMobileGlobalBadge === 'function') window.updateMobileGlobalBadge();
}
window.updateRentalBadge = updateRentalBadge;

function updateInvoiceBadge(count) {
    window._invoiceInboxCount = parseInt(count) || 0;
    const navBadge = document.getElementById('rechnungen-nav-badge');
    const tileBadge = document.getElementById('rechnungen-tile-badge');
    [navBadge, tileBadge].forEach(el => {
        if (!el) return;
        if (window._invoiceInboxCount > 0) {
            el.innerText = window._invoiceInboxCount;
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });
    if (typeof window.updateMobileGlobalBadge === 'function') window.updateMobileGlobalBadge();
}
window.updateInvoiceBadge = updateInvoiceBadge;

function updateUmfragenBadge(count) {
    window._umfragenInboxCount = parseInt(count) || 0;
    const navBadge = document.getElementById('umfragen-nav-badge');
    const tileBadge = document.getElementById('umfragen-tile-badge');
    [navBadge, tileBadge].forEach(el => {
        if (!el) return;
        if (window._umfragenInboxCount > 0) {
            el.innerText = window._umfragenInboxCount;
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });
    if (typeof window.updateMobileGlobalBadge === 'function') window.updateMobileGlobalBadge();
}
window.updateUmfragenBadge = updateUmfragenBadge;

function updateMailBadge(count) {
    window._mailInboxCount = parseInt(count) || 0;
    const navBadge = document.getElementById('mail-nav-badge');
    const tileBadge = document.getElementById('mail-tile-badge');
    [navBadge, tileBadge].forEach(el => {
        if (!el) return;
        if (window._mailInboxCount > 0) {
            el.innerText = window._mailInboxCount;
            el.classList.remove('d-none');
        } else {
            el.classList.add('d-none');
        }
    });
    if (typeof window.updateMobileGlobalBadge === 'function') window.updateMobileGlobalBadge();
}
window.updateMailBadge = updateMailBadge;

async function refreshAllPortalPendenzenBadges() {
    try {
        const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
        if (supa && supa.rpc) {
            const { data, error } = await supa.rpc('get_member_pendenzen_count', {
                p_lizenz: null,
                p_is_board: true
            });
            if (!error && data) {
                if (typeof window.updateRentalBadge === 'function') {
                    window.updateRentalBadge(data.board_rentals || 0);
                }
                if (typeof window.updateInvoiceBadge === 'function') {
                    window.updateInvoiceBadge(data.board_invoices_total || 0);
                }
                if (typeof window.updateUmfragenBadge === 'function') {
                    window.updateUmfragenBadge(data.board_polls_past || 0);
                }
                if (typeof window.updateMailBadge === 'function') {
                    window.updateMailBadge(data.board_mails_failed || 0);
                }
                if (typeof window.updateJMInboxBadge === 'function') {
                    window.updateJMInboxBadge(data.board_ocr || 0);
                }
            }
        }
    } catch (e) {
        console.warn("Fehler beim Laden der Pendenzen-Badges via RPC:", e);
    }

    // Galerie (Immich) parallel abfragen
    if (typeof window.checkGalerieInboxBadge === 'function') {
        window.checkGalerieInboxBadge();
    }
}
window.refreshAllPortalPendenzenBadges = refreshAllPortalPendenzenBadges;

// =========================================================
//  ZENTRALER SAMMEL-BADGE FÜR MOBIL & IPAD
// =========================================================
function updateMobileGlobalBadge() {
    const mobileBadge = document.getElementById('mobile-global-badge');

    const jmBadge = document.getElementById('jm-nav-badge');
    const galBadge = document.getElementById('galerie-nav-badge');
    const rentalBadge = document.getElementById('vermietung-nav-badge');
    const invBadge = document.getElementById('rechnungen-nav-badge');
    const umfBadge = document.getElementById('umfragen-nav-badge');
    const mailBadge = document.getElementById('mail-nav-badge');

    const jmCount = (typeof window._jmInboxCount === 'number')
        ? window._jmInboxCount
        : ((jmBadge && !jmBadge.classList.contains('d-none')) ? (parseInt(jmBadge.innerText) || 0) : 0);
    const galCount = (typeof window._galInboxCount === 'number')
        ? window._galInboxCount
        : ((galBadge && !galBadge.classList.contains('d-none')) ? (parseInt(galBadge.innerText) || 0) : 0);
    const rentalCount = (typeof window._rentalInboxCount === 'number')
        ? window._rentalInboxCount
        : ((rentalBadge && !rentalBadge.classList.contains('d-none')) ? (parseInt(rentalBadge.innerText) || 0) : 0);
    const invCount = (typeof window._invoiceInboxCount === 'number')
        ? window._invoiceInboxCount
        : ((invBadge && !invBadge.classList.contains('d-none')) ? (parseInt(invBadge.innerText) || 0) : 0);
    const umfCount = (typeof window._umfragenInboxCount === 'number')
        ? window._umfragenInboxCount
        : ((umfBadge && !umfBadge.classList.contains('d-none')) ? (parseInt(umfBadge.innerText) || 0) : 0);
    const mailCount = (typeof window._mailInboxCount === 'number')
        ? window._mailInboxCount
        : ((mailBadge && !mailBadge.classList.contains('d-none')) ? (parseInt(mailBadge.innerText) || 0) : 0);

    const total = jmCount + galCount + rentalCount + invCount + umfCount + mailCount;
    if (mobileBadge) {
        if (total > 0) {
            mobileBadge.innerText = total > 99 ? '99+' : String(total);
            mobileBadge.classList.remove('d-none');
        } else {
            mobileBadge.classList.add('d-none');
        }
    }

    // Native iOS 16.4+ / Android PWA App Badge auf dem Homescreen
    if ('setAppBadge' in navigator) {
        if (total > 0) {
            navigator.setAppBadge(total).catch(() => {});
        } else {
            navigator.clearAppBadge().catch(() => {});
        }
    }
}
window.updateMobileGlobalBadge = updateMobileGlobalBadge;

// =========================================================
//  iOS/ANDROID PWA BERECHTIGUNGEN & HOMESCREEN-BADGES
// =========================================================
function updatePortalBadgePermissionUi() {
    const banner = document.getElementById('portal-badge-perm-banner');
    const sidebarBtn = document.getElementById('portal-badge-perm-btn');
    const isGranted = ('Notification' in window) && Notification.permission === 'granted';

    if (banner) {
        banner.classList.toggle('d-none', isGranted);
    }
    if (sidebarBtn) {
        sidebarBtn.classList.toggle('d-none', isGranted);
    }
}
window.updatePortalBadgePermissionUi = updatePortalBadgePermissionUi;

async function requestPortalPushPermission() {
    let perm = null;
    try {
        if ('Notification' in window && typeof Notification.requestPermission === 'function') {
            perm = await Notification.requestPermission();
            console.log("Portal native notification permission:", perm);
        }
    } catch (e) {
        console.warn("Portal Notification request error:", e);
    }

    try {
        if (window.OneSignal && window.OneSignal.Notifications && typeof window.OneSignal.Notifications.requestPermission === 'function') {
            await window.OneSignal.Notifications.requestPermission();
        }
    } catch (_) {}

    updatePortalBadgePermissionUi();
    recordPortalPushSubscription();
    if (typeof window.updateMobileGlobalBadge === 'function') {
        window.updateMobileGlobalBadge();
    }
}
window.requestPortalPushPermission = requestPortalPushPermission;

function recordPortalPushSubscription() {
    const isGranted = ('Notification' in window) && Notification.permission === 'granted';
    const user = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
    const pn = user?.person_number || parseInt(user?.username, 10);
    if (!pn || isNaN(pn)) return;
    const devType = /iPad|iPhone|iPod/.test(navigator.userAgent) ? 'ios' : (/Android/.test(navigator.userAgent) ? 'android' : 'desktop');
    try {
        const supa = typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null;
        if (supa) {
            supa.from('push_subscriptions').upsert({
                person_number: pn,
                device_type: devType,
                permission_status: isGranted ? 'granted' : 'default',
                last_active_at: new Date().toISOString()
            }, { onConflict: 'person_number,device_type' }).then(() => {});
        }
    } catch (_) {}
}
window.recordPortalPushSubscription = recordPortalPushSubscription;

// Initialer Check beim Start des Vorstands-Portals
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        checkGalerieInboxBadge();
        updatePortalBadgePermissionUi();
        recordPortalPushSubscription();
    }, 1400);
});

