/**
 * ai-health.js
 * Zentrale KI-Modell-Verwaltung & Healthcheck-Diagnose
 * Sportschützen Muhen Vorstand-Cockpit
 * 
 * Synchronisiert mit:
 * - Cloudflare Worker (checkAndTestAiModels / Cron)
 * - Supabase PostgreSQL (system_app_configs -> ai_model_health, ai_primary_model)
 */

(function () {
    const WORKER_API_URL = "https://v1-vorstand-api.dan-hunziker73.workers.dev";
    const SUPABASE_REST_URL = "https://supabase-muhen.danfamily.uk/rest/v1";
    const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

    let _lastHealthReport = null;

    // 1. Health-Status aus Supabase laden (schnell, gecached)
    window.loadAiHealthStatus = async function () {
        try {
            const res = await fetch(`${SUPABASE_REST_URL}/system_app_configs?key=eq.ai_model_health&select=value,updated_at`, {
                headers: {
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
            });
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data) && data.length > 0 && data[0].value) {
                    _lastHealthReport = JSON.parse(data[0].value);
                    _lastHealthReport.updated_at = data[0].updated_at;
                    return _lastHealthReport;
                }
            }
        } catch (e) {
            console.warn("Konnte KI-Modellstatus aus Supabase nicht abrufen:", e);
        }
        return null;
    };

    // 2. Live-Prüfung aller KI-Modelle via Worker ausführen
    window.runAiModelCheck = async function () {
        const btn = document.getElementById("btn-run-ai-check");
        const statusContainer = document.getElementById("ai-health-status-body");
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>Teste Modelle...`;
        }
        if (statusContainer) {
            statusContainer.innerHTML = `
                <div class="text-center py-5">
                    <div class="spinner-border text-primary mb-3" role="status"></div>
                    <h6 class="text-muted">Google Gemini API wird abgefragt & Latenzen gemessen...</h6>
                    <p class="small text-muted mb-0">Jedes Modell wird mit einem Ping-Prompt getestet.</p>
                </div>
            `;
        }

        try {
            const res = await fetch(`${WORKER_API_URL}/?action=check_ai_models`, {
                method: "GET",
                headers: { "Accept": "application/json" }
            });

            if (!res.ok) {
                const errText = await res.text();
                throw new Error(`Worker Fehler (${res.status}): ${errText}`);
            }

            const data = await res.json();
            if (data.success && data.report) {
                _lastHealthReport = data.report;
                window.renderAiHealthReport(data.report);
                if (typeof showToast === 'function') {
                    showToast('KI-Healthcheck abgeschlossen! Alle Modelle wurden aktualisiert.', 'success');
                }
            } else {
                throw new Error(data.error || "Unbekannter Fehler bei der Modellprüfung");
            }
        } catch (err) {
            console.error("Fehler bei runAiModelCheck:", err);
            if (statusContainer) {
                statusContainer.innerHTML = `
                    <div class="alert alert-danger my-3">
                        <i class="fas fa-exclamation-triangle me-2"></i>
                        <strong>Prüfung fehlgeschlagen:</strong> ${err.message}
                    </div>
                `;
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-sync-alt me-1"></i>Modelle jetzt prüfen & testen`;
            }
        }
    };

    // 3. Health-Report im Modal rendern
    window.renderAiHealthReport = function (report) {
        const container = document.getElementById("ai-health-status-body");
        if (!container) return;

        if (!report) {
            container.innerHTML = `
                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>Es liegt noch kein aktueller Prüfbericht vor. Klicke unten auf <strong>«Modelle jetzt prüfen & testen»</strong>.
                </div>
            `;
            return;
        }

        const testedTime = report.tested_at ? new Date(report.tested_at).toLocaleString('de-CH') : 'Unbekannt';
        const primary = report.primary_model || 'gemini-3-flash-preview';
        const chain = Array.isArray(report.recommended_chain) ? report.recommended_chain : [];

        let rowsHtml = '';
        (report.models || []).forEach(m => {
            let badge = '';
            if (m.status === 'healthy') {
                badge = `<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Funktionsfähig</span>`;
            } else if (m.status === 'degraded') {
                badge = `<span class="badge bg-warning text-dark"><i class="fas fa-exclamation-circle me-1"></i>Hohe Nachfrage (503)</span>`;
            } else if (m.status === 'deprecated') {
                badge = `<span class="badge bg-danger"><i class="fas fa-ban me-1"></i>Eingestellt (404/410)</span>`;
            } else if (m.status === 'quota_exceeded') {
                badge = `<span class="badge bg-secondary"><i class="fas fa-clock me-1"></i>Quota Limit (429)</span>`;
            } else {
                badge = `<span class="badge bg-danger"><i class="fas fa-times me-1"></i>Fehler</span>`;
            }

            const isPrimary = (m.name === primary);
            const primaryBadge = isPrimary 
                ? `<span class="badge bg-primary ms-2"><i class="fas fa-star me-1"></i>Primär</span>` 
                : '';

            const latencyStr = m.latencyMs > 0 ? `${m.latencyMs} ms` : '-';
            const detailStr = m.error ? `<div class="small text-danger mt-1">${m.error}</div>` : '';

            rowsHtml += `
                <tr class="${isPrimary ? 'table-primary bg-opacity-10' : ''}">
                    <td class="fw-semibold">
                        <code>${m.name}</code> ${primaryBadge}
                        ${detailStr}
                    </td>
                    <td>${badge}</td>
                    <td class="text-end text-muted font-monospace">${latencyStr}</td>
                </tr>
            `;
        });

        const chainBadges = chain.map((c, i) => `
            <span class="badge bg-light text-dark border me-1 mb-1">
                <span class="text-primary fw-bold me-1">${i + 1}.</span>${c}
            </span>
        `).join('');

        container.innerHTML = `
            <div class="row g-3 mb-4">
                <div class="col-md-6">
                    <div class="card h-100 border-0 bg-light">
                        <div class="card-body p-3">
                            <div class="small text-muted fw-bold text-uppercase">Aktives Standard-Modell</div>
                            <h5 class="mb-1 text-primary fw-bold"><code>${primary}</code></h5>
                            <div class="small text-muted">Wird bevorzugt für alle KI-Module (News, Standblätter, Archiv) verwendet.</div>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card h-100 border-0 bg-light">
                        <div class="card-body p-3">
                            <div class="small text-muted fw-bold text-uppercase">Letzte Prüfung</div>
                            <h5 class="mb-1 fw-bold text-dark">${testedTime}</h5>
                            <div class="small text-muted">
                                <span class="text-success fw-bold">${report.healthy_count || 0}</span> von 
                                <span class="fw-bold">${report.tested_count || 0}</span> getesteten Modellen online.
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mb-4">
                <label class="form-label fw-bold small text-muted text-uppercase mb-1">Automatische Fallback-Kette (Ausfallsicherung)</label>
                <div class="p-2 border rounded bg-white d-flex flex-wrap align-items-center">
                    ${chainBadges}
                </div>
                <small class="text-muted">Falls ein Modell durch Google temporär überlastet (503) oder eingestellt wird, schaltet das System verzögerungsfrei auf das nächste Modell um.</small>
            </div>

            <div>
                <label class="form-label fw-bold small text-muted text-uppercase mb-2">Detail-Testergebnisse aller Google Gemini Modelle</label>
                <div class="table-responsive border rounded">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light small">
                            <tr>
                                <th>Modell</th>
                                <th>Status</th>
                                <th class="text-end">Antwortzeit</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${rowsHtml}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    };

    // 4. Modal öffnen
    window.openAiHealthModal = async function () {
        const modalEl = document.getElementById("modal-ai-health");
        if (!modalEl) return;

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();

        if (_lastHealthReport) {
            window.renderAiHealthReport(_lastHealthReport);
        } else {
            const report = await window.loadAiHealthStatus();
            window.renderAiHealthReport(report);
        }
    };

    // 5. Autonome Modell-Ermittlung & Fallback-Kette für Fachmodule
    window.getAiPrimaryModel = async function () {
        if (!_lastHealthReport) {
            await window.loadAiHealthStatus();
        }
        return (_lastHealthReport && _lastHealthReport.primary_model) ? _lastHealthReport.primary_model : 'gemini-3.5-flash';
    };

    window.getAiFallbackChain = async function () {
        if (!_lastHealthReport) {
            await window.loadAiHealthStatus();
        }
        if (_lastHealthReport && Array.isArray(_lastHealthReport.recommended_chain) && _lastHealthReport.recommended_chain.length > 0) {
            return _lastHealthReport.recommended_chain;
        }
        return ['gemini-3.5-flash', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];
    };

    // 6. Status-Badges im Portal synchronisieren (Sidebar & Header)
    window.updateAiStatusBadges = function (report) {
        const r = report || _lastHealthReport;
        const healthyCount = r ? (r.healthy_count || 0) : 0;
        const primaryModel = r ? (r.primary_model || 'Auto') : 'Auto';
        const isDegraded = r && healthyCount === 0;

        // Sidebar-Indikator
        const sidebarBadge = document.getElementById("sidebar-ai-indicator");
        if (sidebarBadge) {
            if (isDegraded) {
                sidebarBadge.className = "badge rounded-pill bg-danger-subtle text-danger border border-danger-subtle";
                sidebarBadge.innerHTML = `<i class="fas fa-exclamation-triangle fa-2xs me-1"></i>Offline`;
            } else if (r) {
                sidebarBadge.className = "badge rounded-pill bg-success-subtle text-success border border-success-subtle";
                sidebarBadge.innerHTML = `<i class="fas fa-circle fa-2xs me-1"></i>Online (${healthyCount})`;
            } else {
                sidebarBadge.className = "badge rounded-pill bg-secondary-subtle text-secondary border border-secondary-subtle";
                sidebarBadge.innerHTML = `<i class="fas fa-circle fa-2xs me-1"></i>Prüfe...`;
            }
        }

        // News Header Chip
        const headerChip = document.getElementById("news-header-ai-chip");
        if (headerChip) {
            if (isDegraded) {
                headerChip.className = "badge rounded-pill bg-warning-subtle text-warning border border-warning-subtle px-3 py-2";
                headerChip.innerHTML = `<i class="fas fa-triangle-exclamation me-1"></i>KI eingeschränkt`;
            } else {
                headerChip.className = "badge rounded-pill bg-success-subtle text-success border border-success-subtle px-3 py-2";
                headerChip.innerHTML = `<i class="fas fa-circle fa-2xs me-1"></i>KI betriebsbereit`;
            }
        }

        // News aktives Modell Label
        const activeModelSub = document.getElementById("news-active-model-sub");
        if (activeModelSub && primaryModel) {
            activeModelSub.textContent = `Aktiv: ${primaryModel} (${healthyCount} gesunde Modelle online)`;
        }
    };

    // Beim Laden des Skripts initial im Hintergrund Status abfragen
    document.addEventListener("DOMContentLoaded", () => {
        setTimeout(async () => {
            const report = await window.loadAiHealthStatus();
            window.updateAiStatusBadges(report);
        }, 1500);
    });
})();

