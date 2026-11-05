/**
 * festkasse.js - Festkasse Cockpit im Vorstandsportal
 * Sportschützen Muhen
 * Bietet Schnellstart, PWA-Status, Z-Abschluss-Dokumentation & Anbindung
 */

function getFestkasseUrl() {
    if (window.location.protocol === 'file:') {
        return '../kasse/index.html';
    }
    return '/kasse/';
}

function renderFestkasseView() {
    const container = document.getElementById('view-festkasse');
    if (!container) return;

    const kasseUrl = getFestkasseUrl();

    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
            <div>
                <div class="d-flex align-items-center gap-2 mb-1">
                    <span class="badge bg-success text-white px-2.5 py-1 rounded-pill fw-bold" style="font-size: 0.75rem;">
                        <i class="fas fa-check-circle me-1"></i>PWA Offline-Ready
                    </span>
                    <span class="badge bg-light text-secondary border px-2.5 py-1 rounded-pill fw-bold" style="font-size: 0.75rem;">
                        WaiterOne Touch POS
                    </span>
                </div>
                <h2 class="mb-0 fw-bold">🛒 Festkasse (POS)</h2>
                <div class="text-muted small">Autarke Touch-Kasse für Schützenstube, Grill, Festzelte & Vereinsanlässe</div>
            </div>
            <div class="d-flex align-items-center gap-2 flex-wrap">
                <a href="${kasseUrl}" target="_blank" rel="noopener noreferrer" 
                   class="btn btn-success btn-sm fw-bold shadow-sm d-inline-flex align-items-center gap-2 px-3 py-2 rounded-pill"
                   style="background: linear-gradient(135deg, #10b981, #059669); border: none;">
                    <i class="fas fa-external-link-alt"></i> Festkasse jetzt starten ↗
                </a>
            </div>
        </div>

        <!-- 3 FEATURES KARTEN -->
        <div class="row g-3 mb-4">
            <div class="col-md-4">
                <div class="card p-3 shadow-sm border-0 h-100 rounded-4">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="rounded-circle bg-success bg-opacity-10 text-success d-flex align-items-center justify-content-center" style="width: 40px; height: 40px; font-size: 1.25rem;">
                            🛒
                        </div>
                        <h6 class="fw-bold mb-0 text-dark">WaiterOne Touch-POS</h6>
                    </div>
                    <p class="small text-muted mb-2">
                        Optimiert für iPad & Tablets im Schützenhaus oder Festzelt.
                    </p>
                    <ul class="small text-secondary ps-3 mb-0">
                        <li>Grosse Touch-Kacheln mit Warengruppen</li>
                        <li>Schweizer Notenrechner (10, 20, 50, 100, 200 CHF)</li>
                        <li>Rückgeld-Rechner & Twint-Unterstützung</li>
                    </ul>
                </div>
            </div>

            <div class="col-md-4">
                <div class="card p-3 shadow-sm border-0 h-100 rounded-4">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="rounded-circle bg-primary bg-opacity-10 text-primary d-flex align-items-center justify-content-center" style="width: 40px; height: 40px; font-size: 1.25rem;">
                            📊
                        </div>
                        <h6 class="fw-bold mb-0 text-dark">Kassensturz & Z-Bericht</h6>
                    </div>
                    <p class="small text-muted mb-2">
                        Revisionssicherer Tages- & Eventabschluss für den Kassier.
                    </p>
                    <ul class="small text-secondary ps-3 mb-0">
                        <li>Münz- & Noten-Zählprotokoll (5 Rp. bis 1000 Fr.)</li>
                        <li>SOLL/IST-Vergleich mit Diskrepanz-Anzeige</li>
                        <li>80mm Thermodruck-Quittung für Kassenbeleg</li>
                    </ul>
                </div>
            </div>

            <div class="col-md-4">
                <div class="card p-3 shadow-sm border-0 h-100 rounded-4">
                    <div class="d-flex align-items-center gap-2 mb-2">
                        <div class="rounded-circle bg-warning bg-opacity-10 text-warning d-flex align-items-center justify-content-center" style="width: 40px; height: 40px; font-size: 1.25rem;">
                            📱
                        </div>
                        <h6 class="fw-bold mb-0 text-dark">Handheld-Kellner (iPhone)</h6>
                    </div>
                    <p class="small text-muted mb-2">
                        Servicekräfte erfassen Tischbestellungen direkt am Smartphone.
                    </p>
                    <ul class="small text-secondary ps-3 mb-0">
                        <li>Drahtlose Tischübermittlung an die Hauptkasse</li>
                        <li>Keine App-Installation nötig (PWA Browser)</li>
                        <li>Bedienerwechsel im Header mit Zeitstempel</li>
                    </ul>
                </div>
            </div>
        </div>

        <!-- INFO-BANNER CLOUD-SYNC AUSBAU -->
        <div class="alert alert-info border-0 shadow-sm rounded-4 p-3 d-flex align-items-start gap-3 mb-4" style="background: rgba(14, 165, 233, 0.08);">
            <div style="font-size: 1.5rem; line-height: 1;">💡</div>
            <div class="small">
                <strong>Ausblick & geplante Supabase-Anbindung:</strong><br>
                Die Festkasse läuft heute zu 100% autark und lokal im Browser via IndexedDB (damit sie auch bei Strom- oder Netzausfall im Festzelt nicht stehen bleibt). Im nächsten Ausbauschritt wird ein 1-Klick-Upload integriert, der den fertigen Z-Kassenbericht automatisch als Kassenbuchung auf das <strong>Konto 1000 (Kasse)</strong> in die Finanzbuchhaltung schreibt und mit der Anlass-Nachkalkulation abgleicht.
            </div>
        </div>

        <!-- SCHNELLSTART & VORSCHAU CONTAINER -->
        <div class="card border-0 shadow-sm rounded-4 overflow-hidden">
            <div class="card-header bg-white py-3 px-4 border-bottom d-flex justify-content-between align-items-center">
                <div class="fw-bold text-dark">
                    <i class="fas fa-desktop me-2 text-primary"></i>Kassen-Arbeitsplatz & Vorschau
                </div>
                <div>
                    <a href="${kasseUrl}" target="_blank" rel="noopener noreferrer" class="btn btn-outline-primary btn-sm rounded-pill px-3 fw-semibold">
                        <i class="fas fa-up-right-and-down-left-from-center me-1"></i>Vollbild öffnen
                    </a>
                </div>
            </div>
            <div class="card-body p-0" style="background: #0b1120; height: 620px; position: relative;">
                <iframe src="${kasseUrl}" style="width: 100%; height: 100%; border: none;" title="Festkasse Vorschau"></iframe>
            </div>
        </div>
    `;
}

window.renderFestkasseView = renderFestkasseView;
