/**
 * festkasse.js - Festkasse Cockpit im Vorstandsportal
 * Sportschützen Muhen
 * Bietet Schnellstart, PWA-Status, Z-Abschluss-Dokumentation, Freigabesteuerung & TLS-Zertifikatsmonitoring
 */

let currentCertConfig = null;

function getFestkasseUrl() {
    if (window.location.protocol === 'file:') {
        return '../kasse/index.html';
    }
    return '/kasse/';
}

function getFestkasseClient() {
    return (typeof window.getSupabaseClient === 'function' ? window.getSupabaseClient() : null)
        || window.supabaseClient
        || window.sbClient
        || (typeof getClient === 'function' ? getClient() : null);
}

async function loadFestkasseVisibility() {
    const supa = getFestkasseClient();
    if (!supa) return;
    try {
        const { data } = await supa
            .from('system_app_configs')
            .select('value')
            .eq('key', 'member_festkasse_enabled')
            .maybeSingle();
        const isEnabled = data ? data.value === 'true' : false;
        updateFestkasseToggleUI(isEnabled);
    } catch (e) {
        console.warn('Fehler beim Laden der Festkassen-Sichtbarkeit:', e);
    }
}

function updateFestkasseToggleUI(enabled) {
    const toggle = document.getElementById('toggle-festkasse-visibility');
    const badge = document.getElementById('badge-festkasse-visibility');
    const desc = document.getElementById('festkasse-visibility-desc');
    if (toggle) toggle.checked = enabled;
    if (badge) {
        badge.className = `badge rounded-pill px-3 py-2 fw-bold ${enabled ? 'bg-success text-white' : 'bg-light text-secondary border'}`;
        badge.textContent = enabled ? '🟢 Für Mitglieder freigegeben' : '⚪ Für Mitglieder ausgeblendet';
    }
    if (desc) {
        desc.textContent = enabled 
            ? 'Aktiv: Der Button «🛒 Festkasse (POS)» ist im Mitgliederbereich (intern.html) für alle sichtbar.'
            : 'Inaktiv: Die Festkasse ist im Mitgliederbereich für normale Mitglieder ausgeblendet.';
    }
}

async function toggleFestkasseMemberVisibility(enabled) {
    const supa = getFestkasseClient();
    if (!supa) {
        if (window.UIConfirmKit && typeof window.UIConfirmKit.alert === 'function') {
            await UIConfirmKit.alert({
                title: 'Verbindungsfehler',
                message: 'Keine Verbindung zu Supabase verfügbar. Bitte lade die Seite neu.',
                type: 'danger'
            });
        } else {
            alert('Keine Verbindung zu Supabase verfügbar. Bitte lade die Seite neu.');
        }
        updateFestkasseToggleUI(!enabled);
        return;
    }
    try {
        const { error } = await supa
            .from('system_app_configs')
            .upsert({ 
                key: 'member_festkasse_enabled', 
                value: enabled ? 'true' : 'false', 
                description: 'Sichtbarkeit des Festkassen-Links (POS) im Mitgliederbereich (intern.html)',
                category: 'website' 
            }, { onConflict: 'key' });
        if (error) throw error;
        updateFestkasseToggleUI(enabled);
        if (typeof showToast === 'function') {
            showToast(enabled ? 'Festkasse für Mitglieder freigegeben!' : 'Festkasse für Mitglieder ausgeblendet.', 'success');
        }
    } catch (err) {
        console.error('Fehler:', err);
        updateFestkasseToggleUI(!enabled);
        if (typeof showToast === 'function') {
            showToast('Fehler beim Speichern: ' + (err.message || err), 'danger');
        }
    }
}

async function loadFestkasseCertStatus() {
    const supa = getFestkasseClient();
    const container = document.getElementById('festkasse-cert-status-area');
    if (!container) return;

    try {
        let certData = null;
        if (supa) {
            const { data } = await supa
                .from('system_app_configs')
                .select('value')
                .eq('key', 'festkasse_printer_cert')
                .maybeSingle();
            if (data && data.value) {
                certData = typeof data.value === 'string' ? JSON.parse(data.value) : data.value;
            }
        }

        if (!certData) {
            certData = {
                valid_to: '2027-11-12T19:04:10Z',
                issuer: 'CN=Sportschuetzen Muhen Root CA',
                printer_ip: '192.168.68.200'
            };
        }
        currentCertConfig = certData;

        const validTo = new Date(certData.valid_to);
        const now = new Date();
        const daysRemaining = Math.ceil((validTo.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        const formattedDate = (window.UIFormatKit && typeof window.UIFormatKit.formatDate === 'function')
            ? window.UIFormatKit.formatDate(certData.valid_to)
            : validTo.toLocaleDateString('de-CH');

        let badgeClass = 'bg-success text-white';
        let badgeIcon = 'fa-check-circle';
        let badgeText = `🟢 Gültig bis ${formattedDate} (noch ${daysRemaining} Tage)`;
        let alertHtml = '';

        if (daysRemaining <= 0) {
            badgeClass = 'bg-danger text-white';
            badgeIcon = 'fa-exclamation-triangle';
            badgeText = `🚨 Abgelaufen seit ${Math.abs(daysRemaining)} Tagen!`;
            alertHtml = `
                <div class="alert alert-danger border-0 rounded-3 p-3 mb-2 mt-2 d-flex align-items-center gap-3 small">
                    <i class="fas fa-exclamation-circle fs-4 text-danger"></i>
                    <div>
                        <strong>Achtung:</strong> Das TLS-Zertifikat für den Epson-Drucker ist abgelaufen. HTTPS-Druckaufträge von iPads werden blockiert! Bitte erneuere das Zertifikat umgehend über die Anleitung.
                    </div>
                </div>
            `;
        } else if (daysRemaining <= 30) {
            badgeClass = 'bg-warning text-dark';
            badgeIcon = 'fa-clock';
            badgeText = `⚠️ Läuft in ${daysRemaining} Tagen ab! (${formattedDate})`;
            alertHtml = `
                <div class="alert alert-warning border-0 rounded-3 p-3 mb-2 mt-2 d-flex align-items-center gap-3 small" style="background: rgba(245, 158, 11, 0.15);">
                    <i class="fas fa-triangle-exclamation fs-4 text-warning"></i>
                    <div>
                        <strong>Achtung:</strong> Das TLS-Zertifikat für den Epson-Drucker läuft in <strong>${daysRemaining} Tagen</strong> ab! Bitte erneuere es rechtzeitig vor dem nächsten Festanlass.
                    </div>
                </div>
            `;
        }

        container.innerHTML = `
            <div class="d-flex align-items-center justify-content-between flex-wrap gap-2 pt-1">
                <div class="d-flex align-items-center gap-2 flex-wrap">
                    <span class="badge rounded-pill px-3 py-2 fw-bold ${badgeClass}">
                        <i class="fas ${badgeIcon} me-1"></i>${badgeText}
                    </span>
                    <span class="badge bg-light text-secondary border rounded-pill px-2.5 py-1.5 small">
                        Drucker: ${certData.printer_ip || '192.168.68.200'}:443
                    </span>
                    <span class="badge bg-light text-secondary border rounded-pill px-2.5 py-1.5 small">
                        Root CA: 10 Jahre (bis 2036)
                    </span>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <button class="btn btn-outline-secondary btn-sm rounded-pill px-3" id="btn-check-printer-cert" onclick="checkPrinterCertLive()">
                        <i class="fas fa-sync-alt me-1"></i>Status prüfen
                    </button>
                    <button class="btn btn-outline-primary btn-sm rounded-pill px-3" onclick="openCertRenewalModal()">
                        <i class="fas fa-book-open me-1"></i>Anleitung Erneuerung
                    </button>
                </div>
            </div>
            ${alertHtml}
        `;
    } catch (e) {
        console.warn('Fehler beim Laden des Festkassen-Zertifikatstatus:', e);
    }
}

async function checkPrinterCertLive() {
    const btn = document.getElementById('btn-check-printer-cert');
    const runCheck = async () => {
        try {
            const resp = await fetch('https://supabase-muhen.danfamily.uk/functions/v1/pos-print', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M'
                },
                body: JSON.stringify({ type: 'check_cert', printerIp: '192.168.68.200', port: 443 })
            });
            const data = await resp.json();
            if (data && data.success) {
                const statusStr = data.isOnline ? 'ONLINE' : 'OFFLINE (Port 443 nicht erreichbar)';
                if (typeof showToast === 'function') {
                    showToast(`✓ Drucker ist ${statusStr}. Gültig: noch ${data.daysRemaining} Tage.`, 'success');
                }
                await loadFestkasseCertStatus();
            } else {
                throw new Error(data?.error || 'Prüfung fehlgeschlagen');
            }
        } catch (err) {
            console.error('Fehler bei Zertifikatsprüfung:', err);
            if (typeof showToast === 'function') {
                showToast('Fehler bei Prüfung: ' + (err.message || err), 'danger');
            }
        }
    };

    if (window.UIButtonKit && typeof window.UIButtonKit.withLoading === 'function' && btn) {
        await UIButtonKit.withLoading(btn, runCheck);
    } else {
        await runCheck();
    }
}

function openCertRenewalModal() {
    const modalId = 'modal-cert-renewal-guide';
    let modalEl = document.getElementById(modalId);
    if (!modalEl) {
        modalEl = document.createElement('div');
        modalEl.id = modalId;
        modalEl.className = 'modal fade';
        modalEl.setAttribute('tabindex', '-1');
        modalEl.setAttribute('aria-hidden', 'true');
        modalEl.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-lg">
                <div class="modal-content border-0 shadow-lg rounded-4 overflow-hidden">
                    <div class="modal-header text-white" style="background: linear-gradient(135deg, #0284c7, #0369a1);">
                        <div class="d-flex align-items-center gap-2">
                            <span class="fs-4">🔐</span>
                            <h5 class="modal-title fw-bold mb-0">Epson Bondrucker TLS-Zertifikat erneuern</h5>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <div class="modal-body p-4">
                        <div class="alert alert-info border-0 rounded-3 p-3 mb-4 d-flex align-items-start gap-3" style="background: rgba(2, 132, 199, 0.08);">
                            <span class="fs-4">💡</span>
                            <div class="small">
                                <strong>Wichtigste Erleichterung (Keine iPad-Reinstallation nötig):</strong><br>
                                Die Stammzertifizierungsstelle (<strong>Sportschützen Muhen Root CA</strong>) ist für 10 Jahre (bis November 2036) gültig und bereits auf allen Schützenhaus-Tablets installiert. Bei einer Erneuerung des Druckerzertifikats musst du auf den iPads/iPhones <strong>kein neues Profil installieren</strong> – die Tablets akzeptieren das neue Zertifikat sofort automatisch!
                            </div>
                        </div>

                        <h6 class="fw-bold text-dark mb-3">Schritt-für-Schritt-Ablauf (Dauer ca. 2 Minuten):</h6>

                        <div class="card p-3 border-0 rounded-3 mb-3" style="background: #f8fafc;">
                            <div class="d-flex align-items-center gap-2 fw-bold text-primary mb-2">
                                <span class="badge bg-primary text-white rounded-pill">Schritt 1</span>
                                <span>Neues Zertifikat auf CT 117 generieren</span>
                            </div>
                            <p class="small text-muted mb-2">
                                Öffne ein Terminal (PowerShell oder SSH) und führe das vorbereitete 1-Klick-Erneuerungsskript auf CT 117 aus:
                            </p>
                            <div class="bg-dark text-light p-2.5 rounded-3 font-monospace small mb-2 user-select-all" style="font-size: 0.85rem;">
                                ssh root@192.168.68.117 "/opt/muhen-ca/renew-printer-cert.sh"
                            </div>
                            <p class="small text-muted mb-0">
                                ➔ Dies verlängert das Zertifikat um 365 Tage und erzeugt die fertige Datei <code>/opt/muhen-ca/epson_printer.pfx</code>.
                            </p>
                        </div>

                        <div class="card p-3 border-0 rounded-3 mb-3" style="background: #f8fafc;">
                            <div class="d-flex align-items-center gap-2 fw-bold text-success mb-2">
                                <span class="badge bg-success text-white rounded-pill">Schritt 2</span>
                                <span>Zertifikat auf den Epson-Drucker hochladen</span>
                            </div>
                            <ol class="small text-secondary ps-3 mb-0" style="line-height: 1.6;">
                                <li>Lade die Datei <code>epson_printer.pfx</code> von CT 117 auf deinen PC herunter:<br>
                                    <code class="bg-white px-2 py-1 rounded border user-select-all">scp root@192.168.68.117:/opt/muhen-ca/epson_printer.pfx ~/Downloads/</code>
                                </li>
                                <li>Öffne das Epson-Webinterface im Browser: <a href="https://192.168.68.200" target="_blank" class="fw-bold text-decoration-none">https://192.168.68.200 ↗</a></li>
                                <li>Klicke im linken Menü unter <strong>Authentication</strong> auf <strong>«Certificate Import»</strong>.</li>
                                <li>Wähle <strong>«Password Protected PKCS#12 Certificate»</strong>, wähle die Datei <code>epson_printer.pfx</code> aus und gib als Passwort <code>epson</code> ein. Klicke auf <strong>«Import»</strong>.</li>
                                <li>Klicke im linken Menü unter <strong>Security</strong> auf <strong>«SSL/TLS»</strong> und stelle sicher, dass <strong>Server Certificate</strong> auf <strong>«CA-Signed Certificate 1»</strong> steht. Klicke auf <strong>«Send»</strong>.</li>
                                <li>Klicke im Menü unter <strong>Optional</strong> auf <strong>«Reset»</strong> (oder schalte den Drucker kurz am Netzschalter aus und wieder ein).</li>
                            </ol>
                        </div>

                        <div class="card p-3 border-0 rounded-3 mb-0" style="background: #f8fafc;">
                            <div class="d-flex align-items-center gap-2 fw-bold text-info mb-2">
                                <span class="badge bg-info text-white rounded-pill">Schritt 3</span>
                                <span>Verifikation</span>
                            </div>
                            <p class="small text-muted mb-0">
                                Klicke hier im Vorstandsportal auf <strong>«Status prüfen»</strong> oder teste in der Festkasse einen Testbon. Der Drucker druckt sofort wieder über 100% autarkes HTTPS ePOS!
                            </p>
                        </div>
                    </div>
                    <div class="modal-footer bg-light py-2 px-4">
                        <button type="button" class="btn btn-secondary btn-sm rounded-pill px-4" data-bs-dismiss="modal">Verstanden &amp; Schliessen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
    }
    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
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

        <!-- FREIGABE IM MITGLIEDERBEREICH BANNER -->
        <div class="card p-3 shadow-sm border-0 rounded-4 mb-3" style="background: white;">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
                <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; font-size: 1.3rem; background: rgba(16, 185, 129, 0.1); color: #10b981;">
                        🌐
                    </div>
                    <div>
                        <div class="fw-bold text-dark">Freigabe im Mitgliederbereich (Website intern.html)</div>
                        <div class="small text-muted" id="festkasse-visibility-desc">
                            Steuere, ob der Button «🛒 Festkasse (POS)» für Mitglieder auf der Website sichtbar ist.
                        </div>
                    </div>
                </div>
                <div class="d-flex align-items-center gap-2">
                    <div class="form-check form-switch fs-5 mb-0">
                        <input class="form-check-input" type="checkbox" role="switch" id="toggle-festkasse-visibility" onchange="toggleFestkasseMemberVisibility(this.checked)">
                    </div>
                    <span class="badge rounded-pill px-3 py-2 fw-bold bg-light text-secondary border" id="badge-festkasse-visibility" style="font-size: 0.85rem;">
                        Wird geladen...
                    </span>
                </div>
            </div>
        </div>

        <!-- DRUCKER-ZERTIFIKAT & EPOS-SICHERHEIT BANNER -->
        <div class="card p-3 shadow-sm border-0 rounded-4 mb-4" style="background: white;" id="card-festkasse-cert">
            <div class="d-flex justify-content-between align-items-center flex-wrap gap-3 mb-2">
                <div class="d-flex align-items-center gap-3">
                    <div class="rounded-circle d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; font-size: 1.3rem; background: rgba(2, 132, 199, 0.1); color: #0284c7;">
                        🔐
                    </div>
                    <div>
                        <div class="fw-bold text-dark">Epson Bondrucker TLS-Zertifikat (ePOS-Print HTTPS)</div>
                        <div class="small text-muted">
                            Status der internen Stammzertifikatskette für autarken Direktdruck ohne Cloud-Abhängigkeit.
                        </div>
                    </div>
                </div>
            </div>
            <div id="festkasse-cert-status-area">
                <div class="text-muted small">Zertifikatsstatus wird geladen...</div>
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

    setTimeout(() => {
        loadFestkasseVisibility();
        loadFestkasseCertStatus();
    }, 50);
}

window.renderFestkasseView = renderFestkasseView;
window.toggleFestkasseMemberVisibility = toggleFestkasseMemberVisibility;
window.loadFestkasseVisibility = loadFestkasseVisibility;
window.loadFestkasseCertStatus = loadFestkasseCertStatus;
window.checkPrinterCertLive = checkPrinterCertLive;
window.openCertRenewalModal = openCertRenewalModal;
