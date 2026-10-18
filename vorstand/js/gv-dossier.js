/**
 * gv-dossier.js
 * ==============================================================================
 * Generalversammlung (GV-Cockpit) & Dossier-Compiler
 * Projekt: Vereinsportal Sportschützen Muhen
 *
 * Enthält 5 Haupt-Bereiche (Left-Panel):
 * 1. Traktanden-Manager: SortableJS Drag & Drop, Hierarchische Haupt- und Untertraktanden,
 *    Vorjahresübernahme & dynamischer Wahljahr-Trigger. Single Source: public.gv_traktanden.
 * 2. GV-Stammdaten & Fristen: Nummer, Datum, Zeit, Ort, Wahljahr, Abmelde-/Mahndatum,
 *    verknüpftes RSVP-Event mit SaveButtonKit-Dirty-Tracking. Single Source: public.gv_instances.
 * 3. Dossier-Beilagen: PDF-Uploads für Berichte/Protokolle nach 'campaign-assets',
 *    SortableJS Reihenfolge & Button "Gesamtes GV-Dossier jetzt kompilieren & stempeln".
 * 4. E-Mail-Text & Kampagne: Betreff, ClubWysiwyg mit Platzhaltern, Test-Mail, Massenversand.
 * 5. Anmeldungen & Präsenzkontrolle: Live-Zusagen, Essen (Fleisch/Vegi), Vor-Ort-Check,
 *    druckfertige Präsenzliste (PDF & Mail an Aktuar), Zwischenstand-Mail an Vorstand.
 *
 * Rechtes Panel:
 * - Live-Monitor: Umschaltbar zwischen [ 📄 PDF-Vorschau ], [ ✉️ E-Mail-Vorschau ] und [ 🍽️ Gastronomie & Wirt ]
 * - Empfängerauswahl für Personalisierung
 * ==============================================================================
 */

(function () {
    window._gvDossierState = {
        year: new Date().getFullYear(),
        campaign: null,
        attachments: [],
        gvInstance: null,
        gvInstanceOriginal: null,
        traktanden: [],
        pollEvents: [],
        members: [],
        selectedMemberId: null,
        activeLeftTab: 'stammdaten',   // 'stammdaten' | 'traktanden' | 'einladung_pdf' | 'beilagen' | 'mail' | 'anmeldungen'
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
     * Formatiert ISO-Datum YYYY-MM-DD in deutsches Schweizer Format
     */
    function formatSwissDate(dateStr) {
        if (!dateStr) return '';
        const p = String(dateStr).split('-');
        if (p.length === 3) {
            const months = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];
            const mIdx = parseInt(p[1], 10) - 1;
            if (mIdx >= 0 && mIdx < 12) {
                return `${parseInt(p[2], 10)}. ${months[mIdx]} ${p[0]}`;
            }
        }
        return dateStr;
    }

    /**
     * Löst Datums-, Jahres- und Nummernplatzhalter in Traktanden dynamisch auf
     */
    function gvDossierResolveTraktandumText(text, customInstance = null) {
        if (!text) return '';
        const state = window._gvDossierState || {};
        const gv = customInstance || state.gvDraft || state.gvInstance || {};
        const curYear = gv.year || state.year || new Date().getFullYear();
        const datumVorjahr = gv.datum_vorjahr || '';
        
        let vorjahrDateFormatted = formatSwissDate(datumVorjahr);
        let vorjahrYear = curYear - 1;

        if (datumVorjahr) {
            if (datumVorjahr.includes('-')) {
                const parts = datumVorjahr.split('-');
                if (parts[0] && parts[0].length === 4) {
                    vorjahrYear = parseInt(parts[0], 10);
                }
            } else if (datumVorjahr.includes('.')) {
                const parts = datumVorjahr.split('.');
                if (parts[2] && parts[2].length === 4) {
                    vorjahrYear = parseInt(parts[2], 10);
                }
            } else {
                const parsed = new Date(datumVorjahr);
                if (!isNaN(parsed.getFullYear())) {
                    vorjahrYear = parsed.getFullYear();
                }
            }
        }
        if (!vorjahrDateFormatted) {
            vorjahrDateFormatted = `im März ${vorjahrYear}`;
        }

        const gvNummer = gv.number || 100;
        const gvNummerVorjahr = gvNummer ? (parseInt(gvNummer, 10) - 1) : 99;
        const amtsdauer = gv.amtsdauer_text || `Amtsdauer ${curYear}–${curYear + 2}`;

        return String(text)
            .replace(/\{\{\s*datum_vorjahr\s*\}\}/gi, vorjahrDateFormatted)
            .replace(/\{\s*datum_vorjahr\s*\}/gi, vorjahrDateFormatted)
            .replace(/\{\{\s*jahr_vorjahr\s*\}\}/gi, String(vorjahrYear))
            .replace(/\{\s*jahr_vorjahr\s*\}/gi, String(vorjahrYear))
            .replace(/\{\{\s*rechnungsjahr\s*\}\}/gi, String(vorjahrYear))
            .replace(/\{\s*rechnungsjahr\s*\}/gi, String(vorjahrYear))
            .replace(/\{\{\s*jahr\s*\}\}/gi, String(curYear))
            .replace(/\{\s*jahr\s*\}/gi, String(curYear))
            .replace(/\{\{\s*gv_jahr\s*\}\}/gi, String(curYear))
            .replace(/\{\s*gv_jahr\s*\}/gi, String(curYear))
            .replace(/\{\{\s*gv_nummer\s*\}\}/gi, String(gvNummer))
            .replace(/\{\s*gv_nummer\s*\}/gi, String(gvNummer))
            .replace(/\{\{\s*gv_nummer_vorjahr\s*\}\}/gi, String(gvNummerVorjahr))
            .replace(/\{\s*gv_nummer_vorjahr\s*\}/gi, String(gvNummerVorjahr))
            .replace(/\{\{\s*amtsdauer\s*\}\}/gi, String(amtsdauer))
            .replace(/\{\s*amtsdauer\s*\}/gi, String(amtsdauer));
    }
    window.gvDossierResolveTraktandumText = gvDossierResolveTraktandumText;

    /**
     * Fügt einen Platzhalter in das Traktandum-Titelfeld ein
     */
    window.gvDossierInsertTraktandumVar = function (varName) {
        const input = document.getElementById('trModalTitel');
        if (!input) return;
        const start = input.selectionStart || input.value.length;
        const end = input.selectionEnd || input.value.length;
        const val = input.value;
        input.value = val.substring(0, start) + varName + val.substring(end);
        input.focus();
        const nextPos = start + varName.length;
        if (typeof input.setSelectionRange === 'function') {
            input.setSelectionRange(nextPos, nextPos);
        }
        gvDossierUpdateModalPreview(input.value);
    };

    /**
     * Aktualisiert die Live-Vorschau im Traktandum-Modal
     */
    window.gvDossierUpdateModalPreview = function (val) {
        const previewEl = document.getElementById('trModalPreview');
        if (previewEl) {
            previewEl.textContent = gvDossierResolveTraktandumText(val || '') || '(leer)';
        }
    };

    /**
     * Ermittelt den aktuellen E-Mail-Inhalt (bevorzugt direkt aus ClubWysiwyg)
     */
    function getGVCampaignMailBody() {
        const area = document.getElementById('gv-camp-body');
        if (area?._clubWysiwygInstance && typeof area._clubWysiwygInstance.getCleanHtml === 'function') {
            return area._clubWysiwygInstance.getCleanHtml();
        }
        return area?.value || window._gvDossierState?.campaign?.email_body || '';
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
                <div class="fw-bold text-muted">Lade GV-Cockpit, Traktanden & Mitglieder aus Supabase...</div>
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
            // 1. Mitglieder laden (person_number ist Primärschlüssel in public.members)
            const { data: mData, error: mErr } = await supa
                .from('members')
                .select('person_number, first_name, last_name, street, post_code, city, primary_email, is_active')
                .eq('is_active', true)
                .eq('deceased', false)
                .is('club_exit_date', null)
                .order('last_name', { ascending: true });

            if (mErr) {
                console.warn("⚠️ Warnung beim Laden der Mitglieder:", mErr);
            }

            state.members = (mData || []).map(m => ({
                ...m,
                id: String(m.person_number)
            }));

            if (state.members.length && !state.selectedMemberId) {
                state.selectedMemberId = state.members[0].id;
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
                state.gvInstance = {
                    ...gvData,
                    amtsdauer_text: gvData.amtsdauer_text || `Amtsdauer ${curYear}–${curYear + 2}`,
                    praesident_name: gvData.praesident_name || 'Andrea Rossi',
                    einladung_titel: gvData.einladung_titel || `Einladung zur ${gvData.number || 100}. Generalversammlung der Sportschützen Muhen`,
                    einladung_intro: gvData.einladung_intro || `Sehr geehrte Vereinsmitglieder, geschätzte Ehrenmitglieder und Schützenkameraden,\n\nzur ${gvData.number || 100}. ordentlichen Generalversammlung der Sportschützen Muhen laden wir euch herzlich ein.\n\nIn dieser Einladung sind der Jahresbericht des Präsidenten sowie das Protokoll der letzten Generalversammlung enthalten. Ebenso finden sich der Bericht der Jungschützenleiterin, die Jahresrechnung und das Budget. Der Besuch der Generalversammlung ist für alle Wettkampfmitglieder obligatorisch. Entschuldigungen sind dem Präsidenten eine Woche vor der Generalversammlung mitzuteilen.`,
                    antragsfrist_hinweis: gvData.antragsfrist_hinweis || `Hinweis: Anträge zuhanden der GV müssen gemäss Art. 15.2 der Vereinsstatuten mindestens 8 Tage vor der Versammlung schriftlich an den Präsidenten eingereicht werden.`,
                    grussformel: gvData.grussformel || `Mit sportlichen Grüssen\nDer Präsident\n${gvData.praesident_name || 'Andrea Rossi'}`
                };
            } else {
                state.gvInstance = {
                    id: `gv_${curYear}`,
                    year: curYear,
                    number: 100,
                    datum: `${curYear}-03-20`,
                    zeit: '19:30',
                    ort: 'Schützenhaus Muhen',
                    datum_vorjahr: `${curYear - 1}-03-21`,
                    abmelde_datum: `${curYear}-03-13`,
                    mahn_datum: `${curYear}-03-06`,
                    is_election_year: false,
                    amtsdauer_text: `Amtsdauer ${curYear}–${curYear + 2}`,
                    praesident_name: 'Andrea Rossi',
                    einladung_titel: `Einladung zur 100. Generalversammlung der Sportschützen Muhen`,
                    einladung_intro: `Sehr geehrte Vereinsmitglieder, geschätzte Ehrenmitglieder und Schützenkameraden,\n\nzur 100. ordentlichen Generalversammlung der Sportschützen Muhen laden wir euch herzlich ein.\n\nIn dieser Einladung sind der Jahresbericht des Präsidenten sowie das Protokoll der letzten Generalversammlung enthalten. Ebenso finden sich der Bericht der Jungschützenleiterin, die Jahresrechnung und das Budget. Der Besuch der Generalversammlung ist für alle Wettkampfmitglieder obligatorisch. Entschuldigungen sind dem Präsidenten eine Woche vor der Generalversammlung mitzuteilen.`,
                    antragsfrist_hinweis: `Hinweis: Anträge zuhanden der GV müssen gemäss Art. 15.2 der Vereinsstatuten mindestens 8 Tage vor der Versammlung schriftlich an den Präsidenten eingereicht werden.`,
                    grussformel: `Mit sportlichen Grüssen\nDer Präsident\nAndrea Rossi`,
                    linked_event_id: '',
                    praesident_wort: '',
                    vorstand_mails: []
                };
            }

            // Deep-Copy für Dirty-Tracker & Entwurfsspeicher
            state.gvInstanceOriginal = JSON.parse(JSON.stringify(state.gvInstance));
            state.gvDraft = JSON.parse(JSON.stringify(state.gvInstance));

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
                state.compiledPdfUrl = state.campaign.dossier_pdf_url || state.gvInstance?.doc_anhaenge_url || state.gvInstance?.doc_einladung_url || null;
            }

            // 6. Traktanden direkt aus public.gv_traktanden für diese GV laden
            const gvId = state.gvInstance?.id || `gv_${curYear}`;
            const { data: trData } = await supa
                .from('gv_traktanden')
                .select('*')
                .eq('gv_id', gvId)
                .order('sort_order', { ascending: true });
            const allTr = trData || [];
            state.traktanden = allTr.filter(t => !t.is_in_pool);
            state.traktandenPool = allTr.filter(t => Boolean(t.is_in_pool));

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
                    .select('person_number, first_name, last_name, primary_email, is_active, address_number')
                    .eq('is_active', true)
                    .eq('deceased', false)
                    .is('club_exit_date', null)
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
                    const unp = liz.replace(/^0+/, '');
                    if (unp) respMap.set(unp, r);
                    if (liz.length <= 6) respMap.set(liz.padStart(6, '0'), r);
                }
            });

            const praesenzMap = new Map();
            praesenzList.forEach(p => {
                const pn = String(p.person_number || '').trim();
                if (pn) {
                    praesenzMap.set(pn, p);
                    const unp = pn.replace(/^0+/, '');
                    if (unp) praesenzMap.set(unp, p);
                    if (pn.length <= 6) praesenzMap.set(pn.padStart(6, '0'), p);
                }
                const liz = String(p.lizenz || '').trim();
                if (liz) {
                    praesenzMap.set(liz, p);
                    const unp = liz.replace(/^0+/, '');
                    if (unp) praesenzMap.set(unp, p);
                    if (liz.length <= 6) praesenzMap.set(liz.padStart(6, '0'), p);
                }
            });

            state.participantsData = members.map(m => {
                const pn = String(m.person_number || '').trim();
                const pnPadded = (pn.length <= 6 && pn) ? pn.padStart(6, '0') : pn;
                const pnUnpadded = pn.replace(/^0+/, '');

                const addr = String(m.address_number || '').trim();
                const addrPadded = (addr.length <= 6 && addr) ? addr.padStart(6, '0') : addr;
                const addrUnpadded = addr.replace(/^0+/, '');

                const primaryLiz = addrPadded || addr || pnPadded || pn;

                const resp = respMap.get(pn) || 
                             respMap.get(pnPadded) || 
                             respMap.get(pnUnpadded) ||
                             (addr ? respMap.get(addr) : null) || 
                             (addrPadded ? respMap.get(addrPadded) : null) || 
                             (addrUnpadded ? respMap.get(addrUnpadded) : null);

                const praesenz = praesenzMap.get(pn) || 
                                 praesenzMap.get(pnPadded) || 
                                 praesenzMap.get(pnUnpadded) ||
                                 (addr ? praesenzMap.get(addr) : null) || 
                                 (addrPadded ? praesenzMap.get(addrPadded) : null) || 
                                 praesenzMap.get(primaryLiz);

                let status = 'offen';
                let essen = 0;
                let vegi = 0;
                let grund = '';

                if (resp) {
                    status = (resp.attending === true || resp.attending === 'true' || resp.attending === 1) ? 'ja' : 'nein';
                    essen = parseInt(resp.essen, 10) || 0;
                    vegi = parseInt(resp.vegi, 10) || 0;
                    grund = resp.grund || '';
                }

                const isAnwesend = praesenz ? Boolean(praesenz.anwesend) : false;
                const isStimmberechtigt = praesenz ? (praesenz.stimmberechtigt !== false) : true;

                return {
                    id: pn,
                    person_number: pn,
                    address_number: addr,
                    lizenz: primaryLiz,
                    responseRawLizenz: resp ? String(resp.lizenz) : primaryLiz,
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
                        <button id="btn-save-gv-global" class="btn btn-sm btn-outline-secondary write-protected" disabled onclick="gvDossierSaveStammdaten()">
                            💾 Gespeichert
                        </button>
                        <button class="btn btn-sm btn-outline-secondary rounded-3" onclick="gvDossierReload()" title="Alle Daten neu laden">
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
                                    <button class="nav-link ${state.activeLeftTab === 'stammdaten' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('stammdaten')">
                                        <i class="fas fa-calendar-alt me-1.5"></i> Stammdaten
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'traktanden' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('traktanden')">
                                        <i class="fas fa-list-ol me-1.5"></i> Traktanden (${state.traktanden.filter(t => !t.parent_id).length})
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'einladung_pdf' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('einladung_pdf')">
                                        <i class="fas fa-file-pdf me-1.5 text-danger"></i> Einladung (PDF)
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'beilagen' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('beilagen')">
                                        <i class="fas fa-layer-group me-1.5"></i> Beilagen (${state.attachments.length})
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'mail' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('mail')">
                                        <i class="fas fa-envelope me-1.5 text-info"></i> E-Mail
                                    </button>
                                </li>
                                <li class="nav-item">
                                    <button class="nav-link ${state.activeLeftTab === 'anmeldungen' ? 'active fw-bold text-primary border-bottom border-primary border-2' : 'text-muted'} pb-2.5" 
                                            onclick="gvDossierSetLeftTab('anmeldungen')">
                                        <i class="fas fa-users me-1.5 text-success"></i> Anmeldungen &amp; Präsenz (${(state.participantsData || []).filter(p => p.status === 'ja').length})
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
                                <button class="btn btn-xs btn-outline-primary" onclick="gvDossierRefreshPreview()" title="Vorschau live neu generieren">
                                    <i class="fas fa-redo me-1"></i> Vorschau aktualisieren
                                </button>
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
        gvDossierUpdateStammdatenDirtyState();
    }

    /**
     * Rendert das aktive linke Panel
     */
    function renderLeftPanel() {
        const panel = document.getElementById('gvLeftTabContent');
        if (!panel) return;

        const state = window._gvDossierState;
        const curYear = state.year;
        const gv = state.gvDraft || state.gvInstance || {};

        // ---------------------------------------------------------------------
        // ---------------------------------------------------------------------
        // TAB 1: TRAKTANDEN-MANAGER MIT DYNAMISCHER NUMMERIERUNG & POOL
        // ---------------------------------------------------------------------
        if (state.activeLeftTab === 'traktanden') {
            const allItems = state.traktanden || [];
            const poolItems = (state.traktandenPool || []).filter(t => !t.parent_id);
            const mainItems = allItems.filter(t => !t.parent_id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

            panel.innerHTML = `
                <!-- AKTIVE TRAKTANDENLISTE HEADER -->
                <div class="d-flex justify-content-between align-items-center mb-2.5 flex-wrap gap-2">
                    <div>
                        <div class="d-flex align-items-center gap-2">
                            <span class="small fw-bold text-dark text-uppercase" style="letter-spacing:0.5px;">
                                <i class="fas fa-list-ol text-primary me-1"></i>Aktive Traktandenliste ${curYear}:
                            </span>
                            <span class="badge bg-primary text-white rounded-pill px-2 py-0.5" style="font-size:0.75rem;">${mainItems.length} aktiv</span>
                        </div>
                        <div class="text-muted" style="font-size:0.75rem;">
                            <i class="fas fa-magic text-secondary me-1"></i>Nummerierung erfolgt fortlaufend automatisch · Per Drag &amp; Drop sortierbar
                        </div>
                    </div>
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <div class="form-check form-switch mb-0 bg-light border rounded-2 px-2.5 py-1 d-flex align-items-center shadow-xs">
                            <input class="form-check-input ms-0 me-2" type="checkbox" id="gv-trakt-wahljahr" 
                                   ${gv.is_election_year ? 'checked' : ''} 
                                   style="cursor: pointer;" 
                                   onchange="gvDossierToggleWahljahr(this.checked)">
                            <label class="form-check-label small fw-semibold cursor-pointer mb-0" for="gv-trakt-wahljahr" style="cursor: pointer;">
                                <i class="fas fa-vote-yea text-warning me-1"></i> Wahljahr (Erneuerungswahlen)
                            </label>
                        </div>
                        <button class="btn btn-sm btn-outline-warning text-dark fw-semibold py-1 px-2.5 rounded-2 shadow-xs" onclick="gvDossierAddElectionTraktandumModal()" title="Neues Wahltraktandum erfassen">
                            <i class="fas fa-vote-yea me-1"></i> Wahltraktandum
                        </button>
                        <button class="btn btn-sm btn-primary py-1 px-2.5 rounded-2 fw-semibold shadow-sm" onclick="gvDossierAddTraktandumModal(null)">
                            <i class="fas fa-plus me-1"></i> Traktandum
                        </button>
                    </div>
                </div>

                <!-- STANDARTVORGABE-BANNER -->
                <div class="alert alert-light border rounded-3 p-2.5 mb-3 d-flex align-items-center justify-content-between flex-wrap gap-2 shadow-xs" style="background:#f8fafc;">
                    <div class="small text-muted" style="font-size:0.8rem; max-width: 520px;">
                        <i class="fas fa-info-circle text-primary me-1"></i>
                        <strong>Standardvorgabe für Generalversammlungen:</strong> Begrüssung · Stimmenzähler · Protokoll Vorjahr · Mutationen · Berichte · Jahresrechnung · Budget · Jahresprogramm · ${gv.is_election_year ? '<strong>Wahlen</strong> · ' : ''}Ehrungen · Anträge &amp; Varia.
                    </div>
                    <button class="btn btn-xs btn-outline-primary fw-semibold shadow-xs" onclick="gvDossierSeedDefaultTraktanden(${Boolean(gv.is_election_year)})">
                        <i class="fas fa-magic me-1"></i> Standard-Vorgabe anwenden
                    </button>
                </div>

                ${mainItems.length === 0 ? `
                    <div class="alert alert-warning border-0 rounded-3 p-3 text-center my-3">
                        <i class="fas fa-exclamation-circle fa-2x mb-2 text-warning"></i>
                        <h6 class="fw-bold text-dark">Noch keine aktiven Traktanden für die GV ${curYear}</h6>
                        <p class="small text-muted mb-3">Wähle Standard-Traktanden, ziehe Punkte aus dem Pool nach oben oder übernimm das Vorjahr:</p>
                        <div class="d-flex justify-content-center gap-2 flex-wrap">
                            <button class="btn btn-sm btn-primary fw-semibold shadow-xs" onclick="gvDossierSeedDefaultTraktanden(false)">
                                <i class="fas fa-magic me-1"></i> Standard-Traktanden laden
                            </button>
                            <button class="btn btn-sm btn-outline-primary fw-semibold" onclick="gvDossierCopyPreviousYearTraktanden()">
                                <i class="fas fa-copy me-1"></i> Aus Vorjahr (${curYear - 1}) übernehmen
                            </button>
                        </div>
                    </div>
                ` : `
                    <div class="list-group rounded-3 shadow-none mb-3" id="gvTraktandenSortableList">
                        ${mainItems.map((main, mIdx) => {
                            const subItems = allItems.filter(t => t.parent_id === main.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
                            const dynamicNum = String(mIdx + 1);
                            return `
                                <div class="list-group-item p-2.5 border mb-2 rounded-2 shadow-xs bg-white gv-traktandum-main-row" data-tr-id="${main.id}">
                                    <!-- HAUPTTRAKTANDUM ZEILE -->
                                    <div class="d-flex align-items-center justify-content-between">
                                        <div class="d-flex align-items-center gap-2">
                                            <i class="fas fa-grip-vertical text-muted cursor-grab me-1 gv-main-drag-handle" style="cursor: grab;" title="Ziehen zum Verschieben"></i>
                                            <span class="badge bg-primary text-white rounded-pill px-2.5 py-1 fs-7 fw-bold" title="Fortlaufende Nummer">${dynamicNum}</span>
                                            <div>
                                                <div class="fw-bold small text-dark d-flex align-items-center flex-wrap gap-1">
                                                    <span>${escapeHtml(gvDossierResolveTraktandumText(main.titel))}</span>
                                                    ${main.is_election ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-0.5 px-1.5" style="font-size:0.68rem;"><i class="fas fa-vote-yea me-1"></i>Wahl</span>` : ''}
                                                </div>
                                                ${main.beschreibung ? `<div class="text-muted" style="font-size:0.75rem;">${escapeHtml(gvDossierResolveTraktandumText(main.beschreibung))}</div>` : ''}
                                                ${main.candidate_names ? `<div class="text-primary mt-0.5" style="font-size:0.73rem;"><i class="fas fa-user-check me-1"></i>Kandidierende: <strong>${escapeHtml(main.candidate_names)}</strong></div>` : ''}
                                            </div>
                                        </div>
                                        <div class="d-flex align-items-center gap-1">
                                            ${main.referent ? `<span class="badge bg-light text-secondary border me-1 py-1 px-1.5" style="font-size:0.7rem;"><i class="fas fa-user-tie me-1"></i>${escapeHtml(main.referent)}</span>` : ''}
                                            <!-- REIHENFOLGE PFEILE (ACCESSIBILITY FALLBACK) -->
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
                                            <!-- IN DEN POOL VERSCHIEBEN -->
                                            <button class="btn btn-xs btn-outline-info p-1 ms-1" title="In den Traktanden-Pool verschieben" onclick="gvDossierMoveToPool('${main.id}')">
                                                <i class="fas fa-box-archive"></i>
                                            </button>
                                            <!-- BEARBEITEN & LÖSCHEN -->
                                            <button class="btn btn-xs btn-outline-secondary p-1" title="Bearbeiten" onclick="gvDossierEditTraktandumModal('${main.id}')">
                                                <i class="fas fa-pencil-alt"></i>
                                            </button>
                                            <button class="btn btn-xs btn-outline-danger p-1" title="Endgültig löschen" onclick="gvDossierDeleteTraktandum('${main.id}')">
                                                <i class="fas fa-trash-alt"></i>
                                            </button>
                                        </div>
                                    </div>

                                    <!-- UNTERTRAKTANDEN (EINGERÜCKT & SORTIERBAR) -->
                                    ${subItems.length > 0 ? `
                                        <div class="ms-4 mt-2 ps-3 border-start border-3 border-primary-subtle gv-subtraktanden-list" data-parent-id="${main.id}">
                                            ${subItems.map((sub, sIdx) => `
                                                <div class="d-flex align-items-center justify-content-between py-1.5 px-2.5 mb-1.5 bg-light-subtle rounded-3 border border-secondary-subtle shadow-xs gv-sub-row" data-tr-id="${sub.id}">
                                                    <div class="d-flex align-items-center gap-2">
                                                        <i class="fas fa-grip-vertical text-muted cursor-grab gv-sub-drag-handle" style="cursor: grab; font-size: 0.8rem;" title="Ziehen zum Verschieben"></i>
                                                        <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2 py-0.5 fw-bold font-monospace" style="font-size:0.75rem;">${dynamicNum}.${sIdx + 1}</span>
                                                        <div>
                                                            <div class="d-flex align-items-center flex-wrap gap-1">
                                                                <span class="small fw-semibold text-dark">${escapeHtml(gvDossierResolveTraktandumText(sub.titel))}</span>
                                                                ${sub.is_election ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-0 px-1" style="font-size:0.62rem;">Wahl</span>` : ''}
                                                            </div>
                                                            ${sub.beschreibung ? `<span class="text-muted" style="font-size:0.75rem;">${escapeHtml(gvDossierResolveTraktandumText(sub.beschreibung))}</span>` : ''}
                                                            ${sub.candidate_names ? `<div class="text-primary" style="font-size:0.72rem;"><i class="fas fa-user-check me-1"></i>Kandidierende: <strong>${escapeHtml(sub.candidate_names)}</strong></div>` : ''}
                                                        </div>
                                                    </div>
                                                    <div class="d-flex align-items-center gap-1">
                                                        ${sub.referent ? `<span class="badge bg-white text-secondary border py-0.5 px-2 me-1 shadow-xs" style="font-size:0.7rem;"><i class="fas fa-user-tie me-1 text-primary"></i>${escapeHtml(sub.referent)}</span>` : ''}
                                                        <button class="btn btn-xs btn-outline-secondary py-0.5 px-1.5" title="Nach oben" onclick="gvDossierMoveTraktandum('${sub.id}', 'up')" ${sIdx === 0 ? 'disabled' : ''}>
                                                            <i class="fas fa-arrow-up" style="font-size:0.7rem;"></i>
                                                        </button>
                                                        <button class="btn btn-xs btn-outline-secondary py-0.5 px-1.5" title="Nach unten" onclick="gvDossierMoveTraktandum('${sub.id}', 'down')" ${sIdx === subItems.length - 1 ? 'disabled' : ''}>
                                                            <i class="fas fa-arrow-down" style="font-size:0.7rem;"></i>
                                                        </button>
                                                        <button class="btn btn-xs btn-outline-info py-0.5 px-1.5" title="In den Traktanden-Pool verschieben" onclick="gvDossierMoveToPool('${sub.id}')">
                                                            <i class="fas fa-box-archive" style="font-size:0.7rem;"></i>
                                                        </button>
                                                        <button class="btn btn-xs btn-outline-primary py-0.5 px-1.5" title="Bearbeiten" onclick="gvDossierEditTraktandumModal('${sub.id}')">
                                                            <i class="fas fa-pencil-alt" style="font-size:0.7rem;"></i>
                                                        </button>
                                                        <button class="btn btn-xs btn-outline-danger py-0.5 px-1.5" title="Löschen" onclick="gvDossierDeleteTraktandum('${sub.id}')">
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

                <!-- ========================================================= -->
                <!-- TRAKTANDEN-POOL (VORRATSKAMMER & SPEZIAL-VORLAGEN)       -->
                <!-- ========================================================= -->
                <div class="card border rounded-4 p-3 bg-light shadow-xs mt-3">
                    <div class="d-flex justify-content-between align-items-center mb-2 flex-wrap gap-2">
                        <div>
                            <div class="d-flex align-items-center gap-2">
                                <span class="small fw-bold text-dark text-uppercase" style="letter-spacing:0.5px;">
                                    <i class="fas fa-boxes text-info me-1"></i>Traktanden-Pool &amp; Vorratskammer:
                                </span>
                                <span class="badge bg-secondary text-white rounded-pill px-2 py-0.5" style="font-size:0.75rem;">${poolItems.length} im Pool</span>
                            </div>
                            <div class="text-muted" style="font-size:0.75rem;">
                                Traktanden können per Drag &amp; Drop nach oben gezogen oder mit einem Klick zur GV hinzugefügt werden.
                            </div>
                        </div>
                        <div class="d-flex gap-1.5">
                            <button class="btn btn-xs btn-outline-secondary fw-semibold" onclick="gvDossierAddPoolSampleItems()" title="Häufige Vorlagen (Kleiderbeschaffung, Statuten, Scheiben) zum Pool hinzufügen">
                                <i class="fas fa-plus-circle me-1"></i> Vorlagen ergänzen
                            </button>
                        </div>
                    </div>

                    ${poolItems.length === 0 ? `
                        <div class="text-center py-3 text-muted border rounded-3 bg-white small">
                            <i class="fas fa-box-open text-secondary mb-1 d-block opacity-50 fs-4"></i>
                            Der Traktanden-Pool ist aktuell leer. Traktanden, die du mit <i class="fas fa-box-archive text-info"></i> ablegst, landen hier als wiederverwendbare Vorlage.
                        </div>
                    ` : `
                        <div class="list-group rounded-3 shadow-none" id="gvTraktandenPoolSortableList">
                            ${poolItems.map((pItem) => {
                                const subPool = (state.traktandenPool || []).filter(s => s.parent_id === pItem.id);
                                return `
                                    <div class="list-group-item p-2.5 border mb-2 rounded-2 shadow-xs bg-white gv-traktandum-pool-row" data-tr-id="${pItem.id}">
                                        <div class="d-flex align-items-center justify-content-between">
                                            <div class="d-flex align-items-center gap-2">
                                                <i class="fas fa-grip-vertical text-muted cursor-grab me-1 gv-pool-drag-handle" style="cursor: grab;" title="Nach oben in die aktive Traktandenliste ziehen"></i>
                                                <span class="badge bg-secondary-subtle text-secondary rounded-pill px-2 py-0.5" style="font-size:0.7rem;"><i class="fas fa-box me-1"></i>Pool</span>
                                                <div>
                                                    <div class="fw-bold small text-dark d-flex align-items-center flex-wrap gap-1">
                                                        <span>${escapeHtml(gvDossierResolveTraktandumText(pItem.titel))}</span>
                                                        ${pItem.is_election ? `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle py-0.5 px-1.5" style="font-size:0.65rem;"><i class="fas fa-vote-yea me-1"></i>Wahl</span>` : ''}
                                                        ${subPool.length > 0 ? `<span class="badge bg-light text-muted border py-0.5 px-1.5" style="font-size:0.65rem;">${subPool.length} Unterpunkte</span>` : ''}
                                                    </div>
                                                    ${pItem.beschreibung ? `<div class="text-muted" style="font-size:0.75rem;">${escapeHtml(gvDossierResolveTraktandumText(pItem.beschreibung))}</div>` : ''}
                                                    ${pItem.candidate_names ? `<div class="text-primary mt-0.5" style="font-size:0.72rem;"><i class="fas fa-user-check me-1"></i>Kandidierende: <strong>${escapeHtml(pItem.candidate_names)}</strong></div>` : ''}
                                                </div>
                                            </div>
                                            <div class="d-flex align-items-center gap-1.5">
                                                ${pItem.referent ? `<span class="badge bg-light text-secondary border me-1 py-1 px-1.5" style="font-size:0.7rem;"><i class="fas fa-user-tie me-1"></i>${escapeHtml(pItem.referent)}</span>` : ''}
                                                <button class="btn btn-xs btn-primary py-1 px-2.5 fw-semibold shadow-xs" title="In die aktive Traktandenliste übernehmen" onclick="gvDossierMoveFromPool('${pItem.id}')">
                                                    <i class="fas fa-arrow-up me-1"></i> Zur GV übernehmen
                                                </button>
                                                <button class="btn btn-xs btn-outline-secondary p-1" title="Bearbeiten" onclick="gvDossierEditTraktandumModal('${pItem.id}')">
                                                    <i class="fas fa-pencil-alt"></i>
                                                </button>
                                                <button class="btn btn-xs btn-outline-danger p-1" title="Endgültig löschen" onclick="gvDossierDeleteTraktandum('${pItem.id}')">
                                                    <i class="fas fa-trash-alt"></i>
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    `}
                </div>
            `;

            initSortableTraktanden();
        }

        // ---------------------------------------------------------------------
        // TAB 2: STAMMDATEN & FRISTEN (MIT SAVEBUTTONKIT DIRTY TRACKER)
        // ---------------------------------------------------------------------
        else if (state.activeLeftTab === 'stammdaten') {
            panel.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <span class="small fw-bold text-muted text-uppercase">GV-Stammdaten &amp; Termine ${curYear}:</span>
                    <button id="btn-save-gv-stammdaten" class="btn btn-sm btn-outline-secondary write-protected" disabled onclick="gvDossierSaveStammdaten()">
                        💾 Stammdaten gespeichert
                    </button>
                </div>

                <div class="card border rounded-3 p-3 bg-light mb-3">
                    <div class="row g-2 mb-2">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Nummer der GV</label>
                            <div class="input-group input-group-sm">
                                <span class="input-group-text bg-white">Nr.</span>
                                <input type="number" id="gv-stamm-number" class="form-control" value="${escapeHtml(gv.number || 100)}" oninput="gvDossierOnStammdatenFieldChange()">
                            </div>
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Datum der GV</label>
                            <input type="date" id="gv-stamm-datum" class="form-control form-control-sm" value="${escapeHtml(gv.datum || '')}" onchange="gvDossierOnStammdatenFieldChange()">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Startzeit</label>
                            <input type="text" id="gv-stamm-zeit" class="form-control form-control-sm" placeholder="19:30" value="${escapeHtml(gv.zeit || '19:30')}" oninput="gvDossierOnStammdatenFieldChange()">
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-md-8">
                            <label class="form-label small fw-bold mb-1">Austragungsort</label>
                            <input type="text" id="gv-stamm-ort" class="form-control form-control-sm" value="${escapeHtml(gv.ort || 'Schützenhaus Muhen')}" oninput="gvDossierOnStammdatenFieldChange()">
                        </div>
                        <div class="col-md-4 d-flex align-items-end">
                            <div class="form-check form-switch mb-1 bg-white border rounded-2 p-2 px-3 shadow-xs w-100 d-flex align-items-center">
                                <input class="form-check-input ms-0 me-2" type="checkbox" id="gv-stamm-wahljahr" 
                                       ${gv.is_election_year ? 'checked' : ''} 
                                       style="cursor: pointer;" 
                                       onchange="gvDossierToggleWahljahr(this.checked)">
                                <label class="form-check-label small fw-semibold cursor-pointer mb-0 text-dark" for="gv-stamm-wahljahr" style="cursor: pointer;">
                                    <i class="fas fa-vote-yea text-warning me-1"></i> Wahljahr
                                </label>
                            </div>
                        </div>
                    </div>

                    <div class="row g-2 mb-2">
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Datum Vorjahres-GV</label>
                            <input type="date" id="gv-stamm-vorjahr" class="form-control form-control-sm" value="${escapeHtml(gv.datum_vorjahr || '')}" onchange="gvDossierOnStammdatenFieldChange()">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Abmeldefrist</label>
                            <input type="date" id="gv-stamm-abmeldung" class="form-control form-control-sm" value="${escapeHtml(gv.abmelde_datum || '')}" onchange="gvDossierOnStammdatenFieldChange()">
                        </div>
                        <div class="col-md-4">
                            <label class="form-label small fw-bold mb-1">Mahndatum</label>
                            <input type="date" id="gv-stamm-mahnung" class="form-control form-control-sm" value="${escapeHtml(gv.mahn_datum || '')}" onchange="gvDossierOnStammdatenFieldChange()">
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
                            Verknüpft die RSVPs aus dem Modul «Anlässe &amp; Umfragen». Ein Anlass wird automatisch vorgeschlagen, wenn sein Titel <strong>«Generalversammlung»</strong> enthält.
                        </div>
                    </div>

                    <div class="mb-2">
                        <label class="form-label small fw-bold mb-1">Vorstands-Kopien (E-Mail-Verteiler für GV-Prüfmails)</label>
                        <input type="text" id="gv-stamm-vorstand-mails" class="form-control form-control-sm" placeholder="z.B. aktuar@example.ch; kassier@example.ch" value="${escapeHtml(gv.vorstand_mails_str !== undefined ? gv.vorstand_mails_str : (gv.vorstand_mails || []).join('; '))}" oninput="gvDossierOnStammdatenFieldChange()">
                        <div class="form-text small text-muted">Mehrere E-Mail-Adressen mit Strichpunkt (;) trennen.</div>
                    </div>

                    <div class="mb-0">
                        <label class="form-label small fw-bold mb-1">Wort des Präsidenten (Begleittext)</label>
                        <textarea id="gv-stamm-praesident-wort" class="form-control form-control-sm" rows="3" placeholder="Grusswort des Präsidenten zur GV..." oninput="gvDossierOnStammdatenFieldChange()">${escapeHtml(gv.praesident_wort || '')}</textarea>
                    </div>

                    <!-- WECHSEL ZUM DEDIZIERTEN PDF-EDITOR -->
                    <div class="card border rounded-3 p-3 bg-white mt-3 shadow-xs">
                        <div class="d-flex justify-content-between align-items-center mb-1">
                            <span class="small fw-bold text-dark"><i class="fas fa-file-pdf text-danger me-1"></i> Einladung &amp; Briefschaft (PDF)</span>
                            <button type="button" class="btn btn-xs btn-outline-primary fw-semibold" onclick="gvDossierSetLeftTab('einladung_pdf')">
                                <i class="fas fa-arrow-right me-1"></i> Zum PDF-Editor
                            </button>
                        </div>
                        <div class="small text-muted" style="font-size: 0.8rem;">
                            Die Einladungstexte, Antragsfristen und Schlusssätze werden nun direkt und eigenständig im Reiter <strong>«📄 Einladung (PDF)»</strong> bearbeitet.
                        </div>
                    </div>
                </div>
            `;

            gvDossierUpdateStammdatenDirtyState();
        }

        // ---------------------------------------------------------------------
        // TAB 3: DEDIZIERTER PDF-EINLADUNGS-EDITOR (SEITE 1 DER GV-BROSCHÜRE)
        // ---------------------------------------------------------------------
        else if (state.activeLeftTab === 'einladung_pdf') {
            panel.innerHTML = `
                <div class="d-flex justify-content-between align-items-center mb-3">
                    <div>
                        <span class="small fw-bold text-muted text-uppercase">PDF-Einladungstexte (Seite 1):</span>
                        <div class="text-muted" style="font-size:0.75rem;">
                            Bearbeite den Briefkopf, Einleitung und Schlusssatz für die gedruckte Einladungsbroschüre.
                        </div>
                    </div>
                    <div class="d-flex gap-2">
                        <button id="btn-save-gv-pdf-texts" class="btn btn-sm btn-outline-secondary write-protected" disabled onclick="gvDossierSaveStammdaten()">
                            💾 Texte gespeichert
                        </button>
                        <button class="btn btn-sm btn-primary py-1 px-2.5 rounded-2 fw-semibold shadow-sm" onclick="gvDossierRefreshLivePdfPreview()">
                            <i class="fas fa-sync-alt me-1"></i> Vorschau aktualisieren
                        </button>
                    </div>
                </div>

                <!-- SHORTCODE PILLS & FORMATIERUNG -->
                <div class="p-2.5 bg-light rounded-3 border mb-3">
                    <div class="small fw-bold text-muted mb-1.5"><i class="fas fa-code me-1 text-primary"></i> Verfügbare Platzhalter &amp; Formatierung (klicken zum Einfügen):</div>
                    <div class="d-flex gap-1.5 flex-wrap align-items-center">
                        <span class="badge bg-white text-dark border px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{gv_nummer}')" title="Nummer der GV">{gv_nummer}</span>
                        <span class="badge bg-white text-dark border px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{jahr}')" title="Jahr">{jahr}</span>
                        <span class="badge bg-white text-dark border px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{gv_datum}')" title="Formatiertes Datum">{gv_datum}</span>
                        <span class="badge bg-white text-dark border px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{gv_zeit}')" title="Uhrzeit">{gv_zeit}</span>
                        <span class="badge bg-white text-dark border px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{gv_ort}')" title="Austragungsort">{gv_ort}</span>
                        <span class="badge bg-white text-dark border px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{praesident_name}')" title="Präsident">{praesident_name}</span>
                        <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{vorname}')" title="Vorname des Empfängers (aus Mitgliedstabelle)">{vorname}</span>
                        <span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1 cursor-pointer shadow-xs" style="cursor:pointer;" onclick="gvDossierInsertPlaceholder('{nachname}')" title="Nachname des Empfängers (aus Mitgliedstabelle)">{nachname}</span>
                        <span class="badge bg-secondary-subtle text-secondary-emphasis border px-2 py-1 cursor-pointer shadow-xs ms-1" style="cursor:pointer;" onclick="gvDossierInsertFormatting('**', '**')" title="Fettgedruckter Text in der PDF-Einleitung"><strong>**Fett**</strong></span>
                    </div>
                </div>

                <div class="card border rounded-3 p-3 bg-white mb-3 shadow-xs">
                    <!-- TITEL -->
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-dark mb-1">Titel der Einladung</label>
                        <input type="text" id="gv-pdf-titel" class="form-control form-control-sm fw-bold" 
                               value="${escapeHtml(gv.einladung_titel || `Einladung zur ${gv.number || 100}. ordentlichen Generalversammlung`)}" 
                               onfocus="window._gvLastFocusedPdfInput = this"
                               oninput="gvDossierOnStammdatenFieldChange()">
                    </div>

                    <!-- EINLEITUNGSTEXT -->
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-dark mb-1">Einleitung &amp; Begrüssung</label>
                        <textarea id="gv-pdf-intro" class="form-control form-control-sm" rows="6" 
                                  placeholder="Liebe Schützinnen, liebe Schützen..." 
                                  onfocus="window._gvLastFocusedPdfInput = this"
                                  oninput="gvDossierOnStammdatenFieldChange()">${escapeHtml(gv.einladung_intro || '')}</textarea>
                        <div class="form-text small text-muted">
                            Wird auf Seite 1 oberhalb der Traktandenliste dargestellt. Zeilenumbrüche und <strong>**fettgedruckte Abschnitte**</strong> werden direkt ins PDF übernommen.
                        </div>
                    </div>

                    <!-- HINWEIS ZU ANTRÄGEN & STATUTEN -->
                    <div class="mb-3">
                        <label class="form-label small fw-bold text-dark mb-1">Hinweis zu Anträgen &amp; Fristen</label>
                        <textarea id="gv-pdf-hinweis" class="form-control form-control-sm" rows="2" 
                                  placeholder="Anträge sind mindestens 8 Tage vor der GV schriftlich an den Präsidenten einzureichen..." 
                                  onfocus="window._gvLastFocusedPdfInput = this"
                                  oninput="gvDossierOnStammdatenFieldChange()">${escapeHtml(gv.antragsfrist_hinweis || '')}</textarea>
                    </div>

                    <!-- GRUSSFORMEL & UNTERZEICHNER -->
                    <div class="mb-2">
                        <label class="form-label small fw-bold text-dark mb-1">Grussformel &amp; Unterzeichner (Schlusszeilen)</label>
                        <textarea id="gv-pdf-gruss" class="form-control form-control-sm" rows="3" 
                                  placeholder="Freundliche Schützengrüsse&#10;{praesident_name}&#10;Der Vorstand der Sportschützen Muhen" 
                                  onfocus="window._gvLastFocusedPdfInput = this"
                                  oninput="gvDossierOnStammdatenFieldChange()">${escapeHtml(gv.grussformel || 'Freundliche Schützengrüsse\nDer Vorstand der Sportschützen Muhen')}</textarea>
                        <div class="form-text small text-muted">
                            Erfasse hier deine Grussformel und den Unterzeichner. Der Platzhalter <code>{praesident_name}</code> wird automatisch mit dem Namen des Präsidenten ersetzt.
                        </div>
                    </div>
                </div>
            `;

            gvDossierUpdateStammdatenDirtyState();
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
                        <strong>GV-Dossier Compiler:</strong> Füge die Jahresberichte und Protokolle als PDF hinzu.
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

                <!-- FIXES BASIS-DOKUMENT -->
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold text-muted text-uppercase" style="letter-spacing:0.5px;">Basis-Dokument (Deckblatt):</span>
                </div>
                <div class="list-group rounded-3 shadow-none mb-3">
                    <div class="list-group-item p-2.5 d-flex align-items-center justify-content-between border mb-1.5 bg-light rounded-2">
                        <div class="d-flex align-items-center gap-2.5">
                            <span class="badge bg-primary text-white rounded-pill px-2 py-1">1</span>
                            <div>
                                <div class="fw-bold small mb-0">Einladung &amp; Traktandenliste</div>
                                <div class="text-muted" style="font-size:0.75rem;">Seite 1 · Fixes Deckblatt (dynamisch aus Traktandenmanager generiert)</div>
                            </div>
                        </div>
                        <span class="badge bg-secondary-subtle text-secondary py-1 px-1.5">Fixiert auf 1</span>
                    </div>
                </div>

                <!-- LISTE DER DOKUMENTE IM DOSSIER (FREI SORTIERBAR) -->
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span class="small fw-bold text-muted text-uppercase" style="letter-spacing:0.5px;">Dossier-Beilagen (frei sortierbar):</span>
                    <span class="small text-muted"><i class="fas fa-arrows-alt me-1"></i> Drag &amp; Drop zum Sortieren</span>
                </div>

                <div class="list-group rounded-3 shadow-none mb-3" id="gvAttachmentsSortableList">
                    ${(() => {
                        const customOrder = state.campaign?.custom_settings?.attachment_order || [];
                        const calendarItem = {
                            id: 'system_jahresprogramm',
                            isCalendar: true,
                            title: `Jahresprogramm & Schiesstermine ${curYear}`,
                            sub: `Dynamisch aus Vereinsterminen generiert`
                        };

                        let allSortable = [];
                        const attsById = {};
                        (state.attachments || []).forEach(a => { attsById[a.id] = a; });

                        if (customOrder.length > 0) {
                            customOrder.forEach(id => {
                                if (id === 'system_jahresprogramm') {
                                    allSortable.push(calendarItem);
                                } else if (attsById[id]) {
                                    allSortable.push(attsById[id]);
                                    delete attsById[id];
                                }
                            });
                            Object.values(attsById).forEach(a => allSortable.push(a));
                            if (!allSortable.some(x => x.id === 'system_jahresprogramm')) {
                                allSortable.unshift(calendarItem);
                            }
                        } else {
                            allSortable = [calendarItem, ...(state.attachments || [])];
                        }

                        return allSortable.map((item, idx) => {
                            if (item.isCalendar) {
                                return `
                                    <div class="list-group-item p-2.5 d-flex align-items-center justify-content-between border mb-1.5 rounded-2 gv-sortable-item bg-white" data-att-id="system_jahresprogramm">
                                        <div class="d-flex align-items-center gap-2.5">
                                            <i class="fas fa-grip-vertical text-muted cursor-grab" title="Ziehen zum Sortieren" style="cursor: grab;"></i>
                                            <span class="badge bg-primary text-white rounded-pill px-2 py-1 gv-order-badge">${idx + 2}</span>
                                            <div>
                                                <div class="fw-bold small mb-0"><i class="fas fa-calendar-alt text-primary me-1"></i>${escapeHtml(item.title)}</div>
                                                <div class="text-muted" style="font-size:0.75rem;">
                                                    ${escapeHtml(item.sub)} · <a href="#termine" onclick="if(typeof window.showSection==='function'){window.showSection('termine');} return false;" class="text-decoration-none fw-semibold">Jahresprogramm bearbeiten <i class="fas fa-external-link-alt" style="font-size:10px;"></i></a>
                                                </div>
                                            </div>
                                        </div>
                                        <div class="form-check form-switch mb-0">
                                            <input class="form-check-input" type="checkbox" id="gvIncludeProgSwitch" 
                                                   ${state.campaign?.custom_settings?.include_calendar !== false ? 'checked' : ''}
                                                   onchange="gvDossierToggleCalendar(this.checked)" title="Im Gesamtdossier einbinden">
                                        </div>
                                    </div>
                                `;
                            }
                            return `
                                <div class="list-group-item p-2.5 d-flex align-items-center justify-content-between border mb-1.5 rounded-2 gv-sortable-item bg-white" data-att-id="${item.id}">
                                    <div class="d-flex align-items-center gap-2.5">
                                        <i class="fas fa-grip-vertical text-muted cursor-grab" title="Ziehen zum Sortieren" style="cursor: grab;"></i>
                                        <span class="badge bg-secondary text-white rounded-pill px-2 py-1 gv-order-badge">${idx + 2}</span>
                                        <div>
                                            <div class="fw-bold small mb-0">${escapeHtml(item.title)}</div>
                                            <div class="text-muted" style="font-size:0.75rem;">
                                                ${item.page_count ? `${item.page_count} Seite(n)` : 'PDF'} 
                                                · Status: <span class="badge ${item.status === 'compiled' ? 'bg-success' : 'bg-secondary'} py-0 px-1" style="font-size:0.65rem;">${item.status || 'uploaded'}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="d-flex align-items-center gap-1">
                                        ${item.file_url ? `
                                            <a href="${item.file_url}" target="_blank" class="btn btn-xs btn-outline-secondary p-1" title="Öffnen">
                                                <i class="fas fa-external-link-alt"></i>
                                            </a>
                                        ` : ''}
                                        <button class="btn btn-xs btn-outline-danger p-1" onclick="gvDossierDeleteAttachment('${item.id}')" title="Entfernen">
                                            <i class="fas fa-trash-alt"></i>
                                        </button>
                                    </div>
                                </div>
                            `;
                        }).join('');
                    })()}
                </div>

                <!-- KOMPILIEREN-BUTTON -->
                <div class="d-grid gap-2">
                    <button class="btn btn-primary py-2.5 fw-bold shadow-sm rounded-3" onclick="gvDossierCompileNow()" ${state.isCompiling ? 'disabled' : ''}>
                        ${state.isCompiling ? `
                            <span class="spinner-border spinner-border-sm me-1.5" role="status"></span>
                            Assembler &amp; Corporate Stempel laufen...
                        ` : `
                            <i class="fas fa-stamp me-1.5"></i> Gesamtes GV-Dossier jetzt kompilieren &amp; stempeln
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
        // TAB 4: E-MAIL-TEXT & KAMPAGNE (CLUB WYSIWYG INTEGRATION)
        // ---------------------------------------------------------------------
        else if (state.activeLeftTab === 'mail') {
            const camp = state.campaign || {};
            panel.innerHTML = `
                <!-- E-MAIL KONFIGURATION -->
                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted">E-Mail-Betreff</label>
                    <input type="text" class="form-control form-control-sm fw-semibold" id="gv-camp-subj" value="${escapeHtml(camp.email_subject || '')}" oninput="gvDossierLiveUpdateMailText()">
                </div>

                <!-- PLATZHALTER LEISTE (GLOBALES MODELL) -->
                <div class="bg-light p-3 rounded-3 mb-3 border shadow-sm">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <label class="form-label fw-bold small text-primary mb-0">
                            <i class="fas fa-magic me-1"></i>Verfügbare Platzhalter (Klicken zum Einfügen)
                        </label>
                        <small class="text-muted" style="font-size: 11px;">Wird an der Cursor-Position im Text eingefügt</small>
                    </div>
                    <div class="d-flex gap-1.5 flex-wrap">
                        <button type="button" class="btn btn-xs btn-outline-primary py-0.5 px-2 rounded-pill font-monospace" onclick="gvDossierInsertVariable('{{mitglied.vorname}}')">
                            <i class="fas fa-plus-circle me-1" style="font-size: 9px;"></i>{{mitglied.vorname}} <span class="text-muted small">(Vorname)</span>
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-primary py-0.5 px-2 rounded-pill font-monospace" onclick="gvDossierInsertVariable('{{mitglied.nachname}}')">
                            <i class="fas fa-plus-circle me-1" style="font-size: 9px;"></i>{{mitglied.nachname}} <span class="text-muted small">(Nachname)</span>
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-primary py-0.5 px-2 rounded-pill font-monospace" onclick="gvDossierInsertVariable('{{mitglied.anrede}}')">
                            <i class="fas fa-plus-circle me-1" style="font-size: 9px;"></i>{{mitglied.anrede}} <span class="text-muted small">(Lieber/Liebe)</span>
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-primary py-0.5 px-2 rounded-pill font-monospace" onclick="gvDossierInsertVariable('{{event.datum_formatiert}}')">
                            <i class="fas fa-plus-circle me-1" style="font-size: 9px;"></i>{{event.datum_formatiert}} <span class="text-muted small">(GV-Datum)</span>
                        </button>
                        <button type="button" class="btn btn-xs btn-outline-primary py-0.5 px-2 rounded-pill font-monospace" onclick="gvDossierInsertVariable('{{dossier.download_url}}')">
                            <i class="fas fa-plus-circle me-1" style="font-size: 9px;"></i>{{dossier.download_url}} <span class="text-muted small">(Download-Link)</span>
                        </button>
                    </div>
                </div>

                <div class="mb-3">
                    <label class="form-label small fw-bold text-muted mb-1">E-Mail-Anschreiben (WYSIWYG-Editor)</label>
                    <textarea class="form-control form-control-sm" id="gv-camp-body" rows="10" oninput="gvDossierLiveUpdateMailText()">${escapeHtml(camp.email_body || '')}</textarea>
                    <div class="form-text small text-muted">
                        Formatierungen, Absätze, Banner und Aktions-Buttons werden über die obige Toolbar gesteuert.
                    </div>
                </div>

                <!-- ANHÄNGE-STRATEGIE (BOUNCE-SCHUTZ) -->
                <div class="card border rounded-3 p-3 bg-light mb-3">
                    <div class="fw-bold small text-dark mb-1"><i class="fas fa-shield-alt text-success me-1"></i> Versand- &amp; Anhangstrategie:</div>
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
                    <button class="btn btn-sm btn-primary fw-bold px-3 py-1.5 rounded-3 shadow-sm" onclick="gvDossierSaveCampaignText()">
                        <i class="fas fa-save me-1"></i> E-Mail-Text speichern
                    </button>
                </div>
            `;

            if (typeof window.ClubWysiwyg !== 'undefined') {
                const mailArea = document.getElementById('gv-camp-body');
                if (mailArea) {
                    window.ClubWysiwyg.init(mailArea, {
                        mode: 'email',
                        minHeight: '260px',
                        placeholder: 'E-Mail Text an die Mitglieder verfassen...',
                        placeholders: [
                            { tag: 'mitglied.vorname', label: 'Vorname' },
                            { tag: 'mitglied.nachname', label: 'Nachname' },
                            { tag: 'mitglied.anrede', label: 'Anrede (Lieber/Liebe...)' },
                            { tag: 'event.datum_formatiert', label: 'Datum der GV' },
                            { tag: 'dossier.download_url', label: 'Download-Link Master-Dossier' }
                        ],
                        onChange: () => gvDossierLiveUpdateMailText()
                    });
                }
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
                <div class="d-flex gap-1.5 flex-wrap">
                    <button class="btn btn-xs btn-outline-secondary px-2 py-1" onclick="gvDossierReloadParticipants()" title="Teilnehmerliste neu laden">
                        <i class="fas fa-sync-alt me-1"></i> Aktualisieren
                    </button>
                </div>
            </div>

            <!-- AKTIONEN-BAR FÜR PRÄSENZLISTE & VORSTANDS-REPORT -->
            <div class="card p-2.5 bg-white border rounded-3 mb-2.5 shadow-xs">
                <div class="d-flex flex-wrap justify-content-between align-items-center gap-2">
                    <div class="d-flex gap-1.5 flex-wrap">
                        <button class="btn btn-sm btn-outline-primary fw-semibold" onclick="gvDossierOpenPraesenzlistePdf()" title="Druckfertige Präsenzliste für den Versammlungsabend öffnen">
                            <i class="fas fa-print me-1"></i> Präsenzliste (PDF)
                        </button>
                        <button class="btn btn-sm btn-outline-info fw-semibold" onclick="gvDossierSendPraesenzlisteToAktuar()" title="Präsenzliste an den Aktuar senden">
                            <i class="fas fa-paper-plane me-1"></i> An Aktuar senden
                        </button>
                    </div>
                    <div>
                        <button class="btn btn-sm btn-outline-success fw-semibold" onclick="gvDossierSendAnmeldeZusammenfassungToVorstand()" title="Zwischenstand an Vorstand allgemein senden">
                            <i class="fas fa-chart-pie me-1"></i> Zwischenstand an Vorstand senden
                        </button>
                    </div>
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
                `Datum: ${formatSwissDate(state.gvInstance?.datum) || 'Gemäss Programm'}\n` +
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
                const busterUrl = pdfUrl.includes('?') ? `${pdfUrl}&t=${Date.now()}` : `${pdfUrl}?t=${Date.now()}`;
                panel.innerHTML = `
                    <div class="d-flex justify-content-between align-items-center p-2 bg-light border-bottom">
                        <span class="small text-muted"><i class="fas fa-file-pdf text-danger me-1"></i> Aktuelle PDF-Vorschau</span>
                        <div class="d-flex gap-1">
                            <button class="btn btn-xs btn-outline-primary" onclick="gvDossierRefreshPreview()" title="Vorschau neu kompilieren">
                                <i class="fas fa-sync-alt me-1"></i> Vorschau neu generieren
                            </button>
                            <a href="${pdfUrl}" target="_blank" class="btn btn-xs btn-outline-secondary" title="In neuem Tab öffnen">
                                <i class="fas fa-external-link-alt"></i>
                            </a>
                        </div>
                    </div>
                    <iframe src="${busterUrl}#toolbar=0&navpanes=0" class="w-100 h-100 border-0 rounded-bottom-4" style="min-height: 540px;"></iframe>
                `;
            } else {
                panel.innerHTML = `
                    <div class="d-flex flex-column align-items-center justify-content-center h-100 text-center p-5 text-muted">
                        <i class="fas fa-file-pdf fa-3x text-secondary mb-3 opacity-50"></i>
                        <h6 class="fw-bold text-dark">Noch kein Vorschaudokument vorhanden</h6>
                        <p class="small text-muted mb-3" style="max-width: 340px;">
                            Klicke auf <strong>«Vorschau jetzt generieren»</strong>, um die Einladung mit den aktuellen Traktanden und Terminen druckfertig zu rendern.
                        </p>
                        <button class="btn btn-primary btn-sm rounded-3 fw-semibold shadow-sm" onclick="gvDossierRefreshPreview()">
                            <i class="fas fa-magic me-1"></i> Vorschau jetzt generieren
                        </button>
                    </div>
                `;
            }
        } else {
            // Live E-Mail Vorschau
            const subj = (document.getElementById('gv-camp-subj')?.value || state.campaign?.email_subject || 'Einladung GV')
                .replace(/{{mitglied\.vorname}}/gi, curMember.first_name || 'Vorname')
                .replace(/{{mitglied\.nachname}}/gi, curMember.last_name || 'Nachname');

            let rawBody = getGVCampaignMailBody()
                .replace(/{{mitglied\.vorname}}/gi, escapeHtml(curMember.first_name || 'Hans'))
                .replace(/{{mitglied\.nachname}}/gi, escapeHtml(curMember.last_name || 'Muster'))
                .replace(/{{mitglied\.anrede}}/gi, `Lieber ${escapeHtml(curMember.first_name || 'Hans')}`)
                .replace(/{{event\.datum_formatiert}}/gi, formatSwissDate(state.gvInstance?.datum) || `im März ${state.year}`)
                .replace(/{{dossier\.download_url}}/gi, `<a href="${state.compiledPdfUrl || '#'}" target="_blank" class="fw-bold text-primary">👉 GV-Dossier ${state.year} herunterladen (PDF)</a>`);

            let renderedBodyHtml = '';
            if (window.ClubWysiwyg && typeof window.ClubWysiwyg.cleanHtml === 'function') {
                renderedBodyHtml = window.ClubWysiwyg.cleanHtml(rawBody);
            } else if (/<[a-z][\s\S]*>/i.test(rawBody)) {
                renderedBodyHtml = rawBody;
            } else {
                renderedBodyHtml = rawBody.split(/\n\s*\n/).map(p => `<p style="margin:0 0 12px 0;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`).join('');
            }

            panel.innerHTML = `
                <div class="p-4 overflow-auto" style="max-height: 580px;">
                    <div class="d-flex justify-content-between align-items-center mb-2">
                        <span class="small fw-bold text-muted text-uppercase">E-Mail-Vorschau für ${escapeHtml(curMember.first_name)} ${escapeHtml(curMember.last_name)}</span>
                        <button class="btn btn-xs btn-outline-primary" onclick="gvDossierSetLeftTab('mail')" title="Text im Editor bearbeiten">
                            <i class="fas fa-edit me-1"></i> E-Mail-Text bearbeiten
                        </button>
                    </div>

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
    // TRAKTANDEN MANAGER: AKTIONEN & DRAG & DROP
    // =========================================================================

    function initSortableTraktanden() {
        if (typeof Sortable === 'undefined') return;

        // 1. Aktive Traktanden Sortable (unterstützt Verschieben & Reorganisieren)
        const mainList = document.getElementById('gvTraktandenSortableList');
        if (mainList) {
            Sortable.create(mainList, {
                group: 'gvTraktandenUnifiedGroup',
                animation: 150,
                handle: '.gv-main-drag-handle, .gv-pool-drag-handle',
                draggable: '.gv-traktandum-main-row, .gv-traktandum-pool-row',
                onAdd: async function (evt) {
                    const supa = getSupabase();
                    if (!supa) return;
                    const trId = evt.item.dataset.trId;
                    if (trId) {
                        // Aus dem Pool in die aktive Liste gezogen
                        await supa.from('gv_traktanden').update({ is_in_pool: false, updated_at: new Date().toISOString() }).eq('id', trId);
                        await supa.from('gv_traktanden').update({ is_in_pool: false, updated_at: new Date().toISOString() }).eq('parent_id', trId);
                    }
                    await gvDossierSyncActiveNumbering();
                    await loadGVDossierData();
                    renderLeftPanel();
                    if (typeof showToast === 'function') showToast("Traktandum zur GV hinzugefügt!", 'success');
                },
                onUpdate: async function () {
                    await gvDossierSyncActiveNumbering();
                    await loadGVDossierData();
                    renderLeftPanel();
                    if (typeof showToast === 'function') showToast("Reihenfolge gespeichert!", 'success');
                }
            });
        }

        // 2. Traktanden-Pool Sortable (Vorratskammer)
        const poolList = document.getElementById('gvTraktandenPoolSortableList');
        if (poolList) {
            Sortable.create(poolList, {
                group: 'gvTraktandenUnifiedGroup',
                animation: 150,
                handle: '.gv-main-drag-handle, .gv-pool-drag-handle',
                draggable: '.gv-traktandum-main-row, .gv-traktandum-pool-row',
                onAdd: async function (evt) {
                    const supa = getSupabase();
                    if (!supa) return;
                    const trId = evt.item.dataset.trId;
                    if (trId) {
                        // Aus aktiver Liste in den Pool abgelegt
                        await supa.from('gv_traktanden').update({ is_in_pool: true, updated_at: new Date().toISOString() }).eq('id', trId);
                        await supa.from('gv_traktanden').update({ is_in_pool: true, updated_at: new Date().toISOString() }).eq('parent_id', trId);
                    }
                    await gvDossierSyncActiveNumbering();
                    await loadGVDossierData();
                    renderLeftPanel();
                    if (typeof showToast === 'function') showToast("Traktandum im Pool abgelegt.", 'info');
                }
            });
        }

        // 3. Untertraktanden Sortable
        const subLists = document.querySelectorAll('.gv-subtraktanden-list');
        subLists.forEach(subList => {
            Sortable.create(subList, {
                animation: 150,
                handle: '.gv-sub-drag-handle',
                draggable: '.gv-sub-row',
                onEnd: async function () {
                    const supa = getSupabase();
                    if (!supa) return;
                    const rows = subList.querySelectorAll('.gv-sub-row');
                    const updates = [];
                    rows.forEach((row, idx) => {
                        const trId = row.dataset.trId;
                        if (trId) {
                            updates.push(supa.from('gv_traktanden').update({ sort_order: idx + 1, updated_at: new Date().toISOString() }).eq('id', trId));
                        }
                    });
                    try {
                        await Promise.all(updates);
                        await gvDossierSyncActiveNumbering();
                        if (typeof showToast === 'function') showToast("Unterpunkt-Reihenfolge gespeichert!", 'success');
                        await loadGVDossierData();
                        renderLeftPanel();
                    } catch (e) {
                        console.error("Fehler beim Sortieren der Unterpunkte:", e);
                    }
                }
            });
        });
    }

    /**
     * Synchronisiert und aktualisiert die fortlaufende Nummerierung aller aktiven Traktanden in der Datenbank
     */
    window.gvDossierSyncActiveNumbering = async function () {
        const supa = getSupabase();
        if (!supa) return;
        const state = window._gvDossierState;
        const gvId = state.gvInstance?.id || `gv_${state.year}`;

        // DOM-Reihenfolge abfragen falls vorhanden
        const mainList = document.getElementById('gvTraktandenSortableList');
        let orderedMainIds = [];
        if (mainList) {
            const rows = mainList.querySelectorAll('.gv-traktandum-main-row, .gv-traktandum-pool-row');
            rows.forEach(r => {
                if (r.dataset.trId) orderedMainIds.push(r.dataset.trId);
            });
        }

        const { data: allActive, error } = await supa
            .from('gv_traktanden')
            .select('*')
            .eq('gv_id', gvId)
            .eq('is_in_pool', false);

        if (error || !allActive || allActive.length === 0) return;

        let mains = allActive.filter(t => !t.parent_id);
        if (orderedMainIds.length > 0) {
            mains.sort((a, b) => {
                const idxA = orderedMainIds.indexOf(a.id);
                const idxB = orderedMainIds.indexOf(b.id);
                if (idxA !== -1 && idxB !== -1) return idxA - idxB;
                if (idxA !== -1) return -1;
                if (idxB !== -1) return 1;
                return (a.sort_order || 0) - (b.sort_order || 0);
            });
        } else {
            mains.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        }

        const updates = [];
        mains.forEach((main, mIdx) => {
            const dynamicNum = String(mIdx + 1);
            updates.push(
                supa.from('gv_traktanden').update({
                    sort_order: mIdx + 1,
                    nummer: dynamicNum,
                    updated_at: new Date().toISOString()
                }).eq('id', main.id)
            );

            // Untertraktanden fortlaufend nummerieren (z. B. 8.1, 8.2 ...)
            const subs = allActive.filter(t => t.parent_id === main.id).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
            subs.forEach((sub, sIdx) => {
                const subNum = `${dynamicNum}.${sIdx + 1}`;
                updates.push(
                    supa.from('gv_traktanden').update({
                        sort_order: sIdx + 1,
                        nummer: subNum,
                        updated_at: new Date().toISOString()
                    }).eq('id', sub.id)
                );
            });
        });

        try {
            await Promise.all(updates);
        } catch (e) {
            console.error("Fehler bei gvDossierSyncActiveNumbering:", e);
        }
    };

    /**
     * Verschiebt ein Traktandum (und seine Unterpunkte) in den Pool
     */
    window.gvDossierMoveToPool = async function (trId) {
        const supa = getSupabase();
        if (!supa) return;
        try {
            await Promise.all([
                supa.from('gv_traktanden').update({ is_in_pool: true, updated_at: new Date().toISOString() }).eq('id', trId),
                supa.from('gv_traktanden').update({ is_in_pool: true, updated_at: new Date().toISOString() }).eq('parent_id', trId)
            ]);

            if (typeof showToast === 'function') showToast("Traktandum in den Pool abgelegt.", 'info');
            await gvDossierSyncActiveNumbering();
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Ablegen in den Pool:", err);
            alert("Fehler: " + err.message);
        }
    };

    /**
     * Übernimmt ein Traktandum aus dem Pool in die aktive Traktandenliste
     */
    window.gvDossierMoveFromPool = async function (trId) {
        const supa = getSupabase();
        if (!supa) return;
        try {
            await Promise.all([
                supa.from('gv_traktanden').update({ is_in_pool: false, updated_at: new Date().toISOString() }).eq('id', trId),
                supa.from('gv_traktanden').update({ is_in_pool: false, updated_at: new Date().toISOString() }).eq('parent_id', trId)
            ]);

            if (typeof showToast === 'function') showToast("Traktandum zur GV übernommen!", 'success');
            await gvDossierSyncActiveNumbering();
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Übernehmen aus dem Pool:", err);
            alert("Fehler: " + err.message);
        }
    };

    /**
     * Fügt häufig verwendete Muster-Vorlagen in den Traktanden-Pool ein
     */
    window.gvDossierAddPoolSampleItems = async function () {
        const supa = getSupabase();
        if (!supa) return;
        const state = window._gvDossierState;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;

        const samples = [
            {
                titel: 'Beschaffung neue Vereinsbekleidung',
                referent: 'Materialverwalter',
                beschreibung: 'Präsentation Muster und Beschlussfassung über Kostenbeteiligung des Vereins.',
                is_election: false
            },
            {
                titel: 'Teilrevision der Vereinsstatuten',
                referent: 'Präsident',
                beschreibung: 'Anpassung von Art. 12 (Mitgliederkategorien) und Art. 25 (Stimmrecht).',
                is_election: false
            },
            {
                titel: 'Investition / Erneuerung Scheibenanlage (SIUS)',
                referent: 'Schützenmeister',
                beschreibung: 'Kreditantrag für den Ersatz von 2 Polytronic/SIUS-Lägern.',
                is_election: false
            },
            {
                titel: 'Ersatzwahl Vorstand',
                referent: 'Präsident',
                beschreibung: 'Ersatzwahl für ein vorzeitig zurücktretendes Vorstandsmitglied.',
                is_election: true,
                candidate_names: 'Vorschlag: Anna Muster'
            }
        ];

        try {
            for (let i = 0; i < samples.length; i++) {
                const s = samples[i];
                const sampleId = `tr_pool_${curYear}_${Date.now().toString(36)}_${i}`;
                await supa.from('gv_traktanden').insert({
                    id: sampleId,
                    gv_id: gvId,
                    parent_id: null,
                    sort_order: 100 + i,
                    nummer: 'P',
                    titel: s.titel,
                    referent: s.referent,
                    beschreibung: s.beschreibung,
                    is_election: s.is_election,
                    candidate_names: s.candidate_names || null,
                    is_in_pool: true,
                    status: 'offen'
                });
            }
            if (typeof showSuccess === 'function') showSuccess("Muster-Vorlagen zum Traktanden-Pool hinzugefügt!");
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Hinzufügen von Pool-Vorlagen:", err);
            alert("Fehler: " + err.message);
        }
    };

    /**
     * Modal zum Hinzufügen eines Wahltraktandums
     */
    window.gvDossierAddElectionTraktandumModal = function () {
        gvDossierAddTraktandumModal(null, true);
    };

    /**
     * Modal zum Hinzufügen eines neuen Haupt- oder Untertraktandums (automatische fortlaufende Nummer)
     */
    window.gvDossierAddTraktandumModal = function (parentId, isElectionDefault = false) {
        const state = window._gvDossierState;
        const allItems = state.traktanden || [];
        const isSub = Boolean(parentId);
        let parentItem = null;

        if (isSub) {
            parentItem = allItems.find(t => t.id === parentId);
        }

        const modalHtml = `
            <div class="modal fade show" id="gvTraktandumModal" tabindex="-1" style="display:block; background:rgba(0,0,0,0.5);" aria-modal="true" role="dialog">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 rounded-4 shadow-lg">
                        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
                            <h5 class="modal-title fw-bold">
                                <i class="fas fa-${isSub ? 'indent' : (isElectionDefault ? 'vote-yea' : 'plus-circle')} me-2"></i>
                                ${isSub ? `Untertraktandum zu "${escapeHtml(parentItem?.titel || '')}"` : (isElectionDefault ? 'Neues Wahltraktandum' : 'Neues Haupttraktandum')}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" onclick="gvDossierCloseModal()"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="gvTraktandumForm" onsubmit="event.preventDefault(); gvDossierSaveNewTraktandum('${parentId || ''}');">
                                <div class="row g-2 mb-3">
                                    <div class="col-4">
                                        <label class="form-label small fw-bold text-muted">Nummerierung</label>
                                        <div class="form-control form-control-sm bg-light fw-bold text-primary border text-center" title="Nummerierung wird automatisch fortlaufend vergeben">
                                            <i class="fas fa-magic me-1 text-muted"></i> Automatisch
                                        </div>
                                    </div>
                                    <div class="col-8">
                                        <label class="form-label small fw-bold text-muted">Referent / Zuständig</label>
                                        <input type="text" id="trModalReferent" class="form-control form-control-sm" placeholder="z. B. Präsident, Tagespräsident" list="gvReferentenList" value="${isElectionDefault ? 'Tagespräsident' : ''}">
                                        <datalist id="gvReferentenList">
                                            <option value="Präsident">
                                            <option value="Tagespräsident">
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
                                    <input type="text" id="trModalTitel" class="form-control" placeholder="z. B. Mutationen oder Wahlen" value="${isElectionDefault ? 'Gesamterneuerungswahlen' : ''}" oninput="gvDossierUpdateModalPreview(this.value)" required autofocus>
                                    <div class="d-flex align-items-center gap-1.5 flex-wrap mt-1.5">
                                        <span class="text-muted small" style="font-size:0.75rem;"><i class="fas fa-magic me-1"></i>Auto-Jahreszahlen:</span>
                                        <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{jahr_vorjahr}}')">
                                            {{jahr_vorjahr}} <span class="text-muted">(Vorjahr/Rechnung)</span>
                                        </button>
                                        <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{datum_vorjahr}}')">
                                            {{datum_vorjahr}} <span class="text-muted">(Datum Vorjahr)</span>
                                        </button>
                                        <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{jahr}}')">
                                            {{jahr}} <span class="text-muted">(GV-Jahr/Budget)</span>
                                        </button>
                                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{gv_nummer_vorjahr}}')">
                                            {{gv_nummer_vorjahr}} <span class="text-muted">(GV-Nr. Vorjahr)</span>
                                        </button>
                                    </div>
                                    <div class="mt-1.5 small text-muted bg-light p-1.5 rounded border" id="trModalPreviewWrap" style="font-size:0.75rem;">
                                        <i class="fas fa-eye me-1 text-primary"></i>Vorschau: <strong class="text-dark" id="trModalPreview">${escapeHtml(gvDossierResolveTraktandumText(isElectionDefault ? 'Gesamterneuerungswahlen' : '')) || '(leer)'}</strong>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-muted">Beschreibung / Antrag (Optional)</label>
                                    <textarea id="trModalText" class="form-control form-control-sm" rows="3" placeholder="Zusätzliche Erläuterungen oder Beschlussanträge..."></textarea>
                                </div>
                                <div class="card border rounded-3 p-2.5 bg-light mb-3">
                                    <div class="form-check form-switch mb-1">
                                        <input class="form-check-input" type="checkbox" id="trModalIsElection" ${isElectionDefault ? 'checked' : ''} onchange="document.getElementById('trCandidateGroup').style.display = this.checked ? 'block' : 'none';">
                                        <label class="form-check-label small fw-bold text-dark" for="trModalIsElection">
                                            <i class="fas fa-vote-yea text-warning me-1"></i> Wahlgeschäft (Erneuerungs- / Ersatzwahl)
                                        </label>
                                    </div>
                                    <div id="trCandidateGroup" style="${isElectionDefault ? '' : 'display:none;'}">
                                        <label class="form-label small fw-semibold text-muted mb-1 mt-1">Kandidierende Personen</label>
                                        <input type="text" id="trModalCandidates" class="form-control form-control-sm" placeholder="z. B. Max Muster (Präsident), Beat Beispiel (Kassier)">
                                    </div>
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
        const titel = document.getElementById('trModalTitel')?.value.trim();
        const referent = document.getElementById('trModalReferent')?.value.trim();
        const beschreibung = document.getElementById('trModalText')?.value.trim();
        const isElection = Boolean(document.getElementById('trModalIsElection')?.checked);
        const candidates = document.getElementById('trModalCandidates')?.value.trim();

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
                nummer: String(nextSort),
                titel: titel,
                beschreibung: beschreibung || null,
                referent: referent || null,
                is_election: isElection,
                candidate_names: candidates || null,
                is_in_pool: false,
                status: 'offen'
            });

            if (error) throw error;

            gvDossierCloseModal();
            if (typeof showToast === 'function') showToast("Traktandum erfolgreich erfasst!", 'success');
            await gvDossierSyncActiveNumbering();
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
        const all = [...(state.traktanden || []), ...(state.traktandenPool || [])];
        const item = all.find(t => t.id === trId);
        if (!item) return;

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
                                        <label class="form-label small fw-bold text-muted">Nummerierung</label>
                                        <div class="form-control form-control-sm bg-light fw-bold text-primary border text-center" title="Nummerierung wird automatisch fortlaufend vergeben">
                                            <i class="fas fa-hashtag me-1 text-muted"></i> ${escapeHtml(item.nummer || 'Auto')}
                                        </div>
                                    </div>
                                    <div class="col-8">
                                        <label class="form-label small fw-bold text-muted">Referent / Zuständig</label>
                                        <input type="text" id="trModalReferent" class="form-control form-control-sm" value="${escapeHtml(item.referent || '')}" list="gvReferentenList">
                                        <datalist id="gvReferentenList">
                                            <option value="Präsident">
                                            <option value="Tagespräsident">
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
                                    <input type="text" id="trModalTitel" class="form-control" value="${escapeHtml(item.titel || '')}" oninput="gvDossierUpdateModalPreview(this.value)" required>
                                    <div class="d-flex align-items-center gap-1.5 flex-wrap mt-1.5">
                                        <span class="text-muted small" style="font-size:0.75rem;"><i class="fas fa-magic me-1"></i>Auto-Jahreszahlen:</span>
                                        <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{jahr_vorjahr}}')">
                                            {{jahr_vorjahr}} <span class="text-muted">(Vorjahr/Rechnung)</span>
                                        </button>
                                        <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{datum_vorjahr}}')">
                                            {{datum_vorjahr}} <span class="text-muted">(Datum Vorjahr)</span>
                                        </button>
                                        <button type="button" class="btn btn-xs btn-outline-primary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{jahr}}')">
                                            {{jahr}} <span class="text-muted">(GV-Jahr/Budget)</span>
                                        </button>
                                        <button type="button" class="btn btn-xs btn-outline-secondary py-0 px-1.5 rounded-pill font-monospace" style="font-size:0.7rem;" onclick="gvDossierInsertTraktandumVar('{{gv_nummer_vorjahr}}')">
                                            {{gv_nummer_vorjahr}} <span class="text-muted">(GV-Nr. Vorjahr)</span>
                                        </button>
                                    </div>
                                    <div class="mt-1.5 small text-muted bg-light p-1.5 rounded border" id="trModalPreviewWrap" style="font-size:0.75rem;">
                                        <i class="fas fa-eye me-1 text-primary"></i>Vorschau: <strong class="text-dark" id="trModalPreview">${escapeHtml(gvDossierResolveTraktandumText(item.titel || '')) || '(leer)'}</strong>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold text-muted">Beschreibung / Antrag (Optional)</label>
                                    <textarea id="trModalText" class="form-control form-control-sm" rows="3">${escapeHtml(item.beschreibung || '')}</textarea>
                                </div>
                                <div class="card border rounded-3 p-2.5 bg-light mb-3">
                                    <div class="form-check form-switch mb-1">
                                        <input class="form-check-input" type="checkbox" id="trModalIsElection" ${item.is_election ? 'checked' : ''} onchange="document.getElementById('trCandidateGroup').style.display = this.checked ? 'block' : 'none';">
                                        <label class="form-check-label small fw-bold text-dark" for="trModalIsElection">
                                            <i class="fas fa-vote-yea text-warning me-1"></i> Wahlgeschäft (Erneuerungs- / Ersatzwahl)
                                        </label>
                                    </div>
                                    <div id="trCandidateGroup" style="${item.is_election ? '' : 'display:none;'}">
                                        <label class="form-label small fw-semibold text-muted mb-1 mt-1">Kandidierende Personen</label>
                                        <input type="text" id="trModalCandidates" class="form-control form-control-sm" value="${escapeHtml(item.candidate_names || '')}" placeholder="z. B. Max Muster (Präsident), Beat Beispiel (Kassier)">
                                    </div>
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

        const titel = document.getElementById('trModalTitel')?.value.trim();
        const referent = document.getElementById('trModalReferent')?.value.trim();
        const beschreibung = document.getElementById('trModalText')?.value.trim();
        const isElection = Boolean(document.getElementById('trModalIsElection')?.checked);
        const candidates = document.getElementById('trModalCandidates')?.value.trim();

        if (!titel) {
            alert("Bitte einen Titel angeben.");
            return;
        }

        try {
            const { error } = await supa.from('gv_traktanden').update({
                titel: titel,
                beschreibung: beschreibung || null,
                referent: referent || null,
                is_election: isElection,
                candidate_names: candidates || null,
                updated_at: new Date().toISOString()
            }).eq('id', trId);

            if (error) throw error;

            gvDossierCloseModal();
            if (typeof showToast === 'function') showToast("Traktandum aktualisiert!", 'success');
            await gvDossierSyncActiveNumbering();
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Aktualisieren des Traktandums:", err);
            alert("Fehler beim Aktualisieren: " + err.message);
        }
    };

    /**
     * Traktandum nach oben oder unten verschieben
     */
    window.gvDossierMoveTraktandum = async function (trId, direction) {
        const supa = getSupabase();
        if (!supa) return;

        const state = window._gvDossierState;
        const allItems = state.traktanden || [];
        const currentItem = allItems.find(t => t.id === trId);
        if (!currentItem) return;

        const siblings = allItems
            .filter(t => t.parent_id === currentItem.parent_id)
            .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

        const currentIndex = siblings.findIndex(t => t.id === trId);
        if (currentIndex === -1) return;

        const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
        if (targetIndex < 0 || targetIndex >= siblings.length) return;

        const targetItem = siblings[targetIndex];
        const currentOrder = currentItem.sort_order || (currentIndex + 1);
        const targetOrder = targetItem.sort_order || (targetIndex + 1);

        try {
            await Promise.all([
                supa.from('gv_traktanden').update({ sort_order: targetOrder, updated_at: new Date().toISOString() }).eq('id', currentItem.id),
                supa.from('gv_traktanden').update({ sort_order: currentOrder, updated_at: new Date().toISOString() }).eq('id', targetItem.id)
            ]);

            await gvDossierSyncActiveNumbering();
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Verschieben:", err);
            alert("Verschieben fehlgeschlagen: " + err.message);
        }
    };

    /**
     * Traktandum löschen
     */
    window.gvDossierDeleteTraktandum = async function (trId) {
        const state = window._gvDossierState;
        const all = [...(state.traktanden || []), ...(state.traktandenPool || [])];
        const item = all.find(t => t.id === trId);
        if (!item) return;

        const hasChildren = all.some(t => t.parent_id === trId);
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
            await gvDossierSyncActiveNumbering();
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Löschfehler:", err);
            alert("Löschen fehlgeschlagen: " + err.message);
        }
    };

    /**
     * Kopiert alle Traktanden aus dem Vorjahr ins aktuelle Jahr
     */
    window.gvDossierCopyPreviousYearTraktanden = async function () {
        const supa = getSupabase();
        if (!supa) return;
        const state = window._gvDossierState;
        const curYear = state.year;
        const prevYear = curYear - 1;
        const prevGvId = `gv_${prevYear}`;
        const targetGvId = state.gvInstance?.id || `gv_${curYear}`;

        try {
            const { data: prevItems, error } = await supa
                .from('gv_traktanden')
                .select('*')
                .eq('gv_id', prevGvId)
                .order('sort_order', { ascending: true });

            if (error) throw error;
            if (!prevItems || prevItems.length === 0) {
                alert(`Keine Traktanden aus dem Vorjahr ${prevYear} gefunden.`);
                return;
            }

            const idMap = new Map();
            const mainItems = prevItems.filter(t => !t.parent_id);
            const subItems = prevItems.filter(t => Boolean(t.parent_id));

            for (const main of mainItems) {
                const newId = `tr_${curYear}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
                idMap.set(main.id, newId);
                let titleClean = main.titel || '';
                if (!titleClean.includes('{{jahr') && !titleClean.includes('{jahr')) {
                    titleClean = titleClean
                        .replace(new RegExp(String(prevYear), 'g'), '{{jahr}}')
                        .replace(new RegExp(String(prevYear - 1), 'g'), '{{jahr_vorjahr}}');
                }

                await supa.from('gv_traktanden').insert({
                    id: newId,
                    gv_id: targetGvId,
                    parent_id: null,
                    sort_order: main.sort_order,
                    nummer: main.nummer,
                    titel: titleClean,
                    beschreibung: main.beschreibung,
                    referent: main.referent,
                    is_in_pool: false,
                    status: 'offen'
                });
            }

            for (const sub of subItems) {
                const newParentId = idMap.get(sub.parent_id);
                if (!newParentId) continue;
                const newSubId = `tr_${curYear}_sub_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 6)}`;
                let subTitleClean = sub.titel || '';
                if (!subTitleClean.includes('{{jahr') && !subTitleClean.includes('{jahr')) {
                    subTitleClean = subTitleClean
                        .replace(new RegExp(String(prevYear), 'g'), '{{jahr}}')
                        .replace(new RegExp(String(prevYear - 1), 'g'), '{{jahr_vorjahr}}');
                }

                await supa.from('gv_traktanden').insert({
                    id: newSubId,
                    gv_id: targetGvId,
                    parent_id: newParentId,
                    sort_order: sub.sort_order,
                    nummer: sub.nummer,
                    titel: subTitleClean,
                    beschreibung: sub.beschreibung,
                    referent: sub.referent,
                    is_in_pool: false,
                    status: 'offen'
                });
            }

            if (typeof showSuccess === 'function') showSuccess(`Traktanden erfolgreich aus ${prevYear} übernommen!`);
            await gvDossierSyncActiveNumbering();
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler bei Vorjahresübernahme:", err);
            alert("Vorjahresübernahme fehlgeschlagen: " + err.message);
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
            { title: 'Begrüssung und Appell', ref: 'Präsident', text: 'Eröffnung der Versammlung und Feststellung der Beschlussfähigkeit.' },
            { title: 'Wahl der Stimmenzähler', ref: 'Präsident', text: 'Bestimmung der Stimmenzähler für offene und geheime Wahlen.' },
            { title: 'Protokoll der GV vom {{datum_vorjahr}}', ref: 'Aktuar', text: 'Genehmigung des Vorjahres-Protokolls.' },
            { title: 'Mutationen (Aufnahmen, Austritte, Ehrungen)', ref: 'Präsident', text: 'Aufnahme neuer Mitglieder und Totengedenken.' },
            { title: 'Jahresberichte (Präsident, Schützenmeister, Jungschützen)', ref: 'Vorstand', text: 'Berichte des Vorstands und der Spartenleiter.' },
            { title: 'Jahresrechnung {{jahr_vorjahr}} und Revisorenbericht', ref: 'Kassier / Revisoren', text: 'Abnahme der Jahresrechnung und Décharge-Erteilung.' },
            { title: 'Budget {{jahr}} und Festsetzung der Jahresbeiträge', ref: 'Kassier', text: 'Genehmigung des Voranschlags und der Beiträge.' },
            { title: 'Jahresprogramm {{jahr}}', ref: 'Schützenmeister', text: 'Vorstellung und Festlegung des Schiesskalenders.' },
            { title: 'Ehrungen und Auszeichnungen', ref: 'Präsident', text: 'Würdigung verdienter Schützen und Jubilare.' },
            { title: 'Erledigung von Anträgen & Varia', ref: 'Präsident', text: 'Behandlung statutengemäss eingereichter Anträge.' }
        ];

        const defaultWahl = [
            ...defaultNormal.slice(0, 7),
            { title: 'Gesamterneuerungswahlen', ref: 'Tagespräsident', text: 'Wahl des Präsidenten, der Vorstandsmitglieder und Revisoren.', is_election: true },
            ...defaultNormal.slice(7)
        ];

        const selectedList = isWahljahr ? defaultWahl : defaultNormal;

        try {
            // Aktive Traktanden ersetzen (Pool bleibt erhalten!)
            await supa.from('gv_traktanden').delete().eq('gv_id', gvId).eq('is_in_pool', false);

            const rows = selectedList.map((item, idx) => ({
                id: `tr_${curYear}_std_${idx + 1}`,
                gv_id: gvId,
                parent_id: null,
                sort_order: idx + 1,
                nummer: String(idx + 1),
                titel: item.title,
                referent: item.ref,
                beschreibung: item.text,
                is_election: Boolean(item.is_election),
                is_in_pool: false,
                status: 'offen'
            }));

            const { error } = await supa.from('gv_traktanden').insert(rows);
            if (error) throw error;

            if (typeof showSuccess === 'function') showSuccess("Standard-Traktanden erfolgreich geladen!");
            await gvDossierSyncActiveNumbering();
            await loadGVDossierData();
            renderLeftPanel();
        } catch (err) {
            console.error("Fehler beim Laden der Standard-Traktanden:", err);
            alert("Fehler: " + err.message);
        }
    };

    /**
     * Schalter für Gesamterneuerungswahlen: Steuert Wahltraktanden dynamisch zwischen Pool & aktiver GV
     */
    window.gvDossierToggleWahljahr = async function (isChecked) {
        const supa = getSupabase();
        if (!supa) return;
        const state = window._gvDossierState;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;

        if (state.gvInstance) state.gvInstance.is_election_year = isChecked;
        if (state.gvDraft) state.gvDraft.is_election_year = isChecked;

        // 1. Direkt in public.gv_instances persistieren
        try {
            await supa.from('gv_instances').update({
                is_election_year: isChecked,
                updated_at: new Date().toISOString()
            }).eq('id', gvId);
        } catch (err) {
            console.error("Fehler beim Aktualisieren von gv_instances:", err);
        }

        // 2. Traktanden Pool / Active Logik
        try {
            const { data: allItems } = await supa
                .from('gv_traktanden')
                .select('*')
                .eq('gv_id', gvId)
                .order('sort_order', { ascending: true });

            const items = allItems || [];
            const wahlPoolItems = items.filter(t => t.is_in_pool && (t.is_election || (t.titel && t.titel.toLowerCase().includes('wahl'))));
            const wahlActiveItems = items.filter(t => !t.is_in_pool && (t.is_election || (t.titel && t.titel.toLowerCase().includes('wahl'))));

            if (isChecked) {
                if (wahlPoolItems.length > 0) {
                    // Aus dem Pool nach oben in die aktive Liste holen
                    for (const wp of wahlPoolItems) {
                        await supa.from('gv_traktanden').update({ is_in_pool: false, is_election: true, updated_at: new Date().toISOString() }).eq('id', wp.id);
                        await supa.from('gv_traktanden').update({ is_in_pool: false, updated_at: new Date().toISOString() }).eq('parent_id', wp.id);
                    }
                    if (typeof showToast === 'function') showToast("🗳️ Wahltraktanden aus dem Pool zur GV übernommen!", 'success');
                } else if (wahlActiveItems.length === 0) {
                    // Neu generieren falls noch überhaupt keine Wahltraktanden existieren
                    const wahlMainId = `tr_${curYear}_wahlen_${Date.now().toString(36)}`;
                    const activeMains = items.filter(t => !t.is_in_pool && !t.parent_id);
                    const nextSort = activeMains.length + 1;

                    await supa.from('gv_traktanden').insert({
                        id: wahlMainId,
                        gv_id: gvId,
                        parent_id: null,
                        sort_order: nextSort,
                        nummer: String(nextSort),
                        titel: 'Gesamterneuerungswahlen',
                        referent: 'Tagespräsident',
                        beschreibung: 'Wahlen des Vorstands, des Präsidenten, der Revisoren und des Fähnrichs.',
                        is_election: true,
                        is_in_pool: false,
                        status: 'offen'
                    });

                    const subWahlen = [
                        { titel: 'Wahl der Vorstandsmitglieder', ref: 'Tagespräsident' },
                        { titel: 'Wahl des Präsidenten', ref: 'Tagespräsident' },
                        { titel: 'Wahl der Rechnungsrevisoren', ref: 'Präsident' },
                        { titel: 'Wahl des Fähnrichs', ref: 'Präsident' }
                    ];

                    for (let sIdx = 0; sIdx < subWahlen.length; sIdx++) {
                        const sw = subWahlen[sIdx];
                        await supa.from('gv_traktanden').insert({
                            id: `${wahlMainId}_sub_${sIdx + 1}`,
                            gv_id: gvId,
                            parent_id: wahlMainId,
                            sort_order: sIdx + 1,
                            nummer: `${nextSort}.${sIdx + 1}`,
                            titel: sw.titel,
                            referent: sw.ref,
                            beschreibung: '',
                            is_election: true,
                            is_in_pool: false,
                            status: 'offen'
                        });
                    }
                    if (typeof showToast === 'function') showToast("🗳️ Wahltraktanden automatisch hinzugefügt!", 'success');
                }
            } else {
                // Bei Deaktivierung: In den Pool ablegen (NICHT löschen!)
                for (const wa of wahlActiveItems) {
                    await supa.from('gv_traktanden').update({ is_in_pool: true, updated_at: new Date().toISOString() }).eq('id', wa.id);
                    await supa.from('gv_traktanden').update({ is_in_pool: true, updated_at: new Date().toISOString() }).eq('parent_id', wa.id);
                }
                if (wahlActiveItems.length > 0 && typeof showToast === 'function') {
                    showToast("📦 Wahltraktanden in den Pool verschoben (bleiben für spätere Wahljahre erhalten).", 'info');
                }
            }
        } catch (err) {
            console.error("Fehler bei gvDossierToggleWahljahr:", err);
        }

        await gvDossierSyncActiveNumbering();
        await loadGVDossierData();
        renderLeftPanel();
        gvDossierUpdateStammdatenDirtyState();
    };

    // =========================================================================
    // STAMMDATEN & PDF-TEXTE: DIRTY TRACKER & SPEICHERN
    // =========================================================================

    window.gvDossierInsertPlaceholder = function (ph) {
        const active = window._gvLastFocusedPdfInput || document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.id.startsWith('gv-pdf-')) {
            const start = active.selectionStart || 0;
            const end = active.selectionEnd || 0;
            const val = active.value || '';
            active.value = val.substring(0, start) + ph + val.substring(end);
            active.selectionStart = active.selectionEnd = start + ph.length;
            active.focus();
        } else {
            const introEl = document.getElementById('gv-pdf-intro');
            if (introEl) {
                introEl.value = (introEl.value || '') + ph;
                introEl.focus();
            }
        }
        gvDossierOnStammdatenFieldChange();
    };

    window.gvDossierInsertFormatting = function (before, after) {
        const active = window._gvLastFocusedPdfInput || document.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA') && active.id.startsWith('gv-pdf-')) {
            const start = active.selectionStart || 0;
            const end = active.selectionEnd || 0;
            const val = active.value || '';
            const selected = val.substring(start, end) || 'Fetter Text';
            active.value = val.substring(0, start) + before + selected + after + val.substring(end);
            active.selectionStart = start + before.length;
            active.selectionEnd = start + before.length + selected.length;
            active.focus();
        } else {
            const introEl = document.getElementById('gv-pdf-intro');
            if (introEl) {
                introEl.value = (introEl.value || '') + before + 'Fetter Text' + after;
                introEl.focus();
            }
        }
        gvDossierOnStammdatenFieldChange();
    };

    window.gvDossierRefreshLivePdfPreview = async function () {
        gvDossierCollectStammdatenFormValues();
        const state = window._gvDossierState;
        state.activeRightTab = 'preview-pdf';
        renderRightPanel();
        if (typeof gvDossierRefreshPreview === 'function') {
            await gvDossierRefreshPreview();
        }
    };

    function gvDossierCollectStammdatenFormValues() {
        const state = window._gvDossierState;
        const curDraft = state.gvDraft || state.gvInstance || {};

        // Wahljahr-Schalter (kann in Tab 1 traktanden oder Tab 2 stammdaten aktiv sein):
        const wahlSwitch = document.getElementById('gv-stamm-wahljahr') || document.getElementById('gv-trakt-wahljahr');
        if (wahlSwitch) {
            curDraft.is_election_year = Boolean(wahlSwitch.checked);
        }

        // Falls die Stammdaten-DOM-Felder aktuell gemountet sind:
        const numEl = document.getElementById('gv-stamm-number');
        if (numEl) {
            curDraft.number = parseInt(numEl.value, 10) || curDraft.number || 100;
            curDraft.datum = document.getElementById('gv-stamm-datum')?.value || '';
            curDraft.zeit = document.getElementById('gv-stamm-zeit')?.value?.trim() || '19:30';
            curDraft.ort = document.getElementById('gv-stamm-ort')?.value?.trim() || 'Schützenhaus Muhen';
            if (wahlSwitch) curDraft.is_election_year = Boolean(wahlSwitch.checked);
            curDraft.amtsdauer_text = document.getElementById('gv-stamm-amtsdauer')?.value?.trim() || curDraft.amtsdauer_text || '';
            curDraft.datum_vorjahr = document.getElementById('gv-stamm-vorjahr')?.value || '';
            curDraft.abmelde_datum = document.getElementById('gv-stamm-abmeldung')?.value || '';
            curDraft.mahn_datum = document.getElementById('gv-stamm-mahnung')?.value || '';
            curDraft.linked_event_id = document.getElementById('gv-stamm-linked-event')?.value || '';
            curDraft.praesident_wort = document.getElementById('gv-stamm-praesident-wort')?.value || '';
            curDraft.vorstand_mails_str = document.getElementById('gv-stamm-vorstand-mails')?.value?.trim() || '';
        }

        // Falls die PDF-Editor-DOM-Felder aktuell gemountet sind:
        const pdfTitelEl = document.getElementById('gv-pdf-titel');
        if (pdfTitelEl) {
            curDraft.einladung_titel = pdfTitelEl.value?.trim() || '';
            curDraft.einladung_intro = document.getElementById('gv-pdf-intro')?.value || '';
            curDraft.antragsfrist_hinweis = document.getElementById('gv-pdf-hinweis')?.value || '';
            curDraft.praesident_name = document.getElementById('gv-pdf-praesi-name')?.value?.trim() || '';
            curDraft.grussformel = document.getElementById('gv-pdf-gruss')?.value || '';
        }

        const origMailsStr = Array.isArray(curDraft.vorstand_mails)
            ? curDraft.vorstand_mails.join('; ')
            : (curDraft.vorstand_mails_str || '');

        state.gvDraft = {
            ...curDraft,
            number: curDraft.number || 100,
            datum: curDraft.datum || '',
            zeit: curDraft.zeit || '19:30',
            ort: curDraft.ort || 'Schützenhaus Muhen',
            is_election_year: Boolean(curDraft.is_election_year),
            amtsdauer_text: curDraft.amtsdauer_text || '',
            datum_vorjahr: curDraft.datum_vorjahr || '',
            abmelde_datum: curDraft.abmelde_datum || '',
            mahn_datum: curDraft.mahn_datum || '',
            linked_event_id: curDraft.linked_event_id || '',
            praesident_wort: curDraft.praesident_wort || '',
            vorstand_mails_str: curDraft.vorstand_mails_str !== undefined ? curDraft.vorstand_mails_str : origMailsStr,
            einladung_titel: curDraft.einladung_titel || '',
            einladung_intro: curDraft.einladung_intro || '',
            antragsfrist_hinweis: curDraft.antragsfrist_hinweis || '',
            praesident_name: curDraft.praesident_name || '',
            grussformel: curDraft.grussformel || ''
        };

        return state.gvDraft;
    }

    function gvDossierUpdateStammdatenDirtyState() {
        const cur = gvDossierCollectStammdatenFormValues();
        const orig = window._gvDossierState.gvInstanceOriginal || {};
        const origMailsStr = (orig.vorstand_mails || []).join('; ');

        let diffCount = 0;
        if (cur.number !== (orig.number || 100)) diffCount++;
        if (cur.datum !== (orig.datum || '')) diffCount++;
        if (cur.zeit !== (orig.zeit || '19:30')) diffCount++;
        if (cur.ort !== (orig.ort || 'Schützenhaus Muhen')) diffCount++;
        if (cur.is_election_year !== Boolean(orig.is_election_year)) diffCount++;
        if (cur.amtsdauer_text !== (orig.amtsdauer_text || '')) diffCount++;
        if (cur.datum_vorjahr !== (orig.datum_vorjahr || '')) diffCount++;
        if (cur.abmelde_datum !== (orig.abmelde_datum || '')) diffCount++;
        if (cur.mahn_datum !== (orig.mahn_datum || '')) diffCount++;
        if (cur.linked_event_id !== (orig.linked_event_id || '')) diffCount++;
        if (cur.praesident_wort !== (orig.praesident_wort || '')) diffCount++;
        if (cur.vorstand_mails_str !== origMailsStr) diffCount++;
        if (cur.einladung_titel !== (orig.einladung_titel || '')) diffCount++;
        if (cur.einladung_intro !== (orig.einladung_intro || '')) diffCount++;
        if (cur.antragsfrist_hinweis !== (orig.antragsfrist_hinweis || '')) diffCount++;
        if (cur.praesident_name !== (orig.praesident_name || '')) diffCount++;
        if (cur.grussformel !== (orig.grussformel || '')) diffCount++;

        if (window.SaveButtonKit) {
            window.SaveButtonKit.update('btn-save-gv-global', {
                count: diffCount,
                canWrite: true,
                label: 'Speichern',
                savedLabel: 'Gespeichert'
            });
            window.SaveButtonKit.update('btn-save-gv-stammdaten', {
                count: diffCount,
                canWrite: true,
                label: 'Stammdaten speichern',
                savedLabel: 'Stammdaten gespeichert'
            });
            window.SaveButtonKit.update('btn-save-gv-pdf-texts', {
                count: diffCount,
                canWrite: true,
                label: 'Texte speichern',
                savedLabel: 'Texte gespeichert'
            });
        }
    }

    window.gvDossierOnStammdatenFieldChange = function () {
        gvDossierCollectStammdatenFormValues();
        gvDossierUpdateStammdatenDirtyState();
    };

    /**
     * Speichert die Stammdaten & PDF-Texte in public.gv_instances
     */
    window.gvDossierSaveStammdaten = async function () {
        const supa = getSupabase();
        if (!supa) return;

        if (window.SaveButtonKit) {
            window.SaveButtonKit.update('btn-save-gv-global', { isSaving: true });
            window.SaveButtonKit.update('btn-save-gv-stammdaten', { isSaving: true });
            window.SaveButtonKit.update('btn-save-gv-pdf-texts', { isSaving: true });
        }

        const state = window._gvDossierState;
        const curYear = state.year;
        const gvId = state.gvInstance?.id || `gv_${curYear}`;

        const vals = gvDossierCollectStammdatenFormValues();
        const vorstand_mails = vals.vorstand_mails_str
            .split(';')
            .map(x => x.trim())
            .filter(Boolean);

        try {
            const { error } = await supa.from('gv_instances').upsert({
                id: gvId,
                year: curYear,
                number: vals.number,
                datum: vals.datum || null,
                zeit: vals.zeit,
                ort: vals.ort,
                is_election_year: vals.is_election_year,
                amtsdauer_text: vals.amtsdauer_text || null,
                datum_vorjahr: vals.datum_vorjahr || null,
                abmelde_datum: vals.abmelde_datum || null,
                mahn_datum: vals.mahn_datum || null,
                linked_event_id: vals.linked_event_id || null,
                praesident_wort: vals.praesident_wort,
                vorstand_mails: vorstand_mails,
                einladung_titel: vals.einladung_titel || null,
                einladung_intro: vals.einladung_intro || null,
                antragsfrist_hinweis: vals.antragsfrist_hinweis || null,
                praesident_name: vals.praesident_name || null,
                grussformel: vals.grussformel || null,
                updated_at: new Date().toISOString()
            }, { onConflict: 'year' });

            if (error) throw error;

            if (typeof showSuccess === 'function') showSuccess("GV-Stammdaten &amp; PDF-Texte erfolgreich gespeichert!");
            await loadGVDossierData();
            gvDossierUpdateStammdatenDirtyState();
            renderLeftPanel();
            renderRightPanel();
        } catch (err) {
            console.error("Fehler beim Speichern der Stammdaten:", err);
            alert("Speichern fehlgeschlagen: " + err.message);
            gvDossierUpdateStammdatenDirtyState();
        }
    };

    // =========================================================================
    // BEILAGEN, E-MAIL & VERSAND
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

                const order = [];
                const updates = [];
                items.forEach((item, idx) => {
                    const badge = item.querySelector('.gv-order-badge');
                    if (badge) badge.textContent = String(idx + 2);

                    const attId = item.dataset.attId;
                    if (attId) {
                        order.push(attId);
                        if (attId !== 'system_jahresprogramm') {
                            updates.push(supa.from('campaign_attachments').update({ sort_order: idx + 2 }).eq('id', attId));
                        }
                    }
                });

                const state = window._gvDossierState;
                const campId = state.campaign?.id;
                if (campId) {
                    const customSettings = state.campaign.custom_settings || {};
                    customSettings.attachment_order = order;
                    state.campaign.custom_settings = customSettings;
                    try {
                        await supa.from('communication_campaigns').update({
                            custom_settings: customSettings,
                            updated_at: new Date().toISOString()
                        }).eq('id', campId);
                    } catch (_) {}
                }

                try {
                    await Promise.all(updates);
                    if (typeof showToast === 'function') showToast("Beilagen-Reihenfolge aktualisiert!", 'success');
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
        const email_body = getGVCampaignMailBody().trim();

        try {
            await supa.from('communication_campaigns').update({
                email_subject,
                email_body,
                updated_at: new Date().toISOString()
            }).eq('id', state.campaign.id);

            state.campaign.email_subject = email_subject;
            state.campaign.email_body = email_body;

            if (typeof showSuccess === 'function') showSuccess("E-Mail-Konfiguration gespeichert!");
            else if (typeof showToast === 'function') showToast("E-Mail-Konfiguration gespeichert!", 'success');
            if (state.activeRightTab === 'preview-mail') renderRightPanel();
        } catch (e) {
            alert("Speichern fehlgeschlagen: " + e.message);
        }
    };

    /**
     * Gesamtes Master-GV-Dossier assembliert kompilieren
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

            const customSettings = state.campaign?.custom_settings || {};
            const attachmentOrder = customSettings.attachment_order || [];
            const draft = state.gvDraft || {};
            const inst = state.gvInstance || {};
            const curMember = state.members.find(m => m.id === state.selectedMemberId) || state.members[0] || {};

            const gvData = {
                gvId: inst.id || `gv_${year}`,
                gvNummer: draft.number || inst.number || 100,
                datum: draft.datum || inst.datum || '',
                zeit: draft.zeit || inst.zeit || '19:30',
                ort: draft.ort || inst.ort || 'Schützenhaus Muhen',
                datumVorjahr: draft.datum_vorjahr || inst.datum_vorjahr || '',
                einladung_titel: draft.einladung_titel || inst.einladung_titel || '',
                einladung_intro: draft.einladung_intro || inst.einladung_intro || '',
                antragsfrist_hinweis: draft.antragsfrist_hinweis || inst.antragsfrist_hinweis || '',
                praesident_name: draft.praesident_name || inst.praesident_name || 'Andrea Rossi',
                grussformel: draft.grussformel || inst.grussformel || '',
                vorname: curMember.first_name || '',
                nachname: curMember.last_name || '',
                anrede: curMember.first_name ? `Lieber ${curMember.first_name}` : 'Liebe Schützinnen und Schützen',
                traktanden: state.traktanden || [],
                include_calendar: customSettings.include_calendar !== false,
                attachment_order: attachmentOrder
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

    /**
     * Rendert die PDF-Vorschau der Einladung live neu
     */
    window.gvDossierRefreshPreview = async function () {
        const state = window._gvDossierState;
        const year = state.year;

        if (typeof window.gvGenerateInvitationPdf !== 'function') {
            alert("PDF-Engine für GV-Einladung nicht geladen.");
            return;
        }

        const draft = state.gvDraft || {};
        const inst = state.gvInstance || {};
        const curMember = state.members.find(m => m.id === state.selectedMemberId) || state.members[0] || {};

        const gvData = {
            gvId: inst.id || `gv_${year}`,
            gvNummer: draft.number || inst.number || 100,
            datum: draft.datum || inst.datum || '',
            zeit: draft.zeit || inst.zeit || '19:30',
            ort: draft.ort || inst.ort || 'Schützenhaus Muhen',
            datumVorjahr: draft.datum_vorjahr || inst.datum_vorjahr || '',
            einladung_titel: draft.einladung_titel || inst.einladung_titel || '',
            einladung_intro: draft.einladung_intro || inst.einladung_intro || '',
            antragsfrist_hinweis: draft.antragsfrist_hinweis || inst.antragsfrist_hinweis || '',
            praesident_name: draft.praesident_name || inst.praesident_name || 'Andrea Rossi',
            grussformel: draft.grussformel || inst.grussformel || '',
            vorname: curMember.first_name || '',
            nachname: curMember.last_name || '',
            anrede: curMember.first_name ? `Lieber ${curMember.first_name}` : 'Liebe Schützinnen und Schützen',
            traktanden: state.traktanden || []
        };

        const res = await window.gvGenerateInvitationPdf(year, gvData, {
            forceRecreate: true,
            openInNewTab: false
        });

        if (res && res.success && res.pdfUrl) {
            state.compiledPdfUrl = res.pdfUrl;
            state.activeRightTab = 'preview-pdf';
            renderRightPanel();
            if (typeof showToast === 'function') showToast("Vorschau aktualisiert!", 'success');
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

            let bodyHtml = getGVCampaignMailBody()
                .replace(/{{mitglied\.vorname}}/gi, curMember.first_name || 'Hans')
                .replace(/{{mitglied\.nachname}}/gi, curMember.last_name || 'Muster')
                .replace(/{{mitglied\.anrede}}/gi, `Lieber ${curMember.first_name || 'Hans'}`)
                .replace(/{{event\.datum_formatiert}}/gi, formatSwissDate(state.gvInstance?.datum) || `im März ${state.year}`)
                .replace(/{{dossier\.download_url}}/gi, `<a href="${state.compiledPdfUrl || '#'}" target="_blank">GV-Dossier ${state.year} herunterladen (PDF)</a>`);

            if (window.ClubWysiwyg && typeof window.ClubWysiwyg.cleanHtml === 'function') {
                bodyHtml = window.ClubWysiwyg.cleanHtml(bodyHtml);
            } else {
                bodyHtml = bodyHtml.replace(/\n/g, '<br>');
            }

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
            const bodyTpl = getGVCampaignMailBody();

            for (const m of validMembers) {
                const personalizedSubj = subjTpl
                    .replace(/{{mitglied\.vorname}}/gi, m.first_name || '')
                    .replace(/{{mitglied\.nachname}}/gi, m.last_name || '');

                let personalizedBody = bodyTpl
                    .replace(/{{mitglied\.vorname}}/gi, m.first_name || '')
                    .replace(/{{mitglied\.nachname}}/gi, m.last_name || '')
                    .replace(/{{mitglied\.anrede}}/gi, `Lieber ${m.first_name || ''}`)
                    .replace(/{{event\.datum_formatiert}}/gi, formatSwissDate(state.gvInstance?.datum) || `im März ${state.year}`)
                    .replace(/{{dossier\.download_url}}/gi, `<a href="${state.compiledPdfUrl || '#'}" target="_blank">GV-Dossier ${state.year} herunterladen (PDF)</a>`);

                if (window.ClubWysiwyg && typeof window.ClubWysiwyg.cleanHtml === 'function') {
                    personalizedBody = window.ClubWysiwyg.cleanHtml(personalizedBody);
                } else {
                    personalizedBody = personalizedBody.replace(/\n/g, '<br>');
                }

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
        if (window._gvDossierState.activeLeftTab === 'stammdaten') {
            gvDossierCollectStammdatenFormValues();
        }
        window._gvDossierState.activeLeftTab = tabKey;
        renderGVDossierWorkspace();
    };

    window.gvDossierSetRightTab = function (tabKey) {
        window._gvDossierState.activeRightTab = tabKey;
        renderGVDossierWorkspace();
    };

    window.gvDossierSelectMember = async function (mId) {
        window._gvDossierState.selectedMemberId = mId;
        renderRightPanel();
        if (window._gvDossierState.activeRightTab === 'preview-pdf') {
            await window.gvDossierRefreshPreview();
        }
    };

    window.gvDossierLiveUpdateMailText = function () {
        if (window._gvDossierState.activeRightTab === 'preview-mail') {
            renderRightPanel();
        }
    };

    window.gvDossierInsertVariable = function (variableTag) {
        const area = document.getElementById('gv-camp-body');
        const wysiwygInst = area?._clubWysiwygInstance;
        if (wysiwygInst && typeof wysiwygInst.insertVariable === 'function') {
            wysiwygInst.insertVariable(variableTag);
            gvDossierLiveUpdateMailText();
            return;
        }
        if (!area) return;
        const start = area.selectionStart || 0;
        const end = area.selectionEnd || 0;
        const text = area.value || '';
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
        if (typeof showToast === 'function') showToast("Synchronisiere Teilnehmer & Rückmeldungen...", 'info');
        await loadGVParticipantsData(true);
        renderLeftPanel();
        if (window._gvDossierState.activeRightTab === 'preview-wirt') renderRightPanel();
        if (typeof showToast === 'function') showToast("Teilnehmerdaten erfolgreich synchronisiert!", 'success');
    };

    window.gvDossierOnLinkedEventChange = async function (newEventId) {
        gvDossierOnStammdatenFieldChange();
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
            const rLizenz = p.responseRawLizenz || p.lizenz;
            if (eventId && rLizenz) {
                if (statusVal === 'offen') {
                    await supa.from('poll_responses')
                        .delete()
                        .eq('event_id', String(eventId))
                        .eq('lizenz', String(rLizenz));
                } else {
                    const isAttending = (statusVal === 'ja');
                    await supa.from('poll_responses').upsert({
                        event_id: String(eventId),
                        lizenz: String(rLizenz),
                        attending: isAttending,
                        count: countVal,
                        essen: essenVal,
                        vegi: vegiVal,
                        grund: grundVal
                    }, { onConflict: 'event_id,lizenz' });
                }
            }

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

    // =========================================================================
    // SYSTEM-MAILS: PRÄSENZLISTE & ZWISCHENSTAND & PDF-TEXTE
    // =========================================================================

    /**
     * Schaltet direkt zum dedizierten PDF-Editor-Tab um (Eigenständiger PDF-Editor im GV-Modul)
     */
    window.gvDossierOpenTemplateTextModal = function () {
        if (typeof gvDossierSetLeftTab === 'function') {
            gvDossierSetLeftTab('einladung_pdf');
        }
    };

    /**
     * Druckfertige Präsenzliste als PDF öffnen
     */
    window.gvDossierOpenPraesenzlistePdf = async function () {
        const state = window._gvDossierState;
        if (typeof window.gvGeneratePraesenzlistePdf !== 'function') {
            alert("Präsenzlisten-Generator nicht verfügbar.");
            return;
        }

        const gvData = {
            gvNummer: state.gvInstance?.number || 100,
            datum: state.gvInstance?.datum || '',
            datumFormatiert: formatSwissDate(state.gvInstance?.datum) || '',
            zeit: state.gvInstance?.zeit || '19:30',
            ort: state.gvInstance?.ort || 'Schützenhaus Muhen'
        };

        // Nur angemeldete Mitglieder abbilden + Leerzeilen
        const angemeldetList = (state.participantsData || []).filter(p => p.status === 'ja' || p.anwesend === true);

        await window.gvGeneratePraesenzlistePdf(state.year, gvData, angemeldetList, {
            openInNewTab: true,
            forceRecreate: true
        });
    };

    /**
     * Druckfertige Präsenzliste per E-Mail an den Aktuar senden (Adresse aus system_mail_configs)
     */
    window.gvDossierSendPraesenzlisteToAktuar = async function () {
        const supa = getSupabase();
        if (!supa) return;
        const state = window._gvDossierState;
        const curYear = state.year;

        // Empfänger aus public.system_mail_configs für Aktuar holen
        let aktuarMail = 'aktuar@example.ch';
        try {
            const { data: cfg } = await supa
                .from('system_mail_configs')
                .select('mailadresse')
                .eq('schluessel', 'Info_Mail_Aktuar')
                .maybeSingle();
            if (cfg && cfg.mailadresse) aktuarMail = cfg.mailadresse;
        } catch (_) {}

        const targetMail = prompt(`Präsenzliste für GV ${curYear} an Aktuar senden:`, aktuarMail);
        if (!targetMail) return;

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay(`Generiere Präsenzliste & sende an Aktuar (${targetMail})...`);
        }

        try {
            const gvData = {
                gvNummer: state.gvInstance?.number || 100,
                datum: state.gvInstance?.datum || '',
                datumFormatiert: formatSwissDate(state.gvInstance?.datum) || '',
                zeit: state.gvInstance?.zeit || '19:30',
                ort: state.gvInstance?.ort || 'Schützenhaus Muhen'
            };

            // Nur angemeldete Mitglieder abbilden + Leerzeilen
            const angemeldetList = (state.participantsData || []).filter(p => p.status === 'ja' || p.anwesend === true);

            const pdfRes = await window.gvGeneratePraesenzlistePdf(curYear, gvData, angemeldetList, {
                openInNewTab: false,
                forceRecreate: true
            });

            if (!pdfRes || !pdfRes.success) {
                throw new Error(pdfRes?.error || "PDF-Generierung fehlgeschlagen.");
            }

            const attachments = [];
            if (pdfRes.storagePath) {
                attachments.push({
                    filename: `GV_Praesenzliste_${curYear}.pdf`,
                    storagePath: pdfRes.storagePath,
                    storageBucket: pdfRes.storageBucket || 'operatives-storage'
                });
            }

            await window.sendMailViaEngine({
                to: targetMail,
                subject: `📄 Präsenzliste: ${gvData.gvNummer}. Generalversammlung ${curYear}`,
                html: `
                    <div style="font-family: Arial, sans-serif; color: #1e293b; line-height: 1.6;">
                        <p>Hallo</p>
                        <p>Anbei findest du die druckfertige Präsenzliste für die <strong>${gvData.gvNummer}. Generalversammlung ${curYear}</strong> vom ${gvData.datumFormatiert || gvData.datum}.</p>
                        <p>Das Dokument enthält alle angemeldeten und aktiven Mitglieder in alphabetischer Reihenfolge sowie zusätzliche Leerzeilen für spontane Nachmeldungen am Abend.</p>
                        <p style="margin-top: 20px;">Sportliche Grüsse<br><strong>Sportschützen Muhen</strong></p>
                    </div>
                `,
                text: `Präsenzliste für die ${gvData.gvNummer}. Generalversammlung ${curYear} vom ${gvData.datumFormatiert || gvData.datum}.`,
                moduleRef: 'gv',
                attachments: attachments.length ? attachments : undefined
            });

            alert(`✅ Präsenzliste erfolgreich an ${targetMail} versendet!`);
        } catch (err) {
            console.error("Fehler beim Senden an den Aktuar:", err);
            alert("Senden fehlgeschlagen: " + err.message);
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    /**
     * Sendet den aktuellen Zwischenstand der Anmeldungen an den Vorstand (Adresse aus system_mail_configs)
     */
    window.gvDossierSendAnmeldeZusammenfassungToVorstand = async function () {
        const supa = getSupabase();
        if (!supa) return;
        const state = window._gvDossierState;
        const curYear = state.year;
        const participants = state.participantsData || [];

        // Empfänger aus public.system_mail_configs für Vorstand holen
        let vorstandMail = 'vorstand@sportschuetzen-muhen.ch';
        try {
            const { data: cfg } = await supa
                .from('system_mail_configs')
                .select('mailadresse')
                .eq('schluessel', 'Info_Mail_Vorstand')
                .maybeSingle();
            if (cfg && cfg.mailadresse) vorstandMail = cfg.mailadresse;
        } catch (_) {}

        const targetMail = prompt(`Zwischenstand der GV-Anmeldungen senden an:`, vorstandMail);
        if (!targetMail) return;

        // Statistiken berechnen
        let jaListe = [];
        let neinListe = [];
        let offenListe = [];
        let totalEssen = 0;
        let totalVegi = 0;

        participants.forEach(p => {
            if (p.status === 'ja') {
                jaListe.push(p.name);
                totalEssen += (p.essen || 0);
                totalVegi += (p.vegi || 0);
            } else if (p.status === 'nein') {
                const grundTxt = p.grund ? ` (${p.grund})` : '';
                neinListe.push(p.name + grundTxt);
            } else {
                offenListe.push(p.name);
            }
        });

        const totalMitglieder = participants.length;
        const totalJa = jaListe.length;
        const totalNein = neinListe.length;
        const totalOffen = offenListe.length;
        const quote = totalMitglieder > 0 ? ((totalJa + totalNein) / totalMitglieder * 100).toFixed(1) : 0;

        const gvNummer = state.gvInstance?.number || 100;
        const datumStr = formatSwissDate(state.gvInstance?.datum) || `März ${curYear}`;

        const reportHtml = `
            <div style="font-family: Arial, sans-serif; color: #444; max-width: 650px; border: 1px solid #eee; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 10px rgba(0,0,0,0.05); margin: 0 auto;">
                <div style="background-color: #0f3a5d; color: white; padding: 25px; text-align: center;">
                    <h2 style="margin: 0; letter-spacing: 1px;">📊 GV-ÜBERSICHT ${curYear}</h2>
                    <p style="margin: 8px 0 0 0; opacity: 0.85; font-size: 14px;">${gvNummer}. Generalversammlung vom ${datumStr}</p>
                </div>

                <div style="padding: 25px;">
                    <p style="margin-bottom: 8px; font-size: 15px;"><b>Aktueller Rücklauf: ${quote}%</b> (${totalJa + totalNein} von ${totalMitglieder} Mitgliedern)</p>
                    <div style="width: 100%; background-color: #eee; border-radius: 20px; height: 14px; margin-bottom: 25px;">
                        <div style="width: ${quote}%; background-color: #3b82f6; height: 14px; border-radius: 20px;"></div>
                    </div>

                    <table style="width: 100%; border-collapse: separate; border-spacing: 5px; margin-bottom: 20px; text-align: center;">
                        <tr>
                            <td style="width: 33%; padding: 15px; background: #e8f5e9; border-radius: 10px;">
                                <span style="display: block; font-size: 26px; color: #2e7d32; font-weight: bold;">${totalJa}</span>
                                <span style="font-size: 11px; color: #2e7d32; text-transform: uppercase; font-weight: bold;">Zusagen</span>
                            </td>
                            <td style="width: 33%; padding: 15px; background: #ffebee; border-radius: 10px;">
                                <span style="display: block; font-size: 26px; color: #c62828; font-weight: bold;">${totalNein}</span>
                                <span style="font-size: 11px; color: #c62828; text-transform: uppercase; font-weight: bold;">Absagen</span>
                            </td>
                            <td style="width: 33%; padding: 15px; background: #fff3e0; border-radius: 10px;">
                                <span style="display: block; font-size: 26px; color: #e65100; font-weight: bold;">${totalOffen}</span>
                                <span style="font-size: 11px; color: #e65100; text-transform: uppercase; font-weight: bold;">Offen</span>
                            </td>
                        </tr>
                    </table>

                    <div style="background-color: #f1f5f9; padding: 12px; border-radius: 8px; margin-bottom: 25px; font-size: 14px; text-align: center;">
                        🍽️ <b>Essen-Zusammenfassung (Wirt):</b> Standard: <b>${totalEssen}</b> | Vegetarisch: <b>${totalVegi}</b> (Gesamt: <b>${totalEssen + totalVegi}</b>)
                    </div>

                    <table style="width: 100%; font-size: 13px; line-height: 1.6; border-collapse: collapse;">
                        <tr style="vertical-align: top;">
                            <td style="width: 33%; padding-right: 10px;">
                                <h4 style="color: #2e7d32; border-bottom: 2px solid #2e7d32; padding-bottom: 4px; margin-top: 0;">✅ Ja (${totalJa})</h4>
                                ${jaListe.map(n => "• " + escapeHtml(n)).join("<br>") || "-"}
                            </td>
                            <td style="width: 33%; padding: 0 8px;">
                                <h4 style="color: #c62828; border-bottom: 2px solid #c62828; padding-bottom: 4px; margin-top: 0;">❌ Nein (${totalNein})</h4>
                                ${neinListe.map(n => "• " + escapeHtml(n)).join("<br>") || "-"}
                            </td>
                            <td style="width: 33%; padding-left: 10px;">
                                <h4 style="color: #e65100; border-bottom: 2px solid #e65100; padding-bottom: 4px; margin-top: 0;">⏳ Offen (${totalOffen})</h4>
                                ${offenListe.map(n => "• " + escapeHtml(n)).join("<br>") || "-"}
                            </td>
                        </tr>
                    </table>
                </div>

                <div style="background-color: #f8f9fa; padding: 15px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #eee;">
                    Automatisch generiert aus dem Portal der Sportschützen Muhen
                </div>
            </div>
        `;

        if (typeof showLoadingOverlay === 'function') {
            showLoadingOverlay(`Sende GV-Zwischenstand an ${targetMail}...`);
        }

        try {
            await window.sendMailViaEngine({
                to: targetMail,
                subject: `📊 GV-Update: ${quote}% Rücklauf (${totalJa} Ja / ${totalNein} Nein) – Generalversammlung ${curYear}`,
                html: reportHtml,
                text: `GV-Zwischenstand: ${quote}% Rücklauf (${totalJa} Ja, ${totalNein} Nein, ${totalOffen} Offen).`,
                moduleRef: 'gv'
            });

            alert(`✅ GV-Zwischenstand erfolgreich an ${targetMail} versendet!`);
        } catch (err) {
            console.error("Fehler beim Senden des Zwischenstands:", err);
            alert("Senden fehlgeschlagen: " + err.message);
        } finally {
            if (typeof hideLoadingOverlay === 'function') hideLoadingOverlay();
        }
    };

    console.log("🚀 [GV-Dossier] Modul geladen: SortableJS Drag & Drop, SaveButtonKit, Präsenzliste & System-Mails aktiv.");
})();
