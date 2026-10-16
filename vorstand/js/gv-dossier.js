/**
 * gv-dossier.js
 * ==============================================================================
 * Generalversammlung (GV-Cockpit) & Dossier-Compiler
 * Projekt: Vereinsportal Sportschützen Muhen
 *
 * Enthält 4 Haupt-Bereiche (Left-Panel):
 * 1. Traktanden-Manager: Hierarchische Haupt- und Untertraktanden mit ▲/▼-Verschieben,
 *    Bearbeiten und Löschen. Single Source of Truth: public.gv_traktanden.
 * 2. GV-Stammdaten & Fristen: Nummer, Datum, Zeit, Ort, Wahljahr, Abmelde-/Mahndatum,
 *    verknüpftes RSVP-Event aus poll_events. Single Source of Truth: public.gv_instances.
 * 3. Dossier-Beilagen: PDF-Uploads für Berichte/Protokolle nach 'campaign-assets',
 *    SortableJS Reihenfolge & Button "Gesamtes GV-Dossier jetzt kompilieren & stempeln".
 * 4. E-Mail-Text & Kampagne: Betreff, WYSIWYG/Text mit Platzhaltern, Test-Mail, Massenversand.
 *
 * Rechtes Panel:
 * - Live-Monitor: Umschaltbar zwischen [ 📄 PDF-Vorschau ] und [ ✉️ E-Mail-Vorschau ]
 * - Empfängerauswahl für Personalisierung
 * ==============================================================================
 */

(function () {
    window._gvDossierState = {
        year: new Date().getFullYear(),
        campaign: null,
        attachments: [],
        gvInstance: null,
        traktanden: [],
        pollEvents: [],
        members: [],
        selectedMemberId: null,
        activeLeftTab: 'traktanden',   // 'traktanden' | 'stammdaten' | 'beilagen' | 'mail' | 'anmeldungen'
        activeRightTab: 'preview-pdf', // 'preview-mail' | 'preview-pdf' | 'preview-wirt'
        compiledPdfUrl: null,
        compiledPdfBase64: null,
        isCompiling: false,
        isSending: false,
        participantsData: [],
        participantsSearchQuery: '',
        participantsFilter: 'alle'
    };

    function getSupabase() {
        return (typeof window.getSupabaseClient === 'function')
            ? window.getSupabaseClient()
            : (window.supabaseClient || null);
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
                <div class="fw-bold text-muted">Lade GV-Cockpit & Traktanden aus Supabase...</div>
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

            // 2. Poll-Events laden (für RSVP-Verknüpfung)
            const { data: evData } = await supa
                .from('poll_events')
                .select('id, title, datum')
                .order('datum', { ascending: false });
            state.pollEvents = evData || [];

            // 3. GV-Stammdaten aus gv_instances laden
            const { data: gvData } = await supa
                .from('gv_instances')
                .select('*')
                .eq('year', curYear)
                .maybeSingle();

            if (gvData) {
                state.gvInstance = gvData;
            } else {
                state.gvInstance = {
                    id: `gv_${curYear}`,
                    year: curYear,
                    number: 100,
                    datum: `${curYear}-03-20`,
                    zeit: '19:30',
                    ort: 'Schützenstube Hard, Muhen',
                    datum_vorjahr: `${curYear - 1}-03-21`,
                    abmelde_datum: `${curYear}-03-13`,
                    mahn_datum: `${curYear}-03-06`,
                    is_election_year: false,
                    linked_event_id: '',
                    praesident_wort: '',
                    budget_text: '',
                    vorstand_mails: []
                };
            }

            // Intelligente Auto-Vorbelegung des verknüpften Umfrage-Events, falls noch nicht explizit gewählt
            if (!state.gvInstance.linked_event_id && state.pollEvents && state.pollEvents.length > 0) {
                const autoMatch = state.pollEvents.find(ev => {
                    const t = (ev.title || '').toLowerCase();
                    const d = (ev.datum || '');
                    return t.includes('generalversammlung') && d.startsWith(String(curYear));
                }) || state.pollEvents.find(ev => (ev.title || '').toLowerCase().includes('generalversammlung'));

                if (autoMatch) {
                    state.gvInstance.linked_event_id = autoMatch.id;
                    console.log(`💡 [GV-Dossier] Auto-Preselect verknüpftes Event gefunden: "${autoMatch.title}" (${autoMatch.id})`);
                }
            }

            // 4. Kampagne aus communication_campaigns suchen oder erstellen
            let { data: campData } = await supa
                .from('communication_campaigns')
                .select('*')
                .eq('season_year', curYear)
                .eq('campaign_type', 'gv')
                .maybeSingle();

            if (!campData) {
                const defaultBody = "Liebe Schützinnen, liebe Schützen, geschätzte Ehrenmitglieder\n\n" +
                    `Wir laden euch herzlich zu unserer ${state.gvInstance.number || 100}. ordentlichen Generalversammlung ein.\n` +
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

            // 5. Beilagen zur Kampagne laden
            if (state.campaign?.id) {
                const { data: attData } = await supa
                    .from('campaign_attachments')
                    .select('*')
                    .eq('campaign_id', state.campaign.id)
                    .order('sort_order', { ascending: true });
                state.attachments = attData || [];
                state.compiledPdfUrl = state.campaign.dossier_pdf_url || state.gvInstance?.doc_anhaenge_url || null;
            }

            // 6. Traktanden direkt aus public.gv_traktanden für diese GV laden
            const gvId = state.gvInstance?.id || `gv_${curYear}`;
            const { data: trData } = await supa
                .from('gv_traktanden')
                .select('*')
                .eq('gv_id', gvId)
                .order('sort_order', { ascending: true });
            state.traktanden = trData || [];

            // 7. Teilnehmer- & Anmeldedaten laden
            await loadGVParticipantsData();

        } catch (err) {
            console.error("❌ Fehler beim Laden der GV-Daten:", err);
            if (typeof showError === 'function') showError("Fehler beim Laden: " + err.message);
        }
    }

    /**
     * Lädt Teilnehmer, RSVPs und Vor-Ort-Präsenz für die Generalversammlung
     */
    async function loadGVParticipantsData(forceRefresh = false) {
        const state = window._gvDossierState;
        const eventId = state.gvInstance?.linked_event_id;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;
        const supa = getSupabase();
        if (!supa) return;

        if (!forceRefresh && state.participantsData && state.participantsData.length > 0 && state.participantsEventId === eventId) {
            return;
        }

        try {
            const [membersRes, responsesRes, praesenzRes] = await Promise.allSettled([
                supa.from('members')
                    .select('id, person_number, first_name, last_name, primary_email, is_active, status_u21')
                    .eq('is_active', true)
                    .order('last_name', { ascending: true }),
                eventId ? supa.from('poll_responses').select('*').eq('event_id', eventId) : Promise.resolve({ data: [] }),
                supa.from('gv_praesenz').select('*').eq('gv_id', gvId)
            ]);

            const members = (membersRes.status === 'fulfilled' && !membersRes.value.error) ? (membersRes.value.data || []) : [];
            const responses = (responsesRes.status === 'fulfilled' && !responsesRes.value.error) ? (responsesRes.value.data || []) : [];
            const praesenzList = (praesenzRes.status === 'fulfilled' && !praesenzRes.value.error) ? (praesenzRes.value.data || []) : [];

            const respMap = new Map();
            responses.forEach(r => {
                const liz = String(r.lizenz || '').trim();
                if (liz) {
                    respMap.set(liz, r);
                    respMap.set(liz.length <= 6 ? liz.padStart(6, '0') : liz, r);
                }
            });

            const praesenzMap = new Map();
            praesenzList.forEach(p => {
                const pn = String(p.person_number || '').trim();
                if (pn) praesenzMap.set(pn, p);
            });

            state.participantsData = members.map(m => {
                const pn = String(m.person_number || '');
                const liz = pn.length <= 6 ? pn.padStart(6, '0') : pn;
                const resp = respMap.get(liz) || respMap.get(pn);
                const praesenz = praesenzMap.get(pn) || praesenzMap.get(liz);

                let status = 'offen';
                let essen = 0;
                let vegi = 0;
                let grund = '';

                if (resp) {
                    status = (resp.attending === true || resp.attending === 'true' || resp.attending === 1) ? 'ja' : 'nein';
                    essen = parseInt(resp.essen) || 0;
                    vegi = parseInt(resp.vegi) || 0;
                    grund = resp.grund || '';
                }

                const isAnwesend = praesenz ? Boolean(praesenz.anwesend) : false;
                const isStimmberechtigt = praesenz ? (praesenz.stimmberechtigt !== false) : true;

                return {
                    id: m.id,
                    person_number: pn,
                    lizenz: liz,
                    name: `${m.last_name || ''} ${m.first_name || ''}`.trim(),
                    first_name: m.first_name || '',
                    last_name: m.last_name || '',
                    email: m.primary_email || '',
                    status: status,
                    essen: essen,
                    vegi: vegi,
                    grund: grund,
                    anwesend: isAnwesend,
                    stimmberechtigt: isStimmberechtigt
                };
            });

            state.participantsEventId = eventId;
            console.log(`✅ [GV-Dossier] ${state.participantsData.length} Teilnehmer & Präsenzen synchronisiert.`);
        } catch (err) {
            console.error("❌ [GV-Dossier] Fehler beim Laden der Teilnehmer:", err);
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
            <!-- MODAL CONTAINER (Wird für Traktanden & Einstellungen verwendet) -->
            <div id="gv-dossier-modal-container"></div>

            <!-- WORKSPACE HEADER -->
            <div class="card border-0 shadow-sm rounded-4 p-3 mb-3 bg-white">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div class="d-flex align-items-center gap-3">
                        <div class="rounded-3 bg-primary text-white d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; font-size: 1.25rem;">
                            <i class="fas fa-landmark"></i>
                        </div>
                        <div>
                            <div class="d-flex align-items-center gap-2">
                                <h4 class="mb-0 fw-bold text-dark">Generalversammlung</h4>
                                <select class="form-select form-select-sm fw-bold border-primary text-primary" style="width: auto;" onchange="gvDossierSetYear(this.value)">
                                    <option value="${curYear - 1}">${curYear - 1}</option>
                                    <option value="${curYear}" selected>${curYear}</option>
                                    <option value="${curYear + 1}">${curYear + 1}</option>
                                </select>
                            </div>
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
                    </div>
                </div>
            </div>

            <!-- 2-SPALTEN-ARBEITSBEREICH -->
            <div class="row g-3">
                <!-- LINKE SPALTE: REDAKTION, STAMMDATEN, TRAKTANDEN & BEILAGEN -->
                <div class="col-lg-6">
                    <div class="card border-0 shadow-sm rounded-4 h-100 bg-white">
                        <!-- TAB-NAVIGATION LINKS -->
                        <div class="card-header bg-white border-bottom pt-3 pb-0 px-3">
                            <ul class="nav nav-tabs border-0" id="gvLeftTabs" role="tablist">
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'traktanden' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('traktanden')">
                                        <i class="fas fa-list-ol me-1.5"></i> Traktanden (${state.traktanden.filter(t => !t.parent_id).length})
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'stammdaten' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('stammdaten')">
                                        <i class="fas fa-sliders-h me-1.5"></i> Stammdaten & Fristen
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'beilagen' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('beilagen')">
                                        <i class="fas fa-layer-group me-1.5"></i> Beilagen (${state.attachments.length + 2})
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'mail' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('mail')">
                                        <i class="fas fa-envelope me-1.5"></i> E-Mail-Versand
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'anmeldungen' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('anmeldungen')">
                                        <i class="fas fa-users-cog me-1.5"></i> Anmeldungen &amp; Präsenz (${(state.participantsData || []).filter(p => p.status === 'ja').length})
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

                <!-- RECHTE SPALTE: LIVE-MONITOR (E-MAIL, PDF & WIRT VORSCHAU) -->
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
                                    <button type="button" class="btn ${state.activeRightTab === 'preview-wirt' ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="gvDossierSetRightTab('preview-wirt')">
                                        <i class="fas fa-utensils me-1"></i> Gastronomie &amp; Wirt
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
     * Rendert das aktive linke Panel
     */
    function renderLeftPanel() {
        const panel = document.getElementById('gvLeftTabContent');
        if (!panel) return;

        const state = window._gvDossierState;
        const curYear = state.year;
        const gv = state.gvInstance || {};

        // ---------------------------------------------------------------------
        // TAB 1: TRAKTANDEN-MANAGER
        // ---------------------------------------------------------------------
        if (state.activeLeftTab === 'traktanden') {
            const allItems = state.traktanden || [];
            const mainItems = allItems.filter(t => !t.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

            panel.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div>
                        <span class="small fw-bold text-muted text-uppercase">Traktandenliste ${curYear}:</span>
                        <div class="text-muted" style="font-size:0.75rem;">Haupt- & Untertraktanden (direkt in Supabase gespeichert)</div>
                    </div>
                    <div class="d-flex gap-2">
                        <button class="btn btn-sm btn-primary py-1 px-2.5 rounded-2 fw-semibold shadow-sm" onclick="gvDossierAddTraktandumModal(null)">
                            <i class="fas fa-plus me-1"></i> Traktandum hinzufügen
                        </button>
                    </div>
                </div>

                ${mainItems.length === 0 ? `
                    <div class="alert alert-warning border-0 rounded-3 p-3 text-center my-4">
                        <i class="fas fa-exclamation-circle fa-2x mb-2 text-warning"></i>
                        <h6 class="fw-bold text-dark">Noch keine Traktanden für die GV ${curYear} erfasst</h6>
                        <p class="small text-muted mb-3">Sie können Standard-Traktanden mit 1 Klick anlegen oder manuell starten:</p>
                        <div class="d-flex justify-content-center gap-2 flex-wrap">
                            <button class="btn btn-sm btn-outline-primary fw-semibold" onclick="gvDossierSeedDefaultTraktanden(false)">
                                <i class="fas fa-magic me-1"></i> Standard-Traktanden (Normaljahr) laden
                            </button>
                            <button class="btn btn-sm btn-outline-info fw-semibold" onclick="gvDossierSeedDefaultTraktanden(true)">
                                <i class="fas fa-users-cog me-1"></i> Standard-Traktanden (Wahljahr) laden
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="list-group rounded-3 shadow-none mb-3">
                        ${mainItems.map((main, mIdx) => {
                            const subItems = allItems.filter(t => t.parent_id === main.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                            return `
                                <div class="list-group-item p-2.5 border mb-2 rounded-2 shadow-xs bg-white">
                                    <!-- HAUPTTRAKTANDUM ZEILE -->
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div class="d-flex align-items-center gap-2">
                                            <span class="badge bg-primary text-white rounded-pill px-2 py-1 fs-7">${escapeHtml(main.nummer || String(mIdx + 1))}</span>
                                            <div>
                                                <div class="fw-bold small text-dark">${escapeHtml(main.titel)}</div>
                                                ${main.beschreibung ? `<div class="text-muted" style="font-size:0.75rem;">${escapeHtml(main.beschreibung)}</div>` : ''}
                                            </div>
                                        </div>
                                        <div class="d-flex align-items-center gap-1">
                                            ${main.referent ? `<span class="badge bg-light text-secondary border me-1 py-1 px-1.5" style="font-size:0.7rem;"><i class="fas fa-user-tie me-1"></i>${escapeHtml(main.referent)}</span>` : ''}
                                            <!-- REIHENFOLGE PFEILE -->
                                            <button class="btn btn-xs btn-outline-secondary p-1" title="Nach oben verschieben" onclick="gvDossierMoveTraktandum('${main.id}', 'up')" ${mIdx === 0 ? 'disabled' : ''}>
                                                <i class="fas fa-arrow-up"></i>
                                            </button>
                                            <button class="btn btn-xs btn-outline-secondary p-1" title="Nach unten verschieben" onclick="gvDossierMoveTraktandum('${main.id}', 'down')" ${mIdx === mainItems.length - 1 ? 'disabled' : ''}>
                                                <i class="fas fa-arrow-down"></i>
                                            </button>
                                            <!-- UNTERTRAKTANDUM HINZUFÜGEN -->
                                            <button class="btn btn-xs btn-outline-primary py-0.5 px-1.5 ms-1" title="Untertraktandum hinzufügen" onclick="gvDossierAddTraktandumModal('${main.id}')">
                                                <i class="fas fa-plus"></i> <span style="font-size:0.7rem;">Unterpunkt</span>
                                            </button>
                                            <!-- BEARBEITEN & LÖSCHEN -->
                                            <button class="btn btn-xs btn-outline-secondary p-1 ms-1" title="Bearbeiten" onclick="gvDossierEditTraktandumModal('${main.id}')">
                                                <i class="fas fa-pencil-alt"></i>
                                            </button>
                                            <button class="btn btn-xs btn-outline-danger p-1" title="Löschen" onclick="gvDossierDeleteTraktandum('${main.id}')">
                                                <i class="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- UNTERTRAKTANDEN (EINGERÜCKT) -->
                                    ${subItems.length > 0 ? `
                                        <div class="ms-4 mt-2 ps-2 border-start border-2 border-primary-subtle">
                                            ${subItems.map((sub, sIdx) => `
                                                <div class="d-flex align-items-center justify-content-between py-1 px-2 mb-1 bg-light rounded-2 border border-light-subtle">
                                                    <div class="d-flex align-items-center gap-2">
                                                        <span class="badge bg-secondary-subtle text-dark rounded-pill px-1.5 py-0.5" style="font-size:0.7rem;">${escapeHtml(sub.nummer || (main.nummer + '.' + (sIdx + 1)))}</span>
                                                        <div>
                                                            <span class="small fw-semibold text-dark">${escapeHtml(sub.titel)}</span>
                                                            ${sub.beschreibung ? `<span class="text-muted ms-1" style="font-size:0.72rem;">– ${escapeHtml(sub.beschreibung)}</span>` : ''}
                                                        </div>
                                                    </div>
                                                    <div class="d-flex align-items-center gap-1">
                                                        ${sub.referent ? `<span class="badge bg-white text-muted border py-0 px-1 me-1" style="font-size:0.65rem;">${escapeHtml(sub.referent)}</span>` : ''}
                                                        <button class="btn btn-xs btn-link text-secondary p-0 px-1" title="Nach oben" onclick="gvDossierMoveTraktandum('${sub.id}', 'up')" ${sIdx === 0 ? 'disabled' : ''}>
                                                            <i class="fas fa-arrow-up" style="font-size:0.7rem;"></i>
                                                        </button>
                                                        <button class="btn btn-xs btn-link text-secondary p-0 px-1" title="Nach unten" onclick="gvDossierMoveTraktandum('${sub.id}', 'down')" ${sIdx === subItems.length - 1 ? 'disabled' : ''}>
                                                            <i class="fas fa-arrow-down" style="font-size:0.7rem;"></i>
                                                        </button>
                                                        <button class="btn btn-xs btn-link text-secondary p-0 px-1" title="Bearbeiten" onclick="gvDossierEditTraktandumModal('${sub.id}')">
                                                            <i class="fas fa-pencil-alt" style="font-size:0.7rem;"></i>
                                                        </button>
                                                        <button class="btn btn-xs btn-link text-danger p-0 px-1" title="Löschen" onclick="gvDossierDeleteTraktandum('${sub.id}')">
                                                            <i class="fas fa-trash-alt" style="font-size:0.7rem;"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    ` : ''}
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            `;
        }

        // ---------------------------------------------------------------------
        // TAB 2: STAMMDATEN & FRISTEN
        // ---------------------------------------------------------------------
        else if (state.activeLeftTab === 'stammdaten') {
            panel.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="small fw-bold text-muted text-uppercase">GV-Stammdaten & Termine ${curYear}:</span>
                    <button class="btn btn-sm btn-success fw-bold px-3 py-1 rounded-2 shadow-sm" onclick="gvDossierSaveStammdaten()">
                        <i class="fas fa-save me-1"></i> Stammdaten speichern
                    </button>
                </div>

                <div class="card border rounded-3 p-3 bg-light mb-3">
                    <div class="row g-2 mb-2">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Nummer der GV</label>
                            <div class="input-group input-group-sm">
                                <span class="input-group-text bg-white">Nr.</span>
                                <input type="number" id="gv-stamm-number" class="form-control" value="${escapeHtml(gv.number || 100)}">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Datum der GV</label>
                            <input type="date" id="gv-stamm-datum" class="form-control form-control-sm" value="${escapeHtml(gv.datum || '')}">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Startzeit</label>
                            <input type="text" id="gv-stamm-zeit" class="form-control form-control-sm" placeholder="19:30" value="${escapeHtml(gv.zeit || '19:30')}">
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-md-8">
                            <label class="form-label small fw-bold mb-1">Austragungsort</label>
                            <input type="text" id="gv-stamm-ort" class="form-control form-control-sm" value="${escapeHtml(gv.ort || 'Schützenhaus Muhen')}">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Wahljahr</label>
                            <div class="form-check form-switch mt-1">
                                <input class="form-check-input" type="checkbox" id="gv-stamm-wahljahr" ${gv.is_election_year ? 'checked' : ''} style="cursor: pointer;">
                                <label class="form-check-label small fw-semibold" for="gv-stamm-wahljahr">Gesamterneuerungswahlen</label>
                            </div>
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Datum Vorjahres-GV</label>
                            <input type="date" id="gv-stamm-vorjahr" class="form-control form-control-sm" value="${escapeHtml(gv.datum_vorjahr || '')}">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Abmeldefrist</label>
                            <input type="date" id="gv-stamm-abmeldung" class="form-control form-control-sm" value="${escapeHtml(gv.abmelde_datum || '')}">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Mahndatum</label>
                            <input type="date" id="gv-stamm-mahnung" class="form-control form-control-sm" value="${escapeHtml(gv.mahn_datum || '')}">
                        </div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Verknüpftes RSVP-Event (Eventplaner / Rückmeldungen)</label>
                        <select id="gv-stamm-linked-event" class="form-select form-select-sm" onchange="gvDossierOnLinkedEventChange(this.value)">
                            <option value="">-- Kein Event verknüpft --</option>
                            ${(state.pollEvents || []).map(ev => `
                                <option value="${ev.id}" ${gv.linked_event_id === ev.id ? 'selected' : ''}>
                                    ${escapeHtml(ev.title)} (${ev.datum || 'ohne Datum'})
                                </option>
                            `).join('')}
                        </select>
                        <div class="form-text small text-muted">
                            <i class="fas fa-info-circle text-primary me-1"></i>
                            Verknüpft die RSVPs aus dem Modul «Anlässe &amp; Umfragen». Damit ein Anlass hier automatisch zugeordnet wird, muss dessen Titel das Wort <strong>«Generalversammlung»</strong> enthalten (Gross-/Kleinschreibung egal).
                        </div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Vorstands-Kopien (E-Mail-Verteiler für GV-Prüfmails)</label>
                        <input type="text" id="gv-stamm-vorstand-mails" class="form-control form-control-sm" placeholder="z.B. aktuar@example.ch; kassier@example.ch" value="${escapeHtml((gv.vorstand_mails || []).join('; '))}">
                        <div class="form-text small text-muted">Mehrere E-Mail-Adressen mit Strichpunkt (;) trennen.</div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Wort des Präsidenten (Begleittext)</label>
                        <textarea id="gv-stamm-praesident-wort" class="form-control form-control-sm" rows="3" placeholder="Grusswort des Präsidenten zur GV...">${escapeHtml(gv.praesident_wort || '')}</textarea>
                    </div>

                    <div class="mb-0">
                        <label class="form-label small fw-bold mb-1">Budget-Kommentar / Erläuterung</label>
                        <textarea id="gv-stamm-budget-text" class="form-control form-control-sm" rows="2" placeholder="Optionale Bemerkungen zum Budget...">${escapeHtml(gv.budget_text || '')}</textarea>
                    </div>
                </div>
            `;
        }

        // ---------------------------------------------------------------------
        // TAB 3: BEILAGEN & DOSSIER-COMPILER
        // ---------------------------------------------------------------------
        else if (state.activeLeftTab === 'beilagen') {
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
                    <!-- FIXE BASIS-DOKUMENTE (DYNAMISCH AUS DB GENERIERT) -->
                    <div class="list-group-item p-2.5 d-flex align-items-center justify-content-between border mb-1.5 bg-light rounded-2">
                        <div class="d-flex align-items-center gap-2.5">
                            <span class="badge bg-primary text-white rounded-pill px-2 py-1">1</span>
                            <div>
                                <div class="fw-bold small mb-0">Einladung & Traktandenliste</div>
                                <div class="text-muted" style="font-size:0.75rem;">Seite 1 · Dynamisch aus Traktandenmanager generiert</div>
                            </div>
                        </div>
                        <span class="badge bg-secondary-subtle text-secondary py-1 px-1.5">System</span>
                    </div>

                    <div class="list-group-item p-2.5 d-flex align-items-center justify-content-between border mb-1.5 bg-light rounded-2">
                        <div class="d-flex align-items-center gap-2.5">
                            <span class="badge bg-primary text-white rounded-pill px-2 py-1">2</span>
                            <div>
                                <div class="fw-bold small mb-0">Jahresprogramm ${curYear} (Beilage)</div>
                                <div class="text-muted" style="font-size:0.75rem;">Seite 2 · Dynamisch aus Vereinsterminen generiert</div>
                            </div>
                        </div>
                        <div class="form-check form-switch mb-0">
                            <input class="form-check-input" type="checkbox" id="gvIncludeProgSwitch" 
                                   ${state.campaign?.custom_settings?.include_calendar !== false ? 'checked' : ''}
                                   onchange="gvDossierToggleCalendar(this.checked)">
                        </div>
                    </div>

                    <!-- HOCHGELADENE BEILAGEN (SORTIERBAR) -->
                    ${state.attachments.map((att, idx) => `
                        <div class="list-group-item p-2.5 d-flex align-items-center justify-content-between border mb-1.5 rounded-2 gv-sortable-item bg-white" data-att-id="${att.id}">
                            <div class="d-flex align-items-center gap-2.5">
                                <i class="fas fa-grip-vertical text-muted cursor-grab" title="Ziehen zum Sortieren" style="cursor: grab;"></i>
                                <span class="badge bg-secondary text-white rounded-pill px-2 py-1">${idx + 3}</span>
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
        }

        // ---------------------------------------------------------------------
        // TAB 4: E-MAIL-TEXT & KAMPAGNE
        // ---------------------------------------------------------------------
        else if (state.activeLeftTab === 'mail') {
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
                            <strong>Gesamtdossier-Link</strong> im Mail-Text einbetten (schützt vor Postfach-Bounces)
                        </label>
                    </div>
                </div>

                <div class="d-flex justify-content-end gap-2">
                    <button class="btn btn-sm btn-outline-primary" onclick="gvDossierSaveCampaignText()">
                        <i class="fas fa-save me-1"></i> Entwurf speichern
                    </button>
                </div>
            `;

            // Club WYSIWYG initialisieren falls vorhanden
            if (typeof window.ClubWysiwyg !== 'undefined') {
                window.ClubWysiwyg.init('gv-camp-body', {
                    height: 200,
                    placeholder: 'E-Mail Text an die Mitglieder verfassen...',
                    customVariables: [
                        { tag: 'mitglied.vorname', label: 'Vorname' },
                        { tag: 'mitglied.nachname', label: 'Nachname' },
                        { tag: 'event.datum_formatiert', label: 'Datum der GV' },
                        { tag: 'dossier.download_url', label: 'Download-Link Master-Dossier' }
                    ],
                    onChange: () => gvDossierLiveUpdateMailText()
                });
            }
        }

        // ---------------------------------------------------------------------
        // TAB 5: ANMELDUNGEN & PRÄSENZKONTROLLE (TEILNEHMER & MENÜS)
        // ---------------------------------------------------------------------
        else if (state.activeLeftTab === 'anmeldungen') {
            renderAnmeldungenPanel(panel);
        }
    }

    /**
     * Rendert das Panel für Teilnehmer, Menüs und Vor-Ort-Präsenzkontrolle
     */
    function renderAnmeldungenPanel(panel) {
        if (!panel) return;
        const state = window._gvDossierState;
        const curYear = state.year;
        const participants = state.participantsData || [];
        const linkedId = state.gvInstance?.linked_event_id;
        const linkedEvent = (state.pollEvents || []).find(e => e.id === linkedId);

        // Kennzahlen berechnen
        let countJa = 0;
        let countNein = 0;
        let countOffen = 0;
        let countEssen = 0;
        let countVegi = 0;
        let countAnwesend = 0;
        let countAnwesendStimm = 0;

        participants.forEach(p => {
            if (p.status === 'ja') {
                countJa++;
                countEssen += (p.essen || 0);
                countVegi += (p.vegi || 0);
            } else if (p.status === 'nein') {
                countNein++;
            } else {
                countOffen++;
            }
            if (p.anwesend) {
                countAnwesend++;
                if (p.stimmberechtigt) countAnwesendStimm++;
            }
        });

        const absolutesMehr = countAnwesendStimm > 0 ? (Math.floor(countAnwesendStimm / 2) + 1) : 0;

        // Filtern nach Suche und Status
        const q = (state.participantsSearchQuery || '').toLowerCase().trim();
        const f = state.participantsFilter || 'alle';

        const filtered = participants.filter(p => {
            if (f === 'ja' && p.status !== 'ja') return false;
            if (f === 'nein' && p.status !== 'nein') return false;
            if (f === 'offen' && p.status !== 'offen') return false;
            if (f === 'anwesend' && !p.anwesend) return false;

            if (q) {
                const nameMatch = (p.name || '').toLowerCase().includes(q);
                const grundMatch = (p.grund || '').toLowerCase().includes(q);
                if (!nameMatch && !grundMatch) return false;
            }
            return true;
        });

        panel.innerHTML = `
            <!-- STATUS LEISTE -->
            <div class="d-flex justify-content-between align-items-center mb-2.5 flex-wrap gap-2">
                <div>
                    <span class="small fw-bold text-muted text-uppercase">Anmeldungen &amp; Präsenzkontrolle ${curYear}:</span>
                    <div class="small text-muted">
                        ${linkedEvent ? `<i class="fas fa-link text-primary me-1"></i>Verknüpft: <strong>${escapeHtml(linkedEvent.title)}</strong>` : '<span class="text-danger fw-bold"><i class="fas fa-exclamation-triangle me-1"></i>Kein Event verknüpft (in Stammdaten wählen)</span>'}
                    </div>
                </div>
                <div class="d-flex gap-1.5">
                    <button class="btn btn-xs btn-outline-secondary px-2 py-1" onclick="gvDossierReloadParticipants()" title="Teilnehmerliste neu laden">
                        <i class="fas fa-sync-alt me-1"></i> Aktualisieren
                    </button>
                </div>
            </div>

            <!-- KENNZAHLEN CARDS -->
            <div class="card p-2.5 bg-light border rounded-3 mb-2.5">
                <div class="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-2">
                    <div class="d-flex gap-2 flex-wrap">
                        <span class="badge bg-success-subtle text-success border border-success-subtle py-1 px-2"><i class="fas fa-check-circle me-1"></i>Zugesagt: ${countJa}</span>
                        <span class="badge bg-danger-subtle text-danger border border-danger-subtle py-1 px-2"><i class="fas fa-times-circle me-1"></i>Abgesagt: ${countNein}</span>
                        <span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle py-1 px-2"><i class="fas fa-question-circle me-1"></i>Offen: ${countOffen}</span>
                    </div>
                    <span class="badge bg-primary text-white py-1 px-2.5 shadow-xs" style="cursor:pointer;" onclick="gvDossierSetRightTab('preview-wirt')" title="Menübestellung für den Wirt anzeigen">
                        <i class="fas fa-utensils me-1"></i> Essen: ${countEssen + countVegi} (🥩 ${countEssen} | 🥗 ${countVegi})
                    </span>
                </div>
                <div class="d-flex justify-content-between align-items-center small text-dark border-top pt-1.5 flex-wrap gap-1">
                    <div>
                        <i class="fas fa-user-check text-primary me-1"></i> Vor Ort anwesend: <strong>${countAnwesend}</strong>
                        <span class="text-muted ms-1">(${countAnwesendStimm} stimmberechtigt)</span>
                    </div>
                    <div>
                        🗳️ Absolutes Mehr: <strong class="text-primary">${countAnwesendStimm > 0 ? absolutesMehr : 0} Stimmen</strong>
                    </div>
                </div>
            </div>

            <!-- FILTER & SUCHE -->
            <div class="d-flex flex-wrap gap-2 align-items-center mb-2">
                <div class="input-group input-group-sm flex-grow-1" style="min-width: 140px;">
                    <span class="input-group-text bg-white border-end-0"><i class="fas fa-search text-muted"></i></span>
                    <input type="text" class="form-control border-start-0 ps-0" placeholder="Mitglied suchen..." value="${escapeHtml(state.participantsSearchQuery || '')}" oninput="gvDossierSearchParticipants(this.value)">
                </div>
                <div class="btn-group btn-group-sm" role="group">
                    <button type="button" class="btn ${f === 'alle' ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="gvDossierFilterParticipants('alle')">Alle (${participants.length})</button>
                    <button type="button" class="btn ${f === 'ja' ? 'btn-success fw-bold text-white' : 'btn-outline-success'}" onclick="gvDossierFilterParticipants('ja')">Ja (${countJa})</button>
                    <button type="button" class="btn ${f === 'nein' ? 'btn-danger fw-bold text-white' : 'btn-outline-danger'}" onclick="gvDossierFilterParticipants('nein')">Nein (${countNein})</button>
                    <button type="button" class="btn ${f === 'offen' ? 'btn-secondary fw-bold text-white' : 'btn-outline-secondary'}" onclick="gvDossierFilterParticipants('offen')">Offen (${countOffen})</button>
                    <button type="button" class="btn ${f === 'anwesend' ? 'btn-info fw-bold text-white' : 'btn-outline-info'}" onclick="gvDossierFilterParticipants('anwesend')">Vor Ort (${countAnwesend})</button>
                </div>
            </div>

            <!-- TABELLE -->
            <div class="table-responsive border rounded-3 bg-white" style="max-height: 410px;">
                <table class="table table-sm table-hover align-middle mb-0">
                    <thead class="table-light sticky-top">
                        <tr>
                            <th>Name</th>
                            <th>Rückmeldung</th>
                            <th>Essen</th>
                            <th class="text-center" title="Vor Ort am GV-Abend anwesend">Vor Ort</th>
                            <th class="text-end" style="width: 90px;">Aktion</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filtered.length === 0 ? `
                            <tr><td colspan="5" class="text-center text-muted py-3">Keine passenden Mitglieder gefunden.</td></tr>
                        ` : filtered.map(p => {
                            const isJa = p.status === 'ja';
                            const isNein = p.status === 'nein';

                            let statusBadge = '<span class="badge bg-secondary-subtle text-secondary border">Offen</span>';
                            if (isJa) {
                                statusBadge = '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="fas fa-check me-1"></i>Ja</span>';
                            } else if (isNein) {
                                statusBadge = `<span class="badge bg-danger-subtle text-danger border border-danger-subtle"><i class="fas fa-times me-1"></i>Nein</span>${p.grund ? `<div class="text-muted fst-italic mt-0.5" style="font-size:0.72rem;">💬 ${escapeHtml(p.grund)}</div>` : ''}`;
                            }

                            let essenBadge = '-';
                            if (isJa) {
                                const parts = [];
                                if (p.essen > 0) parts.push(`${p.essen}x Fleisch`);
                                if (p.vegi > 0) parts.push(`${p.vegi}x Vegi`);
                                essenBadge = parts.length > 0 ? `<span class="small fw-semibold text-dark">${parts.join(', ')}</span>` : '<span class="text-muted small">Kein</span>';
                            }

                            return `
                            <tr>
                                <td>
                                    <div class="fw-semibold text-dark small">${escapeHtml(p.name)}</div>
                                    <div class="text-muted" style="font-size:0.7rem;">PN: ${escapeHtml(p.person_number || '-')}</div>
                                </td>
                                <td>${statusBadge}</td>
                                <td>${essenBadge}</td>
                                <td class="text-center">
                                    <div class="form-check form-switch d-inline-block mb-0">
                                        <input class="form-check-input" type="checkbox" role="switch" ${p.anwesend ? 'checked' : ''} onchange="gvDossierToggleAnwesend('${p.person_number}', this.checked)" title="Vor Ort anwesend">
                                    </div>
                                </td>
                                <td class="text-end">
                                    <div class="btn-group btn-group-sm">
                                        ${!isNein ? `
                                            <button type="button" class="btn btn-xs btn-outline-danger p-1" title="Schnell als Abgemeldet eintragen" onclick="gvDossierOpenRSVPModal('${p.person_number}', 'nein', 'Abmeldung via E-Mail')">
                                                <i class="fas fa-envelope-open-text"></i>
                                            </button>
                                        ` : ''}
                                        <button type="button" class="btn btn-xs btn-outline-secondary p-1" title="Teilnahme manuell bearbeiten" onclick="gvDossierOpenRSVPModal('${p.person_number}')">
                                            <i class="fas fa-edit"></i>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        `;
    }

    /**
     * Rendert das aktive rechte Panel (Live E-Mail oder PDF-Vorschau)
     */
    function renderRightPanel() {
        const panel = document.getElementById('gvRightTabContent');
        if (!panel) return;

        const state = window._gvDossierState;
        const curMember = state.members.find(m => m.id === state.selectedMemberId) || state.members[0] || {};

        // RECHTE VORSCHAU: WIRT & GASTRONOMIE
        if (state.activeRightTab === 'preview-wirt') {
            const participants = state.participantsData || [];
            const eaters = participants.filter(p => p.status === 'ja' && (p.essen > 0 || p.vegi > 0));
            const totalEssen = eaters.reduce((sum, p) => sum + (p.essen || 0), 0);
            const totalVegi = eaters.reduce((sum, p) => sum + (p.vegi || 0), 0);
            const grandTotal = totalEssen + totalVegi;

            const clipboardText = `Generalversammlung ${state.year} - Menübestellung für den Wirt\n` +
                `Datum: ${state.gvInstance?.datum || 'Gemäss Programm'}\n` +
                `Total Essen: ${grandTotal}\n` +
                `- Standard (Fleisch): ${totalEssen}\n` +
                `- Vegetarisch (Vegi): ${totalVegi}\n\n` +
                `Teilnehmerliste Essen:\n` +
                eaters.map((e, idx) => `${idx + 1}. ${e.name} (${e.essen > 0 ? e.essen + 'x Fleisch' : ''}${e.essen > 0 && e.vegi > 0 ? ', ' : ''}${e.vegi > 0 ? e.vegi + 'x Vegi' : ''})`).join('\n');

            panel.innerHTML = `
                <div class="p-4 overflow-auto" style="max-height: 580px;">
                    <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                        <div>
                            <h6 class="fw-bold text-dark mb-0"><i class="fas fa-utensils text-primary me-2"></i>Menübestellung für den Schützenstuben-Wirt</h6>
                            <span class="small text-muted">Aus den Anmeldungen der Generalversammlung ${state.year}</span>
                        </div>
                        <button class="btn btn-sm btn-outline-primary" onclick="navigator.clipboard.writeText(${JSON.stringify(clipboardText)}); if(typeof showToast==='function') showToast('📋 In Zwischenablage kopiert!', 'success');">
                            <i class="fas fa-copy me-1"></i> Kopieren
                        </button>
                    </div>

                    <div class="row g-2 mb-3">
                        <div class="col-4">
                            <div class="card p-2 text-center bg-light border-0 rounded-3">
                                <div class="fs-4 fw-bold text-primary">${grandTotal}</div>
                                <div class="text-muted" style="font-size:0.75rem;">Total Menüs</div>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="card p-2 text-center bg-light border-0 rounded-3">
                                <div class="fs-4 fw-bold text-success">${totalEssen}</div>
                                <div class="text-muted" style="font-size:0.75rem;">🥩 Fleisch</div>
                            </div>
                        </div>
                        <div class="col-4">
                            <div class="card p-2 text-center bg-light border-0 rounded-3">
                                <div class="fs-4 fw-bold text-info">${totalVegi}</div>
                                <div class="text-muted" style="font-size:0.75rem;">🥗 Vegi</div>
                            </div>
                        </div>
                    </div>

                    <div class="table-responsive border rounded-3 bg-white">
                        <table class="table table-sm table-striped align-middle mb-0">
                            <thead class="table-light">
                                <tr>
                                    <th>#</th>
                                    <th>Name</th>
                                    <th>Fleisch</th>
                                    <th>Vegi</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${eaters.length === 0 ? `
                                    <tr><td colspan="4" class="text-center py-4 text-muted">Noch keine Essensbestellungen vorhanden.</td></tr>
                                ` : eaters.map((e, idx) => `
                                    <tr>
                                        <td class="text-muted small">${idx + 1}</td>
                                        <td class="fw-semibold">${escapeHtml(e.name)}</td>
                                        <td>${e.essen > 0 ? `<span class="badge bg-success-subtle text-success border">${e.essen}x Fleisch</span>` : '-'}</td>
                                        <td>${e.vegi > 0 ? `<span class="badge bg-info-subtle text-info border">${e.vegi}x Vegi</span>` : '-'}</td>
                                    </tr>
                                `).join('')}
                            </tbody>
                        </table>
                    </div>
                </div>
            `;
            return;
        }

        if (state.activeRightTab === 'preview-pdf') {
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
                            Klicken Sie im Reiter <strong>„Beilagen“</strong> auf <strong>„Gesamtes GV-Dossier jetzt kompilieren“</strong>, um die Einladung mit allen Berichten zu einem gestempelten Gesamt-PDF zusammenzuführen.
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

    // =========================================================================
    // TRAKTANDEN MANAGER: AKTIONEN & MODALS
    // =========================================================================

    /**
     * Modal zum Hinzufügen eines neuen Haupt- oder Untertraktandums
     */
    window.gvDossierAddTraktandumModal = function (parentId) {
        const state = window._gvDossierState;
        const allItems = state.traktanden || [];
        const isSub = Boolean(parentId);
        let parentItem = null;
        let defaultNummer = '1';

        if (isSub) {
            parentItem = allItems.find(t => t.id === parentId);
            const siblings = allItems.filter(t => t.parent_id === parentId);
            const parentNum = parentItem ? (parentItem.nummer || '1') : '1';
            defaultNummer = `${parentNum}.${siblings.length + 1}`;
        } else {
            const mainItems = allItems.filter(t => !t.parent_id);
            defaultNummer = String(mainItems.length + 1);
        }

        const modalHtml = `
            <div class="modal fade show" id="gvTraktandumModal" tabindex="-1" style="display:block; background:rgba(0,0,0,0.5);" aria-modal="true" role="dialog">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 rounded-4 shadow-lg">
                        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
                            <h5 class="modal-title fw-bold">
                                <i class="fas fa-${isSub ? 'indent' : 'plus-circle'} me-2"></i>
                                ${isSub ? `Untertraktandum zu "${escapeHtml(parentItem?.titel || '')}"` : 'Neues Haupttraktandum'}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" onclick="gvDossierCloseModal()"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="gvTraktandumForm" onsubmit="event.preventDefault(); gvDossierSaveNewTraktandum('${parentId || ''}');">
                                <div class="row g-2 mb-3">
                                    <div class="col-4">
                                        <label class="form-label small fw-bold text-muted">Nummer</label>
                                        <input type="text" id="trModalNummer" class="form-control form-control-sm fw-bold text-primary" value="${escapeHtml(defaultNummer)}" required>
                                    </div>
                                    <div class="col-8">
                                        <label class="form-label small fw-bold text-muted">Referent / Zuständig</label>
                                        <input type="text" id="trModalReferent" class="form-control form-control-sm" placeholder="z. B. Präsident, Kassier" list="gvReferentenList">
                                        <datalist id="gvReferentenList">
                                            <option value="Präsident">
                                            <option value="Schützenmeister">
                                            <option value="Jungschützenleiterin">
                                            <option value="Kassier">
                                            <option value="Rechnungsrevisoren">
                                            <option value="Aktuar">
                                        </datalist>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-muted">Titel des Traktandums</label>
                                    <input type="text" id="trModalTitel" class="form-control" placeholder="z. B. Mutationen oder Décharge-Erteilung" required autofocus>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-muted">Beschreibung / Antrag (Optional)</label>
                                    <textarea id="trModalText" class="form-control form-control-sm" rows="3" placeholder="Zusätzliche Erläuterungen oder Beschlussanträge..."></textarea>
                                </div>
                                <div class="d-flex justify-content-end gap-2 pt-2 border-top">
                                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="gvDossierCloseModal()">Abbrechen</button>
                                    <button type="submit" class="btn btn-sm btn-primary fw-bold px-3">
                                        <i class="fas fa-check me-1"></i> Speichern
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('gv-dossier-modal-container').innerHTML = modalHtml;
    };

    /**
     * Schliesst das aktive Modal
     */
    window.gvDossierCloseModal = function () {
        const container = document.getElementById('gv-dossier-modal-container');
        if (container) container.innerHTML = '';
    };

    /**
     * Neues Traktandum in public.gv_traktanden einfügen
     */
    window.gvDossierSaveNewTraktandum = async function (parentId) {
        const supa = getSupabase();
        if (!supa) return;

        const state = window._gvDossierState;
        const gvId = state.gvInstance?.id || `gv_${state.year}`;
        const nummer = document.getElementById('trModalNummer')?.value.trim();
        const titel = document.getElementById('trModalTitel')?.value.trim();
        const referent = document.getElementById('trModalReferent')?.value.trim();
        const beschreibung = document.getElementById('trModalText')?.value.trim();

        if (!titel) {
            alert("Bitte einen Titel angeben.");
            return;
        }

        const allItems = state.traktanden || [];
        const nextSort = allItems.length + 1;
        const newId = `tr_${state.year}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;

        try {
            const { error } = await supa.from('gv_traktanden').insert({
                id: newId,
                gv_id: gvId,
                parent_id: parentId || null,
                sort_order: nextSort,
                nummer: nummer || '1',
                titel: titel,
                beschreibung: beschreibung || null,
                referent: referent || null,
                status: 'offen'
            });

            if (error) throw error;

            gvDossierCloseModal();
            if (typeof showToast === 'function') showToast("Traktandum erfolgreich erfasst!", 'success');
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Speichern des Traktandums:", err);
            alert("Fehler beim Speichern: " + err.message);
        }
    };

    /**
     * Modal zum Bearbeiten eines bestehenden Traktandums
     */
    window.gvDossierEditTraktandumModal = function (trId) {
        const state = window._gvDossierState;
        const item = (state.traktanden || []).find(t => t.id === trId);
        if (!item) return;

        const isSub = Boolean(item.parent_id);

        const modalHtml = `
            <div class="modal fade show" id="gvTraktandumModal" tabindex="-1" style="display:block; background:rgba(0,0,0,0.5);" aria-modal="true" role="dialog">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 rounded-4 shadow-lg">
                        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
                            <h5 class="modal-title fw-bold">
                                <i class="fas fa-pencil-alt me-2"></i> Traktandum bearbeiten
                            </h5>
                            <button type="button" class="btn-close btn-close-white" onclick="gvDossierCloseModal()"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="gvTraktandumEditForm" onsubmit="event.preventDefault(); gvDossierUpdateTraktandum('${trId}');">
                                <div class="row g-2 mb-3">
                                    <div class="col-4">
                                        <label class="form-label small fw-bold text-muted">Nummer</label>
                                        <input type="text" id="trModalNummer" class="form-control form-control-sm fw-bold text-primary" value="${escapeHtml(item.nummer || '')}" required>
                                    </div>
                                    <div class="col-8">
                                        <label class="form-label small fw-bold text-muted">Referent / Zuständig</label>
                                        <input type="text" id="trModalReferent" class="form-control form-control-sm" value="${escapeHtml(item.referent || '')}" list="gvReferentenList">
                                        <datalist id="gvReferentenList">
                                            <option value="Präsident">
                                            <option value="Schützenmeister">
                                            <option value="Jungschützenleiterin">
                                            <option value="Kassier">
                                            <option value="Rechnungsrevisoren">
                                            <option value="Aktuar">
                                        </datalist>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-muted">Titel des Traktandums</label>
                                    <input type="text" id="trModalTitel" class="form-control" value="${escapeHtml(item.titel || '')}" required>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-muted">Beschreibung / Antrag (Optional)</label>
                                    <textarea id="trModalText" class="form-control form-control-sm" rows="3">${escapeHtml(item.beschreibung || '')}</textarea>
                                </div>
                                <div class="d-flex justify-content-end gap-2 pt-2 border-top">
                                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="gvDossierCloseModal()">Abbrechen</button>
                                    <button type="submit" class="btn btn-sm btn-primary fw-bold px-3">
                                        <i class="fas fa-check me-1"></i> Änderungen speichern
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('gv-dossier-modal-container').innerHTML = modalHtml;
    };

    /**
     * Traktandum aktualisieren
     */
    window.gvDossierUpdateTraktandum = async function (trId) {
        const supa = getSupabase();
        if (!supa) return;

        const nummer = document.getElementById('trModalNummer')?.value.trim();
        const titel = document.getElementById('trModalTitel')?.value.trim();
        const referent = document.getElementById('trModalReferent')?.value.trim();
        const beschreibung = document.getElementById('trModalText')?.value.trim();

        if (!titel) {
            alert("Bitte einen Titel angeben.");
            return;
        }

        try {
            const { error } = await supa.from('gv_traktanden').update({
                nummer: nummer || '1',
                titel: titel,
                beschreibung: beschreibung || null,
                referent: referent || null,
                updated_at: new Date().toISOString()
            }).eq('id', trId);

            if (error) throw error;

            gvDossierCloseModal();
            if (typeof showToast === 'function') showToast("Traktandum aktualisiert!", 'success');
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Aktualisieren des Traktandums:", err);
            alert("Fehler beim Aktualisieren: " + err.message);
        }
    };

    /**
     * Traktandum nach oben oder unten verschieben (Tauscht sort_order mit dem Nachbarn auf gleicher Ebene)
     */
    window.gvDossierMoveTraktandum = async function (trId, direction) {
        const supa = getSupabase();
        if (!supa) return;

        const state = window._gvDossierState;
        const allItems = state.traktanden || [];
        const currentItem = allItems.find(t => t.id === trId);
        if (!currentItem) return;

        // Geschwister-Elemente (gleicher parent_id)
        const siblings = allItems
            .filter(t => t.parent_id === currentItem.parent_id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const currentIndex = siblings.findIndex(t => t.id === trId);
        if (currentIndex === -1) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= siblings.length) return;

        const targetItem = siblings[targetIndex];

        // Sort Orders tauschen
        const currentOrder = currentItem.sort_order || (currentIndex + 1);
        const targetOrder = targetItem.sort_order || (targetIndex + 1);

        try {
            await Promise.all([
                supa.from('gv_traktanden').update({ sort_order: targetOrder }).eq('id', currentItem.id),
                supa.from('gv_traktanden').update({ sort_order: currentOrder }).eq('id', targetItem.id)
            ]);

            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Verschieben:", err);
            alert("Verschieben fehlgeschlagen: " + err.message);
        }
    };

    /**
     * Traktandum löschen (Untertraktanden werden per CASCADE gelöscht)
     */
    window.gvDossierDeleteTraktandum = async function (trId) {
        const state = window._gvDossierState;
        const item = (state.traktanden || []).find(t => t.id === trId);
        if (!item) return;

        const hasChildren = (state.traktanden || []).some(t => t.parent_id === trId);
        const msg = hasChildren
            ? `Möchtest du das Traktandum "${item.titel}" und ALLE dazugehörigen Untertraktanden wirklich löschen?`
            : `Möchtest du das Traktandum "${item.titel}" wirklich löschen?`;

        if (!confirm(msg)) return;

        const supa = getSupabase();
        if (!supa) return;

        try {
            const { error } = await supa.from('gv_traktanden').delete().eq('id', trId);
            if (error) throw error;

            if (typeof showToast === 'function') showToast("Traktandum gelöscht.", 'info');
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Löschfehler:", err);
            alert("Löschen fehlgeschlagen: " + err.message);
        }
    };

    /**
     * Standard-Traktanden aus Vorlage in public.gv_traktanden laden
     */
    window.gvDossierSeedDefaultTraktanden = async function (isWahljahr) {
        const supa = getSupabase();
        if (!supa) return;

        const state = window._gvDossierState;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;

        const defaultNormal = [
            { num: '1', title: 'Begrüssung und Appell', ref: 'Präsident', text: 'Eröffnung der Versammlung und Feststellung der Beschlussfähigkeit.' },
            { num: '2', title: 'Wahl der Stimmenzähler', ref: 'Präsident', text: 'Bestimmung der Stimmenzähler für offene und geheime Wahlen.' },
            { num: '3', title: `Genehmigung des Protokolls der GV ${curYear - 1}`, ref: 'Aktuar', text: 'Genehmigung des Vorjahres-Protokolls.' },
            { num: '4', title: 'Mutationen (Aufnahmen, Austritte, Ehrungen)', ref: 'Präsident', text: 'Aufnahme neuer Mitglieder und Totengedenken.' },
            { num: '5', title: 'Jahresberichte', ref: 'Präsident', text: 'Berichte des Vorstands und der Spartenleiter.' },
            { num: '6', title: `Jahresrechnung ${curYear - 1} und Revisorenbericht`, ref: 'Kassier', text: 'Abnahme der Jahresrechnung und Décharge-Erteilung.' },
            { num: '7', title: `Budget ${curYear} und Festsetzung der Jahresbeiträge`, ref: 'Kassier', text: 'Genehmigung des Voranschlags und der Beiträge.' },
            { num: '8', title: `Tätigkeitsprogramm & Jahresmeisterschaft ${curYear}`, ref: 'Schützenmeister', text: 'Vorstellung und Festlegung des Schiesskalenders.' },
            { num: '9', title: 'Anträge von Mitgliedern', ref: 'Präsident', text: 'Behandlung statutengemäss eingereichter Anträge.' },
            { num: '10', title: 'Ehrungen und Auszeichnungen', ref: 'Präsident', text: 'Würdigung verdienter Schützen und Jubilare.' },
            { num: '11', title: 'Verschiedenes und Umfrage', ref: 'Präsident', text: 'Allgemeine Wortmeldungen.' }
        ];

        const defaultWahl = [
            ...defaultNormal.slice(0, 7),
            { num: '8', title: 'Gesamterneuerungswahlen', ref: 'Tagespräsident', text: 'Wahl des Präsidenten, der Vorstandsmitglieder und Revisoren.' },
            ...defaultNormal.slice(7).map((item, idx) => ({ ...item, num: String(idx + 9) }))
        ];

        const selectedList = isWahljahr ? defaultWahl : defaultNormal;

        try {
            const rows = selectedList.map((item, idx) => ({
                id: `tr_${curYear}_${idx + 1}`,
                gv_id: gvId,
                parent_id: null,
                sort_order: idx + 1,
                nummer: item.num,
                titel: item.title,
                referent: item.ref,
                beschreibung: item.text,
                status: 'offen'
            }));

            const { error } = await supa.from('gv_traktanden').upsert(rows, { onConflict: 'id' });
            if (error) throw error;

            if (typeof showSuccess === 'function') showSuccess("Standard-Traktanden erfolgreich geladen!");
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Laden der Standard-Traktanden:", err);
            alert("Fehler: " + err.message);
        }
    };

    // =========================================================================
    // STAMMDATEN: SPEICHERN
    // =========================================================================

    /**
     * Speichert die Stammdaten in public.gv_instances
     */
    window.gvDossierSaveStammdaten = async function () {
        const supa = getSupabase();
        if (!supa) return;

        const state = window._gvDossierState;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;

        const number = parseInt(document.getElementById('gv-stamm-number')?.value, 10) || 100;
        const datum = document.getElementById('gv-stamm-datum')?.value || null;
        const zeit = document.getElementById('gv-stamm-zeit')?.value.trim() || '19:30';
        const ort = document.getElementById('gv-stamm-ort')?.value.trim() || 'Schützenhaus Muhen';
        const is_election_year = Boolean(document.getElementById('gv-stamm-wahljahr')?.checked);
        const datum_vorjahr = document.getElementById('gv-stamm-vorjahr')?.value || null;
        const abmelde_datum = document.getElementById('gv-stamm-abmeldung')?.value || null;
        const mahn_datum = document.getElementById('gv-stamm-mahnung')?.value || null;
        const linked_event_id = document.getElementById('gv-stamm-linked-event')?.value || null;
        const praesident_wort = document.getElementById('gv-stamm-praesident-wort')?.value || '';
        const budget_text = document.getElementById('gv-stamm-budget-text')?.value || '';
        const vorstand_mails = (document.getElementById('gv-stamm-vorstand-mails')?.value || '')
            .split(';')
            .map(x => x.trim())
            .filter(Boolean);

        try {
            const { error } = await supa.from('gv_instances').upsert({
                id: gvId,
                year: curYear,
                number: number,
                datum: datum,
                zeit: zeit,
                ort: ort,
                is_election_year: is_election_year,
                datum_vorjahr: datum_vorjahr,
                abmelde_datum: abmelde_datum,
                mahn_datum: mahn_datum,
                linked_event_id: linked_event_id,
                praesident_wort: praesident_wort,
                budget_text: budget_text,
                vorstand_mails: vorstand_mails,
                updated_at: new Date().toISOString()
            }, { onConflict: 'year' });

            if (error) throw error;

            if (typeof showSuccess === 'function') showSuccess("GV-Stammdaten erfolgreich gespeichert!");
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Speichern der Stammdaten:", err);
            alert("Speichern fehlgeschlagen: " + err.message);
        }
    };

    // =========================================================================
    // BEILAGEN, E-MAIL & VERSAND (BESTEHENDE CORE-FUNKTIONEN)
    // =========================================================================

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

                const { error: upErr } = await supa.storage
                    .from('campaign-assets')
                    .upload(storagePath, file, { contentType: 'application/pdf', upsert: true });

                if (upErr) throw upErr;

                const { data: urlData } = supa.storage.from('campaign-assets').getPublicUrl(storagePath);
                const publicUrl = urlData?.publicUrl || storagePath;

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

    window.gvDossierDeleteAttachment = async function (attId) {
        if (!confirm("Möchtest du diese Beilage wirklich aus dem Dossier entfernen?")) return;
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
                gvId: state.gvInstance?.id || `gv_${year}`,
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

    window.gvDossierStartCampaignDispatch = async function () {
        const state = window._gvDossierState;
        const validMembers = state.members.filter(m => m.primary_email && m.primary_email.includes('@'));

        if (!validMembers.length) {
            alert("Keine aktiven Mitglieder mit gültiger E-Mail-Adresse gefunden.");
            return;
        }

        if (!state.compiledPdfUrl) {
            if (!confirm("⚠️ Achtung: Es wurde noch kein Master-Dossier kompiliert!\n\nMöchtest du den Massenversand trotzdem starten?")) {
                return;
            }
        }

        if (!confirm(`🚀 Massenversand freigeben:\n\nEs werden ${validMembers.length} E-Mails via zentrale Mail-Engine versendet.\n\nMöchtest du den Versand jetzt definitiv starten?`)) {
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

    window.gvDossierSetYear = async function (newYear) {
        window._gvDossierState.year = parseInt(newYear, 10) || new Date().getFullYear();
        await loadGVDossierData();
        renderGVDossierWorkspace();
    };

    window.gvDossierReload = async function () {
        await loadGVDossierData();
        renderGVDossierWorkspace();
    };

    // =========================================================================
    // ANMELDUNGEN & PRÄSENZKONTROLLE AKTIONEN
    // =========================================================================

    window.gvDossierToggleAnwesend = async function (personNumber, isAnwesend) {
        const supa = getSupabase();
        if (!supa) return;
        const state = window._gvDossierState;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;

        const p = (state.participantsData || []).find(x => String(x.person_number) === String(personNumber));
        if (!p) return;
        p.anwesend = isAnwesend;

        try {
            await supa.from('gv_praesenz').upsert({
                id: `praesenz_${curYear}_${personNumber}`,
                gv_id: gvId,
                person_number: String(personNumber),
                name: p.name,
                lizenz: p.lizenz,
                anwesend: isAnwesend,
                anmeldung_status: p.status,
                essen: p.essen || 0,
                vegi: p.vegi || 0,
                grund: p.grund || '',
                stimmberechtigt: p.stimmberechtigt !== false,
                updated_at: new Date().toISOString()
            }, { onConflict: 'gv_id,person_number' });

            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Aktualisieren der Anwesenheit:", err);
            alert("Fehler bei Anwesenheit: " + err.message);
        }
    };

    window.gvDossierFilterParticipants = function (fKey) {
        window._gvDossierState.participantsFilter = fKey;
        renderLeftPanel();
    };

    window.gvDossierSearchParticipants = function (q) {
        window._gvDossierState.participantsSearchQuery = q;
        renderLeftPanel();
    };

    window.gvDossierReloadParticipants = async function () {
        await loadGVParticipantsData(true);
        renderLeftPanel();
        if (window._gvDossierState.activeRightTab === 'preview-wirt') renderRightPanel();
    };

    window.gvDossierOnLinkedEventChange = async function (newEventId) {
        const state = window._gvDossierState;
        if (!state.gvInstance) state.gvInstance = {};
        state.gvInstance.linked_event_id = newEventId;
        await loadGVParticipantsData(true);
        renderLeftPanel();
        if (state.activeRightTab === 'preview-wirt') renderRightPanel();
    };

    window.gvDossierOpenRSVPModal = function (personNumber, defaultStatus = null, defaultReason = null) {
        const state = window._gvDossierState;
        const p = (state.participantsData || []).find(x => String(x.person_number) === String(personNumber));
        if (!p) return;

        const curStatus = defaultStatus || p.status || 'offen';
        const curGrund = defaultReason || p.grund || '';

        const modalHtml = `
            <div class="modal fade show" id="gvRSVPModal" tabindex="-1" style="display:block; background:rgba(0,0,0,0.5);" aria-modal="true" role="dialog">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 rounded-4 shadow-lg">
                        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
                            <h5 class="modal-title fw-bold">
                                <i class="fas fa-user-check me-2"></i>GV-Teilnahme: ${escapeHtml(p.name)}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" onclick="gvDossierCloseModal()"></button>
                        </div>
                        <div class="modal-body p-4">
                            <input type="hidden" id="gv-modal-pn" value="${escapeHtml(personNumber)}">
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-muted">Teilnahmestatus</label>
                                <div class="btn-group w-100" role="group">
                                    <input type="radio" class="btn-check" name="gv-modal-status-radio" id="gv-m-radio-ja" value="ja" ${curStatus === 'ja' ? 'checked' : ''} onchange="gvDossierRSVPStatusChanged('ja')">
                                    <label class="btn btn-outline-success fw-bold" for="gv-m-radio-ja">✅ Zusage (Ja)</label>

                                    <input type="radio" class="btn-check" name="gv-modal-status-radio" id="gv-m-radio-nein" value="nein" ${curStatus === 'nein' ? 'checked' : ''} onchange="gvDossierRSVPStatusChanged('nein')">
                                    <label class="btn btn-outline-danger fw-bold" for="gv-m-radio-nein">❌ Absage (Nein)</label>

                                    <input type="radio" class="btn-check" name="gv-modal-status-radio" id="gv-m-radio-offen" value="offen" ${curStatus === 'offen' ? 'checked' : ''} onchange="gvDossierRSVPStatusChanged('offen')">
                                    <label class="btn btn-outline-secondary" for="gv-m-radio-offen">❓ Offen</label>
                                </div>
                            </div>

                            <!-- ZUSAGE BEREICH (MENÜS) -->
                            <div id="gv-modal-sec-ja" class="p-3 bg-light rounded-3 border mb-3 ${curStatus === 'ja' ? '' : 'd-none'}">
                                <div class="fw-bold small text-dark mb-2"><i class="fas fa-utensils text-primary me-1"></i>Menüauswahl (Wirt):</div>
                                <div class="row g-2">
                                    <div class="col-6">
                                        <label class="form-label small text-muted mb-1">🥩 Standard (Fleisch)</label>
                                        <input type="number" id="gv-modal-essen" class="form-control form-control-sm text-center" min="0" max="10" value="${p.essen || (curStatus === 'ja' ? 1 : 0)}">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small text-muted mb-1">🥗 Vegetarisch</label>
                                        <input type="number" id="gv-modal-vegi" class="form-control form-control-sm text-center" min="0" max="10" value="${p.vegi || 0}">
                                    </div>
                                </div>
                            </div>

                            <!-- ABSAGE BEREICH (GRUND) -->
                            <div id="gv-modal-sec-nein" class="p-3 bg-light rounded-3 border mb-3 ${curStatus === 'nein' ? '' : 'd-none'}">
                                <label class="form-label small fw-bold text-dark mb-1"><i class="fas fa-comment-alt text-danger me-1"></i>Begründung der Absage</label>
                                <select class="form-select form-select-sm mb-2" onchange="document.getElementById('gv-modal-grund').value = this.value">
                                    <option value="">-- Standard-Grund wählen --</option>
                                    <option value="Abmeldung via E-Mail" ${curGrund === 'Abmeldung via E-Mail' ? 'selected' : ''}>Abmeldung via E-Mail</option>
                                    <option value="Ferienhalber abwesend" ${curGrund === 'Ferienhalber abwesend' ? 'selected' : ''}>Ferienhalber abwesend</option>
                                    <option value="Beruflich verhindert" ${curGrund === 'Beruflich verhindert' ? 'selected' : ''}>Beruflich verhindert</option>
                                    <option value="Krankheitsbedingt" ${curGrund === 'Krankheitsbedingt' ? 'selected' : ''}>Krankheitsbedingt</option>
                                    <option value="Familiäre Verpflichtung" ${curGrund === 'Familiäre Verpflichtung' ? 'selected' : ''}>Familiäre Verpflichtung</option>
                                </select>
                                <input type="text" id="gv-modal-grund" class="form-control form-control-sm" placeholder="Details oder individueller Grund..." value="${escapeHtml(curGrund)}">
                            </div>

                            <div class="d-flex justify-content-end gap-2 pt-2 border-top">
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="gvDossierCloseModal()">Abbrechen</button>
                                <button type="button" class="btn btn-sm btn-primary fw-bold px-3" onclick="gvDossierSaveRSVPModal()">Speichern</button>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.getElementById('gv-dossier-modal-container').innerHTML = modalHtml;
    };

    window.gvDossierRSVPStatusChanged = function (status) {
        const secJa = document.getElementById('gv-modal-sec-ja');
        const secNein = document.getElementById('gv-modal-sec-nein');
        if (secJa) secJa.classList.toggle('d-none', status !== 'ja');
        if (secNein) secNein.classList.toggle('d-none', status !== 'nein');
    };

    window.gvDossierSaveRSVPModal = async function () {
        const supa = getSupabase();
        if (!supa) return;

        const state = window._gvDossierState;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;
        const eventId = state.gvInstance?.linked_event_id;

        const pn = document.getElementById('gv-modal-pn')?.value;
        const p = (state.participantsData || []).find(x => String(x.person_number) === String(pn));
        if (!p) return;

        let statusVal = 'offen';
        if (document.getElementById('gv-m-radio-ja')?.checked) statusVal = 'ja';
        if (document.getElementById('gv-m-radio-nein')?.checked) statusVal = 'nein';

        const essenVal = statusVal === 'ja' ? (parseInt(document.getElementById('gv-modal-essen')?.value, 10) || 0) : 0;
        const vegiVal = statusVal === 'ja' ? (parseInt(document.getElementById('gv-modal-vegi')?.value, 10) || 0) : 0;
        const countVal = statusVal === 'ja' ? (essenVal + vegiVal || 1) : 0;
        const grundVal = statusVal === 'nein' ? (document.getElementById('gv-modal-grund')?.value.trim() || 'Abmeldung') : '';

        try {
            // 1. In poll_responses schreiben (falls Umfrage verknüpft)
            if (eventId && p.lizenz) {
                if (statusVal === 'offen') {
                    await supa.from('poll_responses')
                        .delete()
                        .eq('event_id', String(eventId))
                        .eq('lizenz', String(p.lizenz));
                    await supa.from('poll_responses_log').insert({
                        event_id: String(eventId),
                        lizenz: String(p.lizenz),
                        action: 'reset_to_open',
                        zeitstempel: new Date().toISOString()
                    });
                } else {
                    const isAttending = (statusVal === 'ja');
                    await supa.from('poll_responses').upsert({
                        event_id: String(eventId),
                        lizenz: String(p.lizenz),
                        attending: isAttending,
                        count: countVal,
                        essen: essenVal,
                        vegi: vegiVal,
                        grund: grundVal
                    }, { onConflict: 'event_id,lizenz' });

                    await supa.from('poll_responses_log').insert({
                        event_id: String(eventId),
                        lizenz: String(p.lizenz),
                        action: isAttending ? 'attending' : 'declined',
                        count: countVal,
                        essen: essenVal,
                        vegi: vegiVal,
                        grund: grundVal,
                        zeitstempel: new Date().toISOString()
                    });
                }
            }

            // 2. In gv_praesenz spiegeln
            await supa.from('gv_praesenz').upsert({
                id: `praesenz_${curYear}_${p.person_number}`,
                gv_id: gvId,
                person_number: String(p.person_number),
                name: p.name,
                lizenz: p.lizenz,
                anwesend: p.anwesend,
                anmeldung_status: statusVal,
                essen: essenVal,
                vegi: vegiVal,
                grund: grundVal,
                stimmberechtigt: p.stimmberechtigt !== false,
                updated_at: new Date().toISOString()
            }, { onConflict: 'gv_id,person_number' });

            // 3. Lokalen State aktualisieren
            p.status = statusVal;
            p.essen = essenVal;
            p.vegi = vegiVal;
            p.grund = grundVal;

            gvDossierCloseModal();
            if (typeof showToast === 'function') showToast(`Rückmeldung für ${p.name} gespeichert!`, 'success');

            renderLeftPanel();
            if (state.activeRightTab === 'preview-wirt') renderRightPanel();
        } catch (err) {
            console.error("Fehler beim Speichern der Rückmeldung:", err);
            alert("Speichern fehlgeschlagen: " + err.message);
        }
    };

    console.log("🚀 [GV-Dossier] Modul geladen: window.renderGVDossierView aktiv mit Traktanden, Stammdaten & Anmeldungen.");
})();
