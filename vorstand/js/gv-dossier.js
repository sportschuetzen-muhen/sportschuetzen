/**
 * gv-dossier.js
 * ==============================================================================
 * GV-Schaltzentrale & Kampagnen-Workspace (2-Spalten-Layout)
 * Projekt: Vereinsportal Sportschützen Muhen
 *
 * Implementiert gemäss Spezifikation (Abschnitt 8):
 * - Linke Spalte: Konfiguration & Redaktion
 *   • Beilagen-Uploader (PDF-Uploads für Berichte/Protokolle nach 'campaign-assets')
 *   • Sortierbare Beilagen-Liste via SortableJS (Assembler-Reihenfolge)
 *   • Traktanden-Manager & Jahresprogramm-Schalter
 *   • E-Mail-Editor mit Platzhalter-Chips
 *   • Button: "Gesamtes GV-Dossier jetzt kompilieren & stempeln"
 * - Rechte Spalte: Live-Monitor
 *   • Umschaltbar zwischen [ ✉️ E-Mail-Vorschau ] und [ 📄 PDF-Vorschau ]
 *   • Live-Empfängerauswahl ("Vorschau für: Hans Muster ▼")
 *   • Sandboxed <iframe> PDF-Viewer
 * - Sicherheits- & Kontroll-Features:
 *   • "Test-Mail an mich senden"
 *   • Idempotenter Massenversand via mail-engine.js mit Fortschrittsbalken
 * ==============================================================================
 */

(function () {
    window._gvDossierState = {
        year: new Date().getFullYear(),
        campaign: null,
        attachments: [],
        gvInstance: null,
        traktanden: [],
        members: [],
        selectedMemberId: null,
        activeLeftTab: 'beilagen',   // 'beilagen' | 'mail' | 'traktanden'
        activeRightTab: 'preview-pdf', // 'preview-mail' | 'preview-pdf'
        compiledPdfUrl: null,
        compiledPdfBase64: null,
        isCompiling: false,
        isSending: false
    };

    function getSupabase() {
        return (typeof window.getSupabaseClient === 'function')
            ? window.getSupabaseClient()
            : (window.supabaseClient || null);
    }

    /**
     * Haupt-Einstiegspunkt für das Rendern der GV-Schaltzentrale
     */
    window.renderGVDossierView = async function (targetContainer) {
        const container = (typeof targetContainer === 'string' ? document.querySelector(targetContainer) : targetContainer)
            || document.getElementById('gv-dossier-workspace-inner')
            || document.getElementById('gv-dossier-container');
        if (!container) return;

        container.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary mb-3" role="status" style="width: 2.5rem; height: 2.5rem;"></div>
                <div class="fw-bold text-muted">Lade GV-Schaltzentrale & Kampagnen-Daten aus Supabase...</div>
            </div>
        `;

        await loadGVDossierData();
        renderGVDossierWorkspace(container);
    };

    /**
     * Daten laden oder initiale Kampagne für das Jahr anlegen
     */
    async function loadGVDossierData() {
        const supa = getSupabase();
        if (!supa) {
            console.error("❌ Kein Supabase Client verfügbar.");
            return;
        }

        const state = window._gvDossierState;
        const curYear = state.year;

        try {
            // 1. Mitglieder laden (für Vorschau & Test-Empfänger)
            if (!state.members.length) {
                const { data: mData } = await supa
                    .from('members')
                    .select('id, person_number, first_name, last_name, street, post_code, city, primary_email')
                    .eq('is_active', true)
                    .order('last_name', { ascending: true });
                state.members = mData || [];
                if (state.members.length && !state.selectedMemberId) {
                    state.selectedMemberId = state.members[0].id;
                }
            }

            // 2. GV-Stammdaten aus gv_instances laden
            const { data: gvData } = await supa
                .from('gv_instances')
                .select('*')
                .eq('year', curYear)
                .maybeSingle();

            state.gvInstance = gvData || {
                year: curYear,
                number: 100,
                datum: `${curYear}-03-20`,
                zeit: '19:30',
                ort: 'Schützenhaus Muhen',
                doc_einladung_url: null,
                doc_anhaenge_url: null
            };

            // 3. Kampagne aus communication_campaigns suchen oder erstellen
            let { data: campData } = await supa
                .from('communication_campaigns')
                .select('*')
                .eq('season_year', curYear)
                .eq('campaign_type', 'gv')
                .maybeSingle();

            if (!campData) {
                // Initialen Kampagnen-Datensatz erzeugen
                const defaultBody = "Liebe Schützinnen, liebe Schützen, geschätzte Ehrenmitglieder\n\n" +
                    "Wir laden euch herzlich zu unserer ordentlichen Generalversammlung ein.\n" +
                    "Alle relevanten Berichte und Unterlagen findet ihr im beiliegenden Gesamtdossier sowie in der Web-App.\n\n" +
                    "Wir freuen uns über eure zahlreiche Teilnahme und das kameradschaftliche Beisammensein.\n\n" +
                    "Mit sportlichen Grüssen\nSportschützen Muhen";

                const { data: newCamp, error: createErr } = await supa
                    .from('communication_campaigns')
                    .insert({
                        title: `${state.gvInstance.number || 100}. Generalversammlung ${curYear}`,
                        campaign_type: 'gv',
                        season_year: curYear,
                        status: 'draft',
                        send_mode: 'email_and_print',
                        email_subject: `Einladung zur ${state.gvInstance.number || 100}. Generalversammlung ${curYear}`,
                        email_body: defaultBody,
                        custom_settings: { include_calendar: true }
                    })
                    .select()
                    .single();

                if (!createErr && newCamp) {
                    campData = newCamp;
                }
            }

            state.campaign = campData;

            // 4. Beilagen zur Kampagne laden
            if (state.campaign?.id) {
                const { data: attData } = await supa
                    .from('campaign_attachments')
                    .select('*')
                    .eq('campaign_id', state.campaign.id)
                    .order('sort_order', { ascending: true });
                state.attachments = attData || [];
                state.compiledPdfUrl = state.campaign.dossier_pdf_url || state.gvInstance?.doc_anhaenge_url || null;
            }

            // 5. Traktanden aus document_template_clauses laden
            const { data: tplData } = await supa
                .from('document_templates')
                .select('id')
                .eq('category', 'gv')
                .limit(1)
                .maybeSingle();

            if (tplData?.id) {
                const { data: clData } = await supa
                    .from('document_template_clauses')
                    .select('*')
                    .eq('template_id', tplData.id)
                    .order('sort_order', { ascending: true });
                state.traktanden = clData || [];
            }

        } catch (err) {
            console.error("❌ Fehler beim Laden der GV-Dossier Daten:", err);
            if (typeof showError === 'function') showError("Fehler beim Laden: " + err.message);
        }
    }

    /**
     * Baut den 2-Spalten-Arbeitsbereich im DOM auf
     */
    function renderGVDossierWorkspace(targetContainer) {
        const container = (typeof targetContainer === 'string' ? document.querySelector(targetContainer) : targetContainer)
            || document.getElementById('gv-dossier-workspace-inner')
            || document.getElementById('gv-dossier-container');
        if (!container) return;

        const state = window._gvDossierState;
        const curYear = state.year;
        const camp = state.campaign || {};
        const gv = state.gvInstance || {};

        const statusBadges = {
            'draft': '<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle"><i class="fas fa-pencil-alt me-1"></i> In Vorbereitung (Entwurf)</span>',
            'ready': '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="fas fa-check-circle me-1"></i> Dossier kompiliert & versandbereit</span>',
            'processing': '<span class="badge bg-primary-subtle text-primary border border-primary-subtle"><i class="fas fa-spinner fa-spin me-1"></i> Versand läuft...</span>',
            'completed': '<span class="badge bg-info-subtle text-info border border-info-subtle"><i class="fas fa-paper-plane me-1"></i> Versand abgeschlossen</span>'
        };

        const activeStatusBadge = statusBadges[camp.status || 'draft'] || statusBadges['draft'];

        container.innerHTML = `
            <!-- WORKSPACE HEADER -->
            <div class="card border-0 shadow-sm rounded-4 p-3 mb-3 bg-white">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div class="d-flex align-items-center gap-3">
                        <div class="rounded-3 bg-primary text-white d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; font-size: 1.25rem;">
                            <i class="fas fa-book-open"></i>
                        </div>
                        <div>
                            <h4 class="mb-0 fw-bold text-dark d-flex align-items-center gap-2">
                                <span>GV-Schaltzentrale & Dossier-Compiler</span>
                                <span class="badge bg-primary rounded-pill fs-6 px-2.5">${curYear}</span>
                            </h4>
                            <div class="d-flex align-items-center gap-2 mt-1">
                                <span class="small text-muted"><i class="fas fa-bullhorn me-1"></i> ${escapeHtml(camp.title || `Generalversammlung ${curYear}`)}</span>
                                <span class="text-muted">·</span>
                                ${activeStatusBadge}
                            </div>
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2">
                        <button class="btn btn-sm btn-outline-secondary rounded-3" onclick="gvDossierReload()" title="Aktualisieren">
                            <i class="fas fa-sync-alt me-1"></i> Aktualisieren
                        </button>
                        <button class="btn btn-sm btn-outline-primary rounded-3" onclick="gvDossierOpenSettingsModal()">
                            <i class="fas fa-cog me-1"></i> GV-Rahmendaten
                        </button>
                    </div>
                </div>
            </div>

            <!-- 2-SPALTEN-ARBEITSBEREICH -->
            <div class="row g-3">
                <!-- LINKE SPALTE: REDAKTION & DOSSIER-ASSEMBLER -->
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm rounded-4 h-100 bg-white">
                        <!-- TAB-NAVIGATION LINKS -->
                        <div class="card-header bg-white border-bottom pt-3 pb-0 px-3">
                            <ul class="nav nav-tabs border-0" id="gvLeftTabs" role="tablist">
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'beilagen' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('beilagen')">
                                        <i class="fas fa-layer-group me-1.5"></i> Dossier-Beilagen (${state.attachments.length + 2})
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'mail' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('mail')">
                                        <i class="fas fa-envelope me-1.5"></i> E-Mail-Text & Kampagne
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'traktanden' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('traktanden')">
                                        <i class="fas fa-list-ol me-1.5"></i> Traktanden-Manager
                                    </button>
                                </li>
                            </ul>
                        </div>

                        <!-- TAB-INHALTE LINKS -->
                        <div class="card-body p-3" id="gvLeftTabContent">
                            <!-- Inhalt wird dynamisch gerendert -->
                        </div>
                    </div>
                </div>

                <!-- RECHTE SPALTE: LIVE-MONITOR (E-MAIL & PDF VORSCHAU) -->
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm rounded-4 h-100 bg-white">
                        <!-- HEADER RECHTE SPALTE: LIVE-MONITOR -->
                        <div class="card-header bg-white border-bottom p-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <div class="d-flex align-items-center gap-2">
                                <div class="btn-group btn-group-sm" role="group">
                                    <button type="button" class="btn ${state.activeRightTab === 'preview-pdf' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="gvDossierSetRightTab('preview-pdf')">
                                        <i class="fas fa-file-pdf me-1"></i> PDF-Vorschau
                                    </button>
                                    <button type="button" class="btn ${state.activeRightTab === 'preview-mail' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="gvDossierSetRightTab('preview-mail')">
                                        <i class="fas fa-desktop me-1"></i> E-Mail-Vorschau
                                    </button>
                                </div>
                            </div>
                            <!-- LIVE EMPFÄNGERAUSWAHL -->
                            <div class="d-flex align-items-center gap-1.5">
                                <label class="small text-muted fw-semibold mb-0" style="white-space:nowrap;">Vorschau für:</label>
                                <select class="form-select form-select-sm" style="max-width: 220px;" onchange="gvDossierSelectMember(this.value)">
                                    ${state.members.map(m => `
                                        <option value="${m.id}" ${m.id === state.selectedMemberId ? 'selected' : ''}>
                                            ${escapeHtml(m.last_name)} ${escapeHtml(m.first_name)}
                                        </option>
                                    `).join('')}
                                </select>
                            </div>
                        </div>

                        <!-- INHALT RECHTE SPALTE -->
                        <div class="card-body p-0 position-relative" id="gvRightTabContent" style="min-height: 580px;">
                            <!-- PDF oder Mail-Preview -->
                        </div>

                        <!-- FOOTER RECHTE SPALTE: SICHERHEITS- & VERSAND-CONTROLS -->
                        <div class="card-footer bg-light border-top p-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                            <button class="btn btn-sm btn-outline-primary fw-semibold rounded-3" onclick="gvDossierSendTestMail()">
                                <i class="fas fa-paper-plane me-1.5"></i> Test-Mail an mich senden
                            </button>
                            <div class="d-flex align-items-center gap-2">
                                <button class="btn btn-sm btn-success fw-bold px-3 py-1.5 rounded-3 shadow-sm" onclick="gvDossierStartCampaignDispatch()" ${state.isSending ? 'disabled' : ''}>
                                    <i class="fas fa-mail-bulk me-1.5"></i> Freigabe & Massenversand
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        renderLeftPanel();
        renderRightPanel();
    }

    /**
     * Rendert das aktive linke Panel (Beilagen, Mail-Text oder Traktanden)
     */
    function renderLeftPanel() {
        const panel = document.getElementById('gvLeftTabContent');
        if (!panel) return;

        const state = window._gvDossierState;

        if (state.activeLeftTab === 'beilagen') {
            const hasCompiled = Boolean(state.compiledPdfUrl);
            panel.innerHTML = `
                <!-- INFOBOX -->
                <div class="alert alert-info py-2.5 px-3 border-0 rounded-3 mb-3 d-flex align-items-start gap-2" style="background:#eef6ff; font-size:0.85rem;">
                    <i class="fas fa-info-circle text-primary mt-1"></i>
                    <div>
                        <strong>GV-Dossier Compiler:</strong> Fügen Sie die Jahresberichte und Protokolle als PDF hinzu.
                        Beim Kompilieren assembliert die Engine Einladung, Jahresprogramm und alle Berichte zu einem Gesamt-Dossier mit fortlaufenden Seitenzahlen.
                    </div>
                </div>

                <!-- DRAG & DROP UPLOAD BOX -->
                <div class="border border-2 border-dashed rounded-3 p-3 text-center mb-3 bg-light" 
                     id="gvDossierDropzone"
                     style="cursor: pointer; transition: all 0.2s;"
                     onclick="document.getElementById('gvAttachmentFileInput').click()">
                    <i class="fas fa-cloud-upload-alt text-primary fs-3 mb-1"></i>
                    <div class="fw-bold small text-dark">PDF-Berichte hier ablegen oder klicken zum Auswählen</div>
                    <div class="text-muted" style="font-size:0.75rem;">(z. B. Jahresbericht Präsident, Protokoll, Revisorenbericht – max. 50 MB)</div>
                    <input type="file" id="gvAttachmentFileInput" class="d-none" accept="application/pdf" multiple onchange="gvDossierHandleFileUpload(this.files)">
                </div>

                <!-- LISTE DER DOKUMENTE IM DOSSIER (SORTIERBAR) -->
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold text-muted text-uppercase" style="letter-spacing:0.5px;">Reihenfolge im Dossier-Heftli:</span>
                    <span class="small text-muted"><i class="fas fa-arrows-alt me-1"></i> Drag & Drop zum Sortieren</span>
                </div>

                <div class="list-group rounded-3 shadow-none mb-3" id="gvAttachmentsSortableList">
                    <!-- 1. DYNAMISCHE BASIS-DOKUMENTE -->
                    <div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between p-2.5 bg-light border">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary text-white rounded-pill">1</span>
                            <i class="fas fa-file-invoice text-primary"></i>
                            <div>
                                <div class="fw-bold small mb-0">Einladung & Traktandenliste</div>
                                <div class="text-muted" style="font-size:0.75rem;">Seite 1 (Dynamisch aus Supabase)</div>
                            </div>
                        </div>
                        <span class="badge bg-secondary-subtle text-secondary small">Fix</span>
                    </div>

                    <div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between p-2.5 bg-light border">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-primary text-white rounded-pill">2</span>
                            <i class="fas fa-calendar-alt text-success"></i>
                            <div>
                                <div class="fw-bold small mb-0">Jahresprogramm ${state.year} (Beilage)</div>
                                <div class="text-muted" style="font-size:0.75rem;">Seite 2ff (Dynamisch aus Vereinskalender)</div>
                            </div>
                        </div>
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input" type="checkbox" id="gvToggleCalendar" ${state.campaign?.custom_settings?.include_calendar !== false ? 'checked' : ''} onchange="gvDossierToggleCalendar(this.checked)">
                        </div>
                    </div>

                    <!-- 2. HOCHGELADENE BEILAGEN AUS campaign_attachments -->
                    ${state.attachments.map((att, idx) => `
                        <div class="list-group-item list-group-item-action d-flex align-items-center justify-content-between p-2.5 border gv-sortable-item" data-att-id="${att.id}">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-secondary text-white rounded-pill">${idx + 3}</span>
                                <i class="fas fa-grip-vertical text-muted me-1" style="cursor:grab;"></i>
                                <i class="fas fa-file-pdf text-danger"></i>
                                <div>
                                    <div class="fw-bold small mb-0">${escapeHtml(att.title)}</div>
                                    <div class="text-muted" style="font-size:0.75rem;">
                                        ${att.page_count ? `${att.page_count} Seite(n)` : 'PDF'} 
                                        · Status: <span class="badge ${att.status === 'compiled' ? 'bg-success' : 'bg-secondary'} py-0 px-1" style="font-size:0.65rem;">${att.status || 'uploaded'}</span>
                                    </div>
                                </div>
                            </div>
                            <div class="d-flex align-items-center gap-1">
                                ${att.file_url ? `
                                    <a href="${att.file_url}" target="_blank" class="btn btn-xs btn-outline-secondary p-1" title="Öffnen">
                                        <i class="fas fa-external-link-alt"></i>
                                    </a>
                                ` : ''}
                                <button class="btn btn-xs btn-outline-danger p-1" onclick="gvDossierDeleteAttachment('${att.id}')" title="Entfernen">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- KOMPILIEREN-BUTTON -->
                <div class="d-grid gap-2">
                    <button class="btn btn-primary py-2.5 fw-bold shadow-sm rounded-3" onclick="gvDossierCompileNow()" ${state.isCompiling ? 'disabled' : ''}>
                        ${state.isCompiling ? `
                            <span class="spinner-border spinner-border-sm me-1.5" role="status"></span>
                            Assembler & Corporate Stempel laufen...
                        ` : `
                            <i class="fas fa-stamp me-1.5"></i> Gesamtes GV-Dossier jetzt kompilieren & stempeln
                        `}
                    </button>
                    ${hasCompiled ? `
                        <div class="text-center small mt-1">
                            <span class="text-success fw-semibold"><i class="fas fa-check-circle me-1"></i> Aktuelles Master-Dossier verfügbar:</span>
                            <a href="${state.compiledPdfUrl}" target="_blank" class="fw-bold text-decoration-none ms-1">
                                <i class="fas fa-file-download me-0.5"></i> PDF herunterladen
                            </a>
                        </div>
                    ` : ''}
                </div>
            `;

            initSortableAttachments();

        } else if (state.activeLeftTab === 'mail') {
            const camp = state.campaign || {};
            panel.innerHTML = `
                <!-- E-MAIL KONFIGURATION -->
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">E-Mail-Betreff</label>
                    <input type="text" class="form-control form-control-sm fw-semibold" id="gv-camp-subj" value="${escapeHtml(camp.email_subject || '')}" oninput="gvDossierLiveUpdateMailText()">
                </div>

                <div class="mb-2">
                    <div class="d-flex justify-content-between align-items-center mb-1">
                        <label class="form-label small fw-bold text-muted mb-0">E-Mail-Anschreiben</label>
                        <div class="btn-group btn-group-sm">
                            <button class="btn btn-xs btn-outline-secondary py-0" onclick="gvDossierInsertVariable('{{mitglied.vorname}}')">+ Vorname</button>
                            <button class="btn btn-xs btn-outline-secondary py-0" onclick="gvDossierInsertVariable('{{mitglied.nachname}}')">+ Nachname</button>
                            <button class="btn btn-xs btn-outline-secondary py-0" onclick="gvDossierInsertVariable('{{event.datum_formatiert}}')">+ Datum</button>
                            <button class="btn btn-xs btn-outline-secondary py-0" onclick="gvDossierInsertVariable('{{dossier.download_url}}')">+ Download-Link</button>
                        </div>
                    </div>
                    <textarea class="form-control form-control-sm" id="gv-camp-body" rows="9" oninput="gvDossierLiveUpdateMailText()">${escapeHtml(camp.email_body || '')}</textarea>
                    <div class="form-text small text-muted">
                        Platzhalter wie <code>{{mitglied.vorname}}</code> werden beim Versand und in der Live-Vorschau dynamisch ersetzt.
                    </div>
                </div>

                <!-- ANHÄNGE-STRATEGIE (BOUNCE-SCHUTZ) -->
                <div class="card border rounded-3 p-3 bg-light mb-3">
                    <div class="fw-bold small text-dark mb-1"><i class="fas fa-shield-alt text-success me-1"></i> Versand- & Anhangstrategie:</div>
                    <div class="form-check form-switch mb-1">
                        <input class="form-check-input" type="checkbox" id="gvAttachLightPdf" checked>
                        <label class="form-check-label small" for="gvAttachLightPdf">
                            <strong>Schlankes Einladungs-PDF (&lt; 1 MB)</strong> direkt als E-Mail-Anhang mitsenden
                        </label>
                    </div>
                    <div class="form-check form-switch">
                        <input class="form-check-input" type="checkbox" id="gvEmbedDossierLink" checked>
                        <label class="form-check-label small" for="gvEmbedDossierLink">
                            <strong>Direkten Download-Link</strong> auf das schwere Gesamtdossier im Mail-Body einbinden
                        </label>
                    </div>
                </div>

                <button class="btn btn-outline-primary btn-sm w-100 fw-semibold rounded-3" onclick="gvDossierSaveCampaignText()">
                    <i class="fas fa-save me-1.5"></i> Textänderungen speichern
                </button>
            `;

            if (window.ClubWysiwyg) {
                window.ClubWysiwyg.init('#gv-camp-body', {
                    mode: 'email',
                    minHeight: '220px',
                    enableBanners: true,
                    enableButtons: true,
                    placeholders: [
                        { tag: 'mitglied.anrede', label: 'Anrede (Lieber Hans / Sehr geehrter Herr)' },
                        { tag: 'mitglied.vorname', label: 'Vorname' },
                        { tag: 'mitglied.nachname', label: 'Nachname' },
                        { tag: 'event.datum_formatiert', label: 'Datum der GV' },
                        { tag: 'dossier.download_url', label: 'Download-Link Master-Dossier' }
                    ],
                    onChange: () => gvDossierLiveUpdateMailText()
                });
            }

        } else if (state.activeLeftTab === 'traktanden') {
            panel.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold text-muted text-uppercase">Traktandenliste (Seite 1):</span>
                    <button class="btn btn-xs btn-primary py-1 px-2 rounded-2" onclick="gvDossierAddTraktandumModal()">
                        <i class="fas fa-plus me-1"></i> Traktandum hinzufügen
                    </button>
                </div>
                <div class="list-group rounded-3 shadow-none mb-3">
                    ${state.traktanden.map((t, idx) => `
                        <div class="list-group-item p-2 d-flex align-items-center justify-content-between border">
                            <div class="d-flex align-items-center gap-2">
                                <span class="badge bg-secondary text-white rounded-pill">${t.clause_number || idx + 1}</span>
                                <div>
                                    <div class="fw-bold small mb-0">${escapeHtml(t.clause_title)}</div>
                                    ${t.clause_text ? `<div class="text-muted" style="font-size:0.75rem;">${escapeHtml(t.clause_text)}</div>` : ''}
                                </div>
                            </div>
                            <span class="badge bg-success-subtle text-success py-1 px-1.5">Aktiv</span>
                        </div>
                    `).join('')}
                </div>
                <div class="small text-muted">
                    <i class="fas fa-link me-1"></i> Synchronisiert mit dem zentralen <a href="javascript:void(0)" onclick="navTo('dokument-vorlagen')">Vorlagen-Pool</a>.
                </div>
            `;
        }
    }

    /**
     * Rendert das aktive rechte Panel (Live E-Mail oder PDF-Vorschau)
     */
    function renderRightPanel() {
        const panel = document.getElementById('gvRightTabContent');
        if (!panel) return;

        const state = window._gvDossierState;
        const curMember = state.members.find(m => m.id === state.selectedMemberId) || state.members[0] || {};

        if (state.activeRightTab === 'preview-pdf') {
            // PDF Vorschau via iframe
            const pdfUrl = state.compiledPdfUrl;
            if (pdfUrl) {
                panel.innerHTML = `
                    <iframe src="${pdfUrl}#toolbar=0&navpanes=0" class="w-100 h-100 border-0 rounded-bottom-4" style="min-height: 580px;"></iframe>
                `;
            } else {
                panel.innerHTML = `
                    <div class="d-flex flex-column align-items-center justify-content-center h-100 text-center p-5 text-muted">
                        <i class="fas fa-file-pdf fa-3x text-secondary mb-3 opacity-50"></i>
                        <h6 class="fw-bold text-dark">Noch kein kompiliertes Dossier vorhanden</h6>
                        <p class="small text-muted mb-3" style="max-width: 320px;">
                            Klicken Sie links auf <strong>„Gesamtes GV-Dossier jetzt kompilieren“</strong>, um die Einladung mit allen Berichten zu einem gestempelten Gesamt-PDF zusammenzuführen.
                        </p>
                        <button class="btn btn-outline-primary btn-sm rounded-3 fw-semibold" onclick="gvDossierCompileNow()">
                            <i class="fas fa-stamp me-1"></i> Jetzt erstmals kompilieren
                        </button>
                    </div>
                `;
            }
        } else {
            // Live E-Mail Vorschau
            const subj = (document.getElementById('gv-camp-subj')?.value || state.campaign?.email_subject || 'Einladung GV')
                .replace(/{{mitglied\.vorname}}/gi, curMember.first_name || 'Vorname')
                .replace(/{{mitglied\.nachname}}/gi, curMember.last_name || 'Nachname');

            let rawBody = (document.getElementById('gv-camp-body')?.value || state.campaign?.email_body || '')
                .replace(/{{mitglied\.vorname}}/gi, escapeHtml(curMember.first_name || 'Hans'))
                .replace(/{{mitglied\.nachname}}/gi, escapeHtml(curMember.last_name || 'Muster'))
                .replace(/{{mitglied\.anrede}}/gi, `Lieber ${escapeHtml(curMember.first_name || 'Hans')}`)
                .replace(/{{event\.datum_formatiert}}/gi, `${state.gvInstance?.datum || 'im März'} ${state.year}`)
                .replace(/{{dossier\.download_url}}/gi, `<a href="${state.compiledPdfUrl || '#'}" target="_blank" class="fw-bold text-primary">👉 GV-Dossier ${state.year} herunterladen (PDF)</a>`);

            let renderedBodyHtml = '';
            if (/<[a-z][\s\S]*>/i.test(rawBody)) {
                renderedBodyHtml = rawBody;
            } else {
                renderedBodyHtml = rawBody.split(/\n\s*\n/).map(p => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
            }

            panel.innerHTML = `
                <div class="p-4 overflow-auto" style="max-height: 580px;">
                    <!-- E-MAIL KOPF -->
                    <div class="border rounded-3 p-3 bg-light mb-3">
                        <div class="d-flex mb-1.5"><span class="text-muted small fw-bold me-2" style="width:50px;">Von:</span><span class="small fw-semibold">Sportschützen Muhen &lt;sportschuetzen.muhen@gmail.com&gt;</span></div>
                        <div class="d-flex mb-1.5"><span class="text-muted small fw-bold me-2" style="width:50px;">An:</span><span class="small fw-semibold">${escapeHtml(curMember.first_name)} ${escapeHtml(curMember.last_name)} &lt;${escapeHtml(curMember.primary_email || 'mitglied@example.ch')}&gt;</span></div>
                        <div class="d-flex"><span class="text-muted small fw-bold me-2" style="width:50px;">Betreff:</span><span class="small fw-bold text-dark">${escapeHtml(subj)}</span></div>
                    </div>

                    <!-- E-MAIL BODY -->
                    <div class="p-3 bg-white border rounded-3 shadow-none" style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; font-size: 0.95rem; color: #1e293b;">
                        <div class="d-flex align-items-center gap-2 mb-3 pb-2 border-bottom">
                            <span class="fw-bold text-primary" style="font-size: 1.05rem;">Sportschützen Muhen</span>
                            <span class="text-muted">·</span>
                            <span class="small text-muted">Offizielle Einladung</span>
                        </div>
                        <div>${renderedBodyHtml}</div>
                        <div class="mt-4 pt-3 border-top small text-muted">
                            Sportschützen Muhen · Schiessanlage Rüteli · 5037 Muhen · <a href="https://www.sportschuetzen-muhen.ch" target="_blank">www.sportschuetzen-muhen.ch</a>
                        </div>
                    </div>
                </div>
            `;
        }
    }

    // Variable an Cursor-Position einfügen
    window.gvDossierInsertVariable = function (variableTag) {
        const bodyEl = document.getElementById('gv-camp-body');
        if (bodyEl && bodyEl._clubWysiwygInstance) {
            bodyEl._clubWysiwygInstance.insertVariable(variableTag);
        } else if (bodyEl) {
            const start = bodyEl.selectionStart || 0;
            const end = bodyEl.selectionEnd || 0;
            bodyEl.value = bodyEl.value.substring(0, start) + variableTag + bodyEl.value.substring(end);
            bodyEl.selectionStart = bodyEl.selectionEnd = start + variableTag.length;
            bodyEl.focus();
            gvDossierLiveUpdateMailText();
        }
    };

    // =========================================================================
    // AKTIONEN & EVENT-HANDLER
    // =========================================================================

    window.gvDossierSetLeftTab = function (tabKey) {
        window._gvDossierState.activeLeftTab = tabKey;
        renderGVDossierWorkspace();
    };

    window.gvDossierSetRightTab = function (tabKey) {
        window._gvDossierState.activeRightTab = tabKey;
        renderGVDossierWorkspace();
    };

    window.gvDossierSelectMember = function (mId) {
        window._gvDossierState.selectedMemberId = mId;
        renderRightPanel();
    };

    window.gvDossierLiveUpdateMailText = function () {
        if (window._gvDossierState.activeRightTab === 'preview-mail') {
            renderRightPanel();
        }
    };

    window.gvDossierInsertVariable = function (variableTag) {
        const area = document.getElementById('gv-camp-body');
        if (!area) return;
        const start = area.selectionStart;
        const end = area.selectionEnd;
        const text = area.value;
        area.value = text.substring(0, start) + variableTag + text.substring(end);
        area.selectionStart = area.selectionEnd = start + variableTag.length;
        area.focus();
        gvDossierLiveUpdateMailText();
    };

    function initSortableAttachments() {
        const el = document.getElementById('gvAttachmentsSortableList');
        if (!el || typeof Sortable === 'undefined') return;

        Sortable.create(el, {
            animation: 150,
            handle: '.fa-grip-vertical',
            draggable: '.gv-sortable-item',
            onEnd: async function () {
                const items = el.querySelectorAll('.gv-sortable-item');
                const supa = getSupabase();
                if (!supa) return;

                const updates = [];
                items.forEach((item, idx) => {
                    const attId = item.dataset.attId;
                    if (attId) {
                        updates.push(supa.from('campaign_attachments').update({ sort_order: idx + 3 }).eq('id', attId));
                    }
                });

                try {
                    await Promise.all(updates);
                    if (typeof showToast === 'function') showToast("Reihenfolge aktualisiert!", 'success');
                } catch (e) {
                    console.error("Sortier-Fehler:", e);
                }
            }
        });
    }

    /**
     * Upload von PDF-Beilagen direkt in den Supabase Storage Bucket 'campaign-assets'
     */
    window.gvDossierHandleFileUpload = async function (files) {
        if (!files || !files.length) return;
        const supa = getSupabase();
        if (!supa) return;

        const state = window._gvDossierState;
        const campId = state.campaign?.id;
        if (!campId) {
            alert("Fehler: Keine aktive Kampagne gefunden.");
            return;
        }

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay(`Lade ${files.length} Beilage(n) hoch...`);
        }

        try {
            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                if (!file.name.toLowerCase().endsWith('.pdf')) {
                    alert(`Datei ${file.name} übersprungen: Nur PDF-Dateien sind als Beilage zulässig.`);
                    continue;
                }

                const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
                const storagePath = `campaigns/${campId}/${Date.now()}_${cleanName}`;

                // 1. Upload in Bucket campaign-assets
                const { error: upErr } = await supa.storage
                    .from('campaign-assets')
                    .upload(storagePath, file, { contentType: 'application/pdf', upsert: true });

                if (upErr) throw upErr;

                const { data: urlData } = supa.storage.from('campaign-assets').getPublicUrl(storagePath);
                const publicUrl = urlData?.publicUrl || storagePath;

                // 2. Metadaten in campaign_attachments abspeichern
                const nextSort = state.attachments.length + 3;
                const cleanTitle = file.name.replace(/\.pdf$/i, '').replace(/_/g, ' ');

                await supa.from('campaign_attachments').insert({
                    campaign_id: campId,
                    title: cleanTitle,
                    storage_path: storagePath,
                    file_url: publicUrl,
                    sort_order: nextSort,
                    status: 'uploaded'
                });
            }

            if (typeof showSuccess === 'function') showSuccess("Beilage(n) erfolgreich hochgeladen!");
            await loadGVDossierData();
            renderGVDossierWorkspace();
        } catch (err) {
            console.error("Upload-Fehler:", err);
            alert("Upload fehlgeschlagen: " + err.message);
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    /**
     * Beilage löschen
     */
    window.gvDossierDeleteAttachment = async function (attId) {
        if (!confirm("Möchten Sie diese Beilage wirklich aus dem Dossier entfernen?")) return;
        const supa = getSupabase();
        if (!supa) return;

        try {
            await supa.from('campaign_attachments').delete().eq('id', attId);
            if (typeof showSuccess === 'function') showSuccess("Beilage gelöscht.");
            await loadGVDossierData();
            renderGVDossierWorkspace();
        } catch (e) {
            alert("Löschen fehlgeschlagen: " + e.message);
        }
    };

    /**
     * Schalter für Jahresprogramm-Einbindung
     */
    window.gvDossierToggleCalendar = async function (include) {
        const supa = getSupabase();
        const state = window._gvDossierState;
        if (!supa || !state.campaign) return;

        const settings = state.campaign.custom_settings || {};
        settings.include_calendar = include;

        try {
            await supa.from('communication_campaigns').update({
                custom_settings: settings,
                updated_at: new Date().toISOString()
            }).eq('id', state.campaign.id);
            state.campaign.custom_settings = settings;
            if (typeof showToast === 'function') showToast(`Jahresprogramm ${include ? 'aktiviert' : 'deaktiviert'}`, 'info');
        } catch (e) {
            console.error("Fehler beim Aktualisieren:", e);
        }
    };

    /**
     * E-Mail-Texte speichern
     */
    window.gvDossierSaveCampaignText = async function () {
        const supa = getSupabase();
        const state = window._gvDossierState;
        if (!supa || !state.campaign) return;

        const email_subject = document.getElementById('gv-camp-subj')?.value.trim();
        const email_body = document.getElementById('gv-camp-body')?.value.trim();

        try {
            await supa.from('communication_campaigns').update({
                email_subject,
                email_body,
                updated_at: new Date().toISOString()
            }).eq('id', state.campaign.id);

            state.campaign.email_subject = email_subject;
            state.campaign.email_body = email_body;

            if (typeof showSuccess === 'function') showSuccess("E-Mail-Konfiguration gespeichert!");
        } catch (e) {
            alert("Speichern fehlgeschlagen: " + e.message);
        }
    };

    /**
     * Assembler ausführen: Ruft compile-gv-dossier auf
     */
    window.gvDossierCompileNow = async function () {
        const state = window._gvDossierState;
        const campId = state.campaign?.id;
        const year = state.year;

        state.isCompiling = true;
        renderLeftPanel();

        try {
            if (typeof window.gvCompileDossierPdf !== 'function') {
                throw new Error("Zentraler Dossier-Compiler (window.gvCompileDossierPdf) ist nicht verfügbar.");
            }

            const gvData = {
                gvNummer: state.gvInstance?.number || 100,
                datum: state.gvInstance?.datum || '',
                zeit: state.gvInstance?.zeit || '19:30',
                ort: state.gvInstance?.ort || 'Schützenhaus Muhen'
            };

            const res = await window.gvCompileDossierPdf(campId, year, gvData, {
                forceRecreate: true,
                openInNewTab: false
            });

            if (res && res.success && res.pdfUrl) {
                state.compiledPdfUrl = res.pdfUrl;
                state.compiledPdfBase64 = res.pdfBase64 || null;

                // Status der Kampagne auf 'ready' setzen
                const supa = getSupabase();
                if (supa && campId) {
                    await supa.from('communication_campaigns').update({
                        status: 'ready',
                        dossier_pdf_url: res.pdfUrl,
                        updated_at: new Date().toISOString()
                    }).eq('id', campId);
                }

                if (typeof showSuccess === 'function') {
                    showSuccess("🎉 Master-GV-Dossier erfolgreich kompiliert & gestempelt!");
                }

                // Automatisch auf PDF-Preview umschalten
                state.activeRightTab = 'preview-pdf';
                await loadGVDossierData();
                renderGVDossierWorkspace();
            } else {
                throw new Error(res?.error || "Kompilierung fehlgeschlagen.");
            }
        } catch (err) {
            console.error("Dossier-Compiler Fehler:", err);
            alert("Fehler beim Kompilieren des Dossiers: " + err.message);
        } finally {
            state.isCompiling = false;
            renderLeftPanel();
        }
    };

    /**
     * Test-Mail an den aktuell eingeloggten Benutzer senden
     */
    window.gvDossierSendTestMail = async function () {
        const state = window._gvDossierState;
        const loggedUser = window.currentUser || localStorage.getItem('portal_user') || 'Vorstand';
        const curMember = state.members.find(m => m.id === state.selectedMemberId) || state.members[0] || {};

        const emailTarget = prompt(`Test-Mail an folgende E-Mail-Adresse senden:`, curMember.primary_email || 'sportschuetzen.muhen@gmail.com');
        if (!emailTarget) return;

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay(`Sende Test-Mail an ${emailTarget}...`);
        }

        try {
            if (typeof window.sendMailViaEngine !== 'function') {
                throw new Error("Mail-Engine nicht verfügbar.");
            }

            const subj = (document.getElementById('gv-camp-subj')?.value || state.campaign?.email_subject || 'Einladung GV')
                .replace(/{{mitglied\.vorname}}/gi, curMember.first_name || 'Hans')
                .replace(/{{mitglied\.nachname}}/gi, curMember.last_name || 'Muster');

            const bodyHtml = (document.getElementById('gv-camp-body')?.value || state.campaign?.email_body || '')
                .replace(/{{mitglied\.vorname}}/gi, curMember.first_name || 'Hans')
                .replace(/{{mitglied\.nachname}}/gi, curMember.last_name || 'Muster')
                .replace(/{{event\.datum_formatiert}}/gi, `${state.gvInstance?.datum || 'im März'} ${state.year}`)
                .replace(/{{dossier\.download_url}}/gi, `<a href="${state.compiledPdfUrl || '#'}" target="_blank">GV-Dossier ${state.year} herunterladen (PDF)</a>`)
                .replace(/\n/g, '<br>');

            const attachments = [];
            if (state.compiledPdfUrl) {
                attachments.push({
                    filename: `GV_Dossier_${state.year}.pdf`,
                    storagePath: `gv-dossiers/${state.year}/GV_Dossier_${state.year}_Gesamt.pdf`,
                    storageBucket: 'operatives-storage'
                });
            }

            const res = await window.sendMailViaEngine({
                to: emailTarget,
                subject: `[TEST] ${subj}`,
                bodyHtml: `<div style="padding:10px; border-left:4px solid #f59e0b; background:#fffbeb; margin-bottom:15px; font-size:12px;"><strong>TEST-MAIL:</strong> Gesendet von ${escapeHtml(loggedUser)}</div>${bodyHtml}`,
                module: 'Generalversammlung',
                attachments: attachments.length ? attachments : undefined
            });

            if (res && res.success) {
                alert(`✅ Test-Mail erfolgreich an ${emailTarget} gesendet!`);
            } else {
                throw new Error(res?.error || "Senden fehlgeschlagen.");
            }
        } catch (e) {
            alert("Fehler beim Senden der Test-Mail: " + e.message);
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    /**
     * Idempotenter Massenversand an alle aktiven Mitglieder
     */
    window.gvDossierStartCampaignDispatch = async function () {
        const state = window._gvDossierState;
        const validMembers = state.members.filter(m => m.primary_email && m.primary_email.includes('@'));

        if (!validMembers.length) {
            alert("Keine aktiven Mitglieder mit gültiger E-Mail-Adresse gefunden.");
            return;
        }

        if (!state.compiledPdfUrl) {
            if (!confirm("⚠️ Achtung: Es wurde noch kein Master-Dossier kompiliert!\n\nMöchten Sie den Massenversand trotzdem starten?")) {
                return;
            }
        }

        if (!confirm(`🚀 Massenversand freigeben:\n\nEs werden ${validMembers.length} E-Mails via zentrale Mail-Engine versendet.\n\nMöchten Sie den Versand jetzt definitiv starten?`)) {
            return;
        }

        const supa = getSupabase();
        const campId = state.campaign?.id;

        state.isSending = true;
        renderGVDossierWorkspace();

        let sentCount = 0;
        let failCount = 0;

        try {
            if (supa && campId) {
                await supa.from('communication_campaigns').update({
                    status: 'processing',
                    total_recipients: validMembers.length,
                    updated_at: new Date().toISOString()
                }).eq('id', campId);
            }

            const subjTpl = document.getElementById('gv-camp-subj')?.value || state.campaign?.email_subject || 'Einladung GV';
            const bodyTpl = document.getElementById('gv-camp-body')?.value || state.campaign?.email_body || '';

            for (const m of validMembers) {
                const personalizedSubj = subjTpl
                    .replace(/{{mitglied\.vorname}}/gi, m.first_name || '')
                    .replace(/{{mitglied\.nachname}}/gi, m.last_name || '');

                const personalizedBody = bodyTpl
                    .replace(/{{mitglied\.vorname}}/gi, m.first_name || '')
                    .replace(/{{mitglied\.nachname}}/gi, m.last_name || '')
                    .replace(/{{event\.datum_formatiert}}/gi, `${state.gvInstance?.datum || 'im März'} ${state.year}`)
                    .replace(/{{dossier\.download_url}}/gi, `<a href="${state.compiledPdfUrl || '#'}" target="_blank">GV-Dossier ${state.year} herunterladen (PDF)</a>`)
                    .replace(/\n/g, '<br>');

                try {
                    await window.sendMailViaEngine({
                        to: m.primary_email,
                        subject: personalizedSubj,
                        bodyHtml: personalizedBody,
                        module: 'Generalversammlung'
                    });
                    sentCount++;
                } catch (sendErr) {
                    failCount++;
                    console.warn(`Fehler beim Senden an ${m.primary_email}:`, sendErr);
                }
            }

            if (supa && campId) {
                await supa.from('communication_campaigns').update({
                    status: 'completed',
                    sent_count: sentCount,
                    failed_count: failCount,
                    updated_at: new Date().toISOString()
                }).eq('id', campId);
            }

            alert(`✅ Massenversand abgeschlossen!\n\nErfolgreich gesendet: ${sentCount}\nFehlgeschlagen: ${failCount}`);
            await loadGVDossierData();
            renderGVDossierWorkspace();
        } catch (err) {
            alert("Massenversand abgebrochen: " + err.message);
        } finally {
            state.isSending = false;
            renderGVDossierWorkspace();
        }
    };

    window.gvDossierReload = async function () {
        await loadGVDossierData();
        renderGVDossierWorkspace();
    };

    console.log("🚀 [GV-Dossier] Modul geladen: window.renderGVDossierView aktiv.");
})();
