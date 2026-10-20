/**
 * Galerie & Immich Management Cockpit
 * 
 * Zentrales Steuerungsmodul für das Fotoarchiv der Sportschützen Muhen.
 * - Anbindung an den nativen Immich Server (Proxmox CT 116 auf Medion Node)
 * - Überwachung des Sammelalbums «Mitglieder-Uploads»
 * - Kuratierung & Freigabe via Immich Web-App
 * - Synchronisation zur Vereins-Website & intern.html
 */

let immichServerStatus = null;

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
                                    Prüfe Verbindung zu Proxmox CT 116 (Medion Node)...
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
            <div class="col-lg-8">
                <div class="card shadow-sm border-0 h-100">
                    <div class="card-header bg-white border-bottom py-3 d-flex justify-content-between align-items-center">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-tools text-primary me-2"></i>Foto-Kuratierung & KI-Gesichtserkennung
                        </h6>
                        <span class="badge bg-light text-muted border">Server-KI aktiv</span>
                    </div>
                    <div class="card-body p-4">
                        <p class="text-muted mb-3">
                            Auf unserem Medion-Node (CT 116) läuft der leistungsstarke Immich-Server mit eigener Machine-Learning-Pipeline. Sämtliche Fotos werden serverseitig vollautomatisch analysiert, Gesichter geclustert und Duplikate erkannt.
                        </p>
                        
                        <div class="row g-3 mb-4">
                            <div class="col-sm-6">
                                <div class="p-3 rounded bg-light border h-100">
                                    <div class="fw-bold mb-1 text-primary">📥 Mitglieder-Uploads sichten</div>
                                    <div class="small text-muted mb-3" id="inbox-album-info">
                                        Wird geladen...
                                    </div>
                                    <a href="https://immich-muhen.danfamily.uk/albums/6184f06d-be38-426b-8737-1bec29ab045e" target="_blank" rel="noopener noreferrer" class="btn btn-primary btn-sm w-100 fw-bold">
                                        📥 Sammelalbum öffnen ↗
                                    </a>
                                </div>
                            </div>
                            <div class="col-sm-6">
                                <div class="p-3 rounded bg-light border h-100">
                                    <div class="fw-bold mb-1 text-primary">👤 Personen & Gesichter</div>
                                    <div class="small text-muted mb-3">
                                        Ordne erkannte Gesichter den Vereinsmitgliedern zu. Die Tags werden für die Suche synchronisiert.
                                    </div>
                                    <a href="https://immich-muhen.danfamily.uk/people" target="_blank" rel="noopener noreferrer" class="btn btn-outline-primary btn-sm w-100 fw-bold">
                                        👤 Personen verwalten ↗
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div class="d-flex justify-content-between align-items-center bg-primary-subtle p-3 rounded">
                            <div>
                                <div class="fw-bold text-primary">Immich Web-App öffnen</div>
                                <div class="small text-muted">Vollständiger Zugriff auf alle Bibliotheken, Alben und Freigaben</div>
                            </div>
                            <a href="https://immich-muhen.danfamily.uk" target="_blank" rel="noopener noreferrer" class="btn btn-primary fw-bold shadow-xs">
                                <i class="fas fa-external-link-alt me-1"></i> Zu Immich ↗
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            <!-- SEITENLEISTE: SYNCHRONISATION & WEBSITE-STATUS -->
            <div class="col-lg-4">
                <div class="card shadow-sm border-0 mb-3">
                    <div class="card-header bg-white border-bottom py-3">
                        <h6 class="mb-0 fw-bold text-dark">
                            <i class="fas fa-globe text-primary me-2"></i>Website-Galerie & Sync
                        </h6>
                    </div>
                    <div class="card-body p-3">
                        <p class="small text-muted mb-3">
                            Fotos werden im geschützten Mitgliederbereich (<a href="../sportschuetzen-website/frontend/intern.html" target="_blank">intern.html</a>) und auf der Homepage (<a href="../sportschuetzen-website/frontend/verein.html#galerie" target="_blank">verein.html</a>) dargestellt.
                        </p>
                        
                        <div class="list-group list-group-flush small mb-3">
                            <div class="list-group-item px-0 d-flex justify-content-between align-items-center">
                                <span>📱 Mitglieder-Upload</span>
                                <span class="badge bg-success-subtle text-success">Aktiviert</span>
                            </div>
                            <div class="list-group-item px-0 d-flex justify-content-between align-items-center">
                                <span>🔒 Geschützte Fotos</span>
                                <span class="badge bg-primary-subtle text-primary">Universal-SSO</span>
                            </div>
                            <div class="list-group-item px-0 d-flex justify-content-between align-items-center">
                                <span>⚡ Apple HEIC Support</span>
                                <span class="badge bg-light text-dark border">Client-seitig</span>
                            </div>
                        </div>

                        <div class="p-2.5 rounded border bg-light mb-3">
                            <div class="fw-bold small text-dark mb-1">Neues Album zur Website synchronisieren</div>
                            <div class="text-muted" style="font-size: 0.78rem;">
                                Um ein neues Immich-Album in <code>galerie.json</code> aufzunehmen, führe das Sync-Skript aus:
                            </div>
                            <code class="d-block p-1 mt-1 bg-white border rounded text-dark" style="font-size: 0.75rem; user-select: all;">
                                node sportschuetzen-website/sync-immich-album.js &lt;SHARE_URL&gt;
                            </code>
                        </div>

                        <div class="d-grid gap-2">
                            <a href="../sportschuetzen-website/frontend/intern.html" target="_blank" class="btn btn-outline-secondary btn-sm">
                                🔐 Mitgliederbereich öffnen ↗
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

    await loadImmichDashboardData();
}

async function loadImmichDashboardData() {
    const nodeInfo = document.getElementById('immich-node-info');
    const inboxInfo = document.getElementById('inbox-album-info');
    const liveBadge = document.getElementById('immich-live-badge');

    try {
        const res = await fetch('https://supabase-muhen.danfamily.uk/functions/v1/immich-upload');
        if (res.ok) {
            const data = await res.json();
            immichServerStatus = data;

            if (data.status === 'online') {
                if (nodeInfo) {
                    nodeInfo.innerHTML = `Verbunden mit <strong>Proxmox CT 116</strong> (<a href="https://immich-muhen.danfamily.uk" target="_blank" class="text-decoration-none">immich-muhen.danfamily.uk</a>)`;
                }
                if (inboxInfo) {
                    const count = data.album?.count || 0;
                    inboxInfo.innerHTML = `Aktuell <strong>${count} Fotos/Medien</strong> im Sammelalbum «${data.album?.name || 'Mitglieder-Uploads'}» vorhanden.`;
                }
                if (liveBadge) {
                    liveBadge.className = 'badge bg-success-subtle text-success border border-success-subtle px-3 py-2 fw-bold';
                    liveBadge.innerHTML = `<i class="fas fa-circle text-success me-1 small"></i> Verbunden (CT 116)`;
                }
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
    showToast('Prüfe Verbindung zu Immich Server...', 'info');
    await loadImmichDashboardData();
    showToast('Immich-Status erfolgreich aktualisiert.', 'success');
}
