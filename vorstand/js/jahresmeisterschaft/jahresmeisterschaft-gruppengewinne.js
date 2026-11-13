/**
 * ==============================================================================
 * jahresmeisterschaft-gruppengewinne.js
 * Modul: Verwaltung, Schützen-Zuordnung & Auszahlung/Verrechnung von Gruppengewinnen
 * Konto: 1301 Transit Gruppengewinne
 * Sportschützen Muhen (Saison 2026+)
 * ==============================================================================
 */

(function (window) {
    'use strict';

    window._jmGroupCompetitions = [];
    window._jmCompetitionFilesMap = {};
    let _jmActiveCompYear = null;
    let _jmCurrentEditingComp = null;

    /**
     * Ermittelt den Supabase-Client.
     */
    function getSupa() {
        return window.supabaseClient || null;
    }

    /**
     * Ermittelt das aktive Jahr für Gruppengewinne.
     */
    function getActiveYear() {
        if (_jmActiveCompYear) return _jmActiveCompYear;
        if (window.jmCurrentJahr && window.jmCurrentJahr !== 'current') {
            const parsed = parseInt(window.jmCurrentJahr, 10);
            if (!isNaN(parsed) && parsed > 2000) return parsed;
        }
        return new Date().getFullYear();
    }

    /**
     * Normalisiert einen Anlassnamen für den Dateivergleich zwischen jm_competition_files und group_competitions.
     */
    function normalizeAnlassKey(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]/g, '');
    }

    /**
     * Normalisiert einen Anlassnamen ohne Jahreszahl und Ortszusatz in Klammern (Fuzzy-Fallback).
     */
    function normalizeAnlassBaseKey(str) {
        return String(str || '')
            .toLowerCase()
            .replace(/\([^)]*\)/g, '')
            .replace(/\b20\d{2}\b/g, '')
            .replace(/^\d+\.\s*/, '')
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]/g, '');
    }

    /**
     * Prüft, ob der Gruppenanteil eines Schützen bereits abgerechnet bzw. geschützt ist.
     */
    function isMemberGroupProtected(m) {
        if (!m) return false;
        return (
            m.status === 'verrechnet' ||
            m.status === 'in_zahlung' ||
            m.status === 'ausgefuehrt' ||
            (Boolean(m.contribution_position_id) && Number(m.anteil_gruppe || 0) > 0)
        );
    }

    /**
     * Ermittelt die effektiven Gruppenmitglieder (ohne nachträgliche reine Einzelgewinner mit anteil_gruppe = 0).
     */
    function getEffectiveGroupMembers(members) {
        const list = Array.isArray(members) ? members : [];
        if (list.length === 0) return [];
        const withGroupShare = list.filter(m => Number(m.anteil_gruppe || 0) > 0 || isMemberGroupProtected(m));
        return withGroupShare.length > 0 ? withGroupShare : list;
    }

    /**
     * Ermittelt für einen Schützen aufgeteilte Gruppen-, Einzel-, Total-, verrechnete und offene Beträge.
     */
    function getMemberSplitAmounts(m, comp, fallbackPerShooter = 0) {
        if (!m) {
            return { grpAmt: 0, einzelAmt: 0, totalAmt: 0, settledAmt: 0, unsettledAmt: 0, openForTransferAmt: 0 };
        }
        const typ = comp?.anlass_typ || 'gruppe';
        const isEinzelOnly = typ === 'einzel';
        const isGruppeOnly = typ === 'gruppe';
        const hasExplicitSplit = m.anteil_gruppe !== undefined && m.anteil_gruppe !== null;

        const grpAmt = isEinzelOnly
            ? 0
            : (hasExplicitSplit ? Number(m.anteil_gruppe || 0) : Number(m.betrag ?? fallbackPerShooter ?? 0));
        const einzelAmt = isGruppeOnly
            ? 0
            : Number(m.anteil_einzel ?? (isEinzelOnly ? (m.betrag ?? 0) : 0));
        const totalAmt = (m.betrag !== undefined && m.betrag !== null)
            ? Number(m.betrag || 0)
            : (grpAmt + einzelAmt);

        const isDone = m.status === 'verrechnet' || m.status === 'ausgefuehrt';
        const hasSettledGroup = !isDone && Boolean(m.contribution_position_id) && grpAmt > 0;
        const settledAmt = isDone ? totalAmt : (hasSettledGroup ? grpAmt : 0);
        const unsettledAmt = isDone ? 0 : (hasSettledGroup ? einzelAmt : totalAmt);
        const openForTransferAmt = (isDone || m.status === 'in_zahlung') ? 0 : unsettledAmt;

        return { grpAmt, einzelAmt, totalAmt, settledAmt, unsettledAmt, openForTransferAmt };
    }

    /**
     * Berechnet das Gruppen-Punktetotal ohne nachträgliche reine Einzelgewinner (anteil_gruppe = 0).
     */
    function computeGroupPointsTotal(members, typ = 'gruppe') {
        const list = Array.isArray(members) ? members : [];
        if (list.length === 0) return 0;
        const sourceMembers = typ === 'einzel' ? list : getEffectiveGroupMembers(list);
        const sumPts = sourceMembers.reduce((acc, m) => acc + (Number(m.punkte) || 0), 0);
        return Math.round(sumPts * 10) / 10;
    }

    /**
     * Lädt alle hinterlegten Ranglisten-Dateien für ein Jahr aus public.jm_competition_files.
     */
    async function jmLoadCompetitionFiles(year) {
        const yr = year || getActiveYear();
        const supa = getSupa();
        if (!supa) return {};
        try {
            const { data, error } = await supa
                .from('jm_competition_files')
                .select('*')
                .eq('jahr', yr);
            if (error) throw error;
            const map = {};
            (data || []).forEach(row => {
                const key = normalizeAnlassKey(row.anlass_name);
                const baseKey = normalizeAnlassBaseKey(row.anlass_name);
                const files = Array.isArray(row.files) ? row.files : [];
                if (key) {
                    map[key] = [...(map[key] || []), ...files];
                }
                if (baseKey && baseKey !== key) {
                    map[baseKey] = [...(map[baseKey] || []), ...files];
                }
            });
            window._jmCompetitionFilesMap = map;
            return map;
        } catch (err) {
            console.warn('[Gruppengewinne] Konnte jm_competition_files nicht laden:', err);
            return window._jmCompetitionFilesMap || {};
        }
    }

    /**
     * Kombiniert die direkt am Gruppengewinn gespeicherten Ranglisten mit jenen aus jm_competition_files.
     */
    function getMergedRanglistenForComp(comp) {
        if (!comp) return [];
        const direct = Array.isArray(comp.ranglisten_files) ? comp.ranglisten_files : [];
        const key = normalizeAnlassKey(comp.anlass_name);
        const baseKey = normalizeAnlassBaseKey(comp.anlass_name);
        const map = window._jmCompetitionFilesMap || {};
        const fromExact = (key && Array.isArray(map[key])) ? map[key] : [];
        const fromBase = (baseKey && baseKey !== key && Array.isArray(map[baseKey])) ? map[baseKey] : [];
        const merged = [];
        const seenPaths = new Set();
        [...direct, ...fromExact, ...fromBase].forEach(f => {
            if (!f || !f.storage_path) return;
            if (seenPaths.has(f.storage_path)) return;
            seenPaths.add(f.storage_path);
            merged.push(f);
        });
        return merged;
    }

    /**
     * Lädt alle Gruppengewinne und zugehörige Schützen für ein Jahr aus Supabase.
     */
    async function jmLoadGroupCompetitions(year) {
        const yr = year || getActiveYear();
        _jmActiveCompYear = yr;
        const supa = getSupa();
        if (!supa) {
            console.warn("[Gruppengewinne] Kein Supabase-Client verfügbar.");
            return [];
        }

        try {
            const [{ data, error }] = await Promise.all([
                supa
                    .from('group_competitions')
                    .select(`
                        *,
                        members:group_competition_members(*)
                    `)
                    .eq('jahr', yr)
                    .order('created_at', { ascending: false }),
                jmLoadCompetitionFiles(yr)
            ]);

            if (error) throw error;
            window._jmGroupCompetitions = (data || []).map(c => {
                c.ranglisten_files = getMergedRanglistenForComp(c);
                return c;
            });
            return window._jmGroupCompetitions;
        } catch (err) {
            console.error("[Gruppengewinne] Fehler beim Laden:", err);
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Fehler beim Laden',
                    message: 'Die Gruppengewinne konnten nicht geladen werden: ' + err.message,
                    type: 'danger'
                });
            }
            return [];
        }
    }

    window._jmFibu1301Cache = [];

    /**
     * Lädt die Buchungen auf Konto 1301 (und Gruppenauszahlungen auf 4410) für das gewählte Jahr aus accounting_journal.
     */
    async function jmLoadAccounting1301Entries(year) {
        const yr = year || getActiveYear();
        const supa = getSupa();
        if (!supa) return [];

        try {
            const startStr = `${yr}-01-01`;
            const endStr = `${yr}-12-31`;
            const { data, error } = await supa
                .from('accounting_journal')
                .select('id, datum, beleg_nr, konto_soll, konto_haben, betrag, beschreibung')
                .gte('datum', startStr)
                .lte('datum', endStr)
                .or('konto_soll.eq.1301,konto_haben.eq.1301,beschreibung.ilike.%gruppengewinn%,beschreibung.ilike.%gruppenauszahlung%')
                .order('datum', { ascending: false });

            if (error) throw error;
            window._jmFibu1301Cache = data || [];
            return window._jmFibu1301Cache;
        } catch (err) {
            console.warn('[Gruppengewinne] Konnte Buchhaltung Konto 1301 nicht abfragen:', err);
            return [];
        }
    }

    /**
     * Gleicht die erfassten Gruppengewinne mit den Buchhaltungs-Buchungen auf Konto 1301 ab.
     */
    function reconcileFibu1301WithCompetitions(compList, fibuRows) {
        const comps = Array.isArray(compList) ? compList : [];
        const rows = Array.isArray(fibuRows) ? fibuRows : [];

        // Haben-Buchungen auf 1301 = Zahlungseingänge von Ausrichtern (Schützen-Überschuss)
        const haben1301 = rows.filter(r => String(r.konto_haben) === '1301' && Number(r.betrag || 0) > 0);
        // Direkt auf 4410 gebuchte Gruppenauszahlungen (wenn Gewinn <= Doppel, z.B. Deisigraben)
        const haben4410Group = rows.filter(r => String(r.konto_haben) === '4410' && String(r.konto_soll) === '1020' && /(?:gruppengewinn|gruppenauszahlung)/i.test(r.beschreibung || ''));

        const norm = str => String(str || '')
            .toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/schiessen|schuetzenfest|schuetzengesellschaft|sportschuetzen|verein|gruppe|strohhaus|strohaus|muhen|teilbetrag|gruppengewinn|gruppenauszahlung|\d+/g, ' ')
            .replace(/[^a-z]/g, ' ')
            .split(/\s+/)
            .filter(w => w.length >= 4);

        //Synonyme für bekannte Ausrichter/Ortschaften
        const synonyms = {
            'sobe': ['sonnenberg', 'reinach'],
            'reinach': ['sonnenberg', 'sobe'],
            'villmergen': ['baerenmoos'],
            'brugg': ['vindonissa', 'windisch'],
            'windisch': ['vindonissa', 'brugg'],
            'balsthal': ['balsthaler', 'liegendmatch'],
            'sulz': ['deisigraben'],
            'menziken': ['stumpenland', 'burg'],
            'siggenthal': ['siggenberg'],
            'mettau': ['laubberg'],
            'eidg': ['chur', 'eidgenoessisches']
        };

        const expandWords = (words) => {
            const set = new Set(words);
            words.forEach(w => {
                Object.entries(synonyms).forEach(([k, vals]) => {
                    if (w.includes(k) || k.includes(w)) {
                        vals.forEach(v => set.add(v));
                    }
                });
            });
            return Array.from(set);
        };

        const matchedCompIds = new Set();
        const matchedFibuIds = new Set();
        const compToFibuMap = {};

        comps.forEach(comp => {
            const cWords = expandWords(norm(comp.anlass_name));
            const ueberschuss = Math.max(0, Number(comp.gruppengewinn || 0) - Number(comp.gruppendoppel || 30)) + Number(comp.einzel_total || 0);

            // 1. Suche in haben1301
            let bestFibu = null;
            for (const f of haben1301) {
                if (matchedFibuIds.has(f.id)) continue;
                const fWords = expandWords(norm(f.beschreibung));
                const wordHit = cWords.some(cw => fWords.some(fw => fw.includes(cw) || cw.includes(fw)));
                const amtHit = Math.abs(Number(f.betrag || 0) - ueberschuss) < 0.05;
                if (wordHit && amtHit) {
                    bestFibu = f;
                    break;
                } else if (wordHit && !bestFibu) {
                    bestFibu = f;
                }
            }

            // 2. Falls ueberschuss === 0 (wie Deisigraben), prüfe haben4410Group
            if (!bestFibu && ueberschuss === 0) {
                for (const f of haben4410Group) {
                    const fWords = expandWords(norm(f.beschreibung));
                    const wordHit = cWords.some(cw => fWords.some(fw => fw.includes(cw) || cw.includes(fw)));
                    if (wordHit) {
                        bestFibu = f;
                        break;
                    }
                }
            }

            if (bestFibu) {
                matchedCompIds.add(comp.id);
                matchedFibuIds.add(bestFibu.id);
                compToFibuMap[comp.id] = bestFibu;
            }
        });

        const unmatchedFibu1301 = haben1301.filter(f => !matchedFibuIds.has(f.id));
        const unmatchedComps = comps.filter(c => {
            const ueb = Math.max(0, Number(c.gruppengewinn || 0) - Number(c.gruppendoppel || 30));
            return ueb > 0 && !matchedCompIds.has(c.id);
        });

        const totalFibuHaben1301 = haben1301.reduce((acc, r) => acc + Number(r.betrag || 0), 0);

        return {
            totalFibuHaben1301,
            compToFibuMap,
            unmatchedFibu1301,
            unmatchedComps
        };
    }

    /**
     * Aktualisiert das Badge im Reiter «🏆 Gruppengewinne (1301)» und im Header-Button.
     */
    async function jmRefreshGruppengewinneBadge(year) {
        const yr = year || getActiveYear();
        const list = (window._jmGroupCompetitions && window._jmGroupCompetitions.length > 0 && Number(_jmActiveCompYear) === Number(yr))
            ? window._jmGroupCompetitions
            : await jmLoadGroupCompetitions(yr);

        let openCompCount = 0;
        (list || []).forEach(c => {
            const isEinzelOnly = (c.anlass_typ || 'gruppe') === 'einzel';
            const grpUeb = isEinzelOnly ? 0 : Math.max(0, Number(c.gruppengewinn || 0) - Number(c.gruppendoppel || 30));
            const ueb = grpUeb + Number(c.einzel_total || 0);
            const members = Array.isArray(c.members) ? c.members : [];
            const hasOpen = ueb > 0 && members.some(m => (m.payout_method || 'jahresbeitrag') === 'jahresbeitrag' && m.status !== 'verrechnet' && m.status !== 'ausgefuehrt');
            if (hasOpen) openCompCount++;
        });

        const tabBadge = document.getElementById('jm-gg-tab-badge');
        if (tabBadge) {
            if (openCompCount > 0) {
                tabBadge.textContent = `${openCompCount} offen`;
                tabBadge.classList.remove('d-none');
            } else {
                tabBadge.textContent = '';
                tabBadge.classList.add('d-none');
            }
        }
    }

    /**
     * Erzeugt das gemeinsame HTML-Gerüst für Tab-Ansicht und Modal-Fallback.
     */
    function buildGruppengewinneWorkspaceHTML() {
        return `
            <!-- Info-Banner in Du-Form -->
            <div class="alert alert-info py-2 px-3 small d-flex align-items-start justify-content-between gap-2 mb-3 shadow-xs border-0 rounded-3">
                <div class="d-flex align-items-start gap-2">
                    <i class="fas fa-info-circle fa-lg mt-1 text-primary"></i>
                    <div>
                        <strong>Vereinsregel für auswärtige Schiessen &amp; Schützengewinne (Konto 1301):</strong>
                        Bei Gruppenwettkämpfen übernimmt der Verein das Gruppendoppel (standardmässig <strong>CHF 30.00</strong>, Konto 4410). Darüber hinausgehende Gruppengewinne stehen den beteiligten Schützen zu.
                        Persönliche <strong>Einzelgewinne</strong> (z.&nbsp;B. Auszahlungsstich, Festsieger, Gabenstich) stehen zu 100% dem jeweiligen Einzelschützen zu (ohne Doppel-Abzug).
                        Gutschriften werden wahlweise direkt im Jahresbeitrag verrechnet, per Bank (pain.001) oder bar ausbezahlt.
                    </div>
                </div>
            </div>

            <!-- 4 KPI-Kacheln -->
            <div class="row g-2 mb-3" id="jm-gg-kpi-row">
                <div class="col-sm-6 col-xl-3">
                    <div class="card border-0 shadow-xs h-100 bg-white rounded-3">
                        <div class="card-body py-2.5 px-3">
                            <div class="text-muted small fw-semibold"><i class="fas fa-coins text-success me-1"></i>Erfasste Brutto-Gewinne</div>
                            <div class="fs-5 fw-bold text-success mt-0.5" id="jm-gg-kpi-brutto">CHF 0.00</div>
                            <div class="text-muted" style="font-size: 11px;" id="jm-gg-kpi-brutto-sub">0 Schiessen erfasst</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-xl-3">
                    <div class="card border-0 shadow-xs h-100 bg-white rounded-3">
                        <div class="card-body py-2.5 px-3">
                            <div class="text-muted small fw-semibold"><i class="fas fa-shield-alt text-secondary me-1"></i>Vereinsanteil (Doppel-Deckung)</div>
                            <div class="fs-5 fw-bold text-dark mt-0.5" id="jm-gg-kpi-doppel">CHF 0.00</div>
                            <div class="text-muted" style="font-size: 11px;" id="jm-gg-kpi-doppel-sub">Konto 4410 Gruppendoppel</div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-xl-3">
                    <div class="card border-0 shadow-xs h-100 bg-white rounded-3">
                        <div class="card-body py-2.5 px-3">
                            <div class="text-muted small fw-semibold"><i class="fas fa-users text-primary me-1"></i>Schützen-Ausschüttung (1301)</div>
                            <div class="fs-5 fw-bold text-primary mt-0.5" id="jm-gg-kpi-netto">CHF 0.00</div>
                            <div style="font-size: 11px;" id="jm-gg-kpi-netto-sub">
                                <span class="text-success fw-semibold">Abgewickelt: CHF 0.00</span> · <span class="text-warning-emphasis fw-semibold">Offen: CHF 0.00</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div class="col-sm-6 col-xl-3">
                    <div class="card border-0 shadow-xs h-100 bg-white rounded-3">
                        <div class="card-body py-2.5 px-3">
                            <div class="text-muted small fw-semibold"><i class="fas fa-balance-scale text-info me-1"></i>FiBu-Abgleich (Konto 1301)</div>
                            <div class="fs-5 fw-bold text-dark mt-0.5" id="jm-gg-kpi-fibu">CHF 0.00</div>
                            <div class="text-muted" style="font-size: 11px;" id="jm-gg-kpi-fibu-sub">Prüfe Buchhaltung...</div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Live-Abstimmungsbanner Buchhaltung Konto 1301 -->
            <div id="jm-gg-fibu-reconcile-banner" class="d-none mb-3"></div>

            <!-- Filter- & Aktionsleiste -->
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 bg-white p-2.5 rounded-3 shadow-xs border">
                <div class="d-flex flex-wrap align-items-center gap-2">
                    <label class="small fw-bold text-muted mb-0">Saison:</label>
                    <select id="jm-gg-year-select" class="form-select form-select-sm fw-semibold" style="width: 105px;" onchange="window.jmOnGruppengewinneYearChange(this.value)">
                        <option value="2026">2026</option>
                        <option value="2025">2025</option>
                        <option value="2024">2024</option>
                    </select>
                    <div class="input-group input-group-sm" style="width: 220px;">
                        <span class="input-group-text bg-white text-muted border-end-0"><i class="fas fa-search"></i></span>
                        <input type="text" id="jm-gg-search" class="form-control form-control-sm border-start-0" placeholder="Anlass, Schütze, Stich..." oninput="window.jmFilterGruppengewinneTable()">
                        <button type="button" class="btn btn-outline-secondary d-none" id="jm-gg-search-clear" onclick="document.getElementById('jm-gg-search').value=''; window.jmFilterGruppengewinneTable();" title="Suche leeren">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>

                    <!-- Filter-Pills: Alle / Gruppe / Einzel / Kombiniert -->
                    <div class="btn-group btn-group-sm" role="group" id="jm-gg-filter-pills">
                        <button type="button" class="btn btn-sm btn-primary fw-semibold" data-filter="all" onclick="window.jmSetTypeFilter('all')">Alle</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-filter="open" onclick="window.jmSetTypeFilter('open')" title="Nur offene Schiessen">Offen</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-filter="gruppe" onclick="window.jmSetTypeFilter('gruppe')">👥 Gruppe</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-filter="einzel" onclick="window.jmSetTypeFilter('einzel')">🎯 Einzel</button>
                        <button type="button" class="btn btn-sm btn-outline-secondary" data-filter="kombiniert" onclick="window.jmSetTypeFilter('kombiniert')">👥+🎯 Kombiniert</button>
                    </div>
                </div>
                <div class="d-flex flex-wrap align-items-center gap-2">
                    <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.jmReloadGruppengewinneList()" title="Daten &amp; Buchhaltungs-Abgleich neu laden">
                        <i class="fas fa-sync-alt"></i>
                    </button>

                    <!-- Sammel-Übertrag in Jahresbeitrag -->
                    <button type="button" class="btn btn-sm btn-primary fw-bold shadow-xs d-none" id="jm-gg-bulk-transfer-jb-btn" onclick="window.jmTransferAllOpenToJahresbeitrag()">
                        <i class="fas fa-file-invoice-dollar me-1"></i> Alle offenen in Jahresbeitrag übertragen
                    </button>

                    <!-- Export Dropdown (PDF & Word für Jahresbericht) -->
                    <div class="dropdown">
                        <button class="btn btn-sm btn-outline-success fw-semibold dropdown-toggle shadow-xs" type="button" data-bs-toggle="dropdown" title="Gesamtauswertung mit allen Gruppen, Teilnehmern und Einzelpunkten als PDF oder Word für den Jahresbericht ausgeben">
                            <i class="fas fa-file-export me-1"></i> Jahresbericht / Export
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow">
                            <li><h6 class="dropdown-header">Saison-Gesamtauswertung</h6></li>
                            <li>
                                <a class="dropdown-item" href="#" onclick="event.preventDefault(); window.jmExportGruppengewinneSummaryPdf();">
                                    <i class="fas fa-file-pdf text-danger me-2"></i>Gesamtauswertung &amp; Konto 1301 (PDF)
                                </a>
                            </li>
                            <li>
                                <a class="dropdown-item" href="#" onclick="event.preventDefault(); window.jmExportGruppengewinneWord();">
                                    <i class="fas fa-file-word text-primary me-2"></i>Bericht &amp; Tabellen für Jahresbericht (Word .doc)
                                </a>
                            </li>
                        </ul>
                    </div>

                    <button type="button" class="btn btn-sm btn-warning fw-bold shadow-xs" onclick="window.jmOpenGroupCompetitionEditor(null)">
                        <i class="fas fa-plus me-1"></i> Schützengewinn erfassen
                    </button>
                </div>
            </div>

            <!-- Tabelle der Gruppenwettkämpfe inkl. direkter Schützen-Anzeige -->
            <div class="card shadow-sm border-0 rounded-3">
                <div class="card-body p-0">
                    <div class="table-responsive">
                        <table class="table table-hover align-middle mb-0" id="jm-gg-main-table">
                            <thead class="table-light sticky-top small text-muted border-bottom">
                                <tr>
                                    <th class="ps-3" style="width: 22%;">Anlass / Schiessen</th>
                                    <th style="width: 13%;">Typ, Gruppe &amp; Rang</th>
                                    <th class="text-end" style="width: 8%;">Doppel</th>
                                    <th class="text-end" style="width: 9%;">Gewinn</th>
                                    <th class="text-end" style="width: 10%;">Schützen-Überschuss</th>
                                    <th style="width: 25%;">Beteiligte Schützen, Punkte &amp; Anteile</th>
                                    <th class="text-center pe-3" style="width: 13%;">Aktionen</th>
                                </tr>
                            </thead>
                            <tbody id="jm-gg-table-body" class="small">
                                <tr>
                                    <td colspan="7" class="text-center py-4 text-muted">
                                        <div class="spinner-border spinner-border-sm text-primary me-2"></div> Gruppengewinne werden geladen...
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                <div class="card-footer bg-light py-2 px-3 border-top d-flex flex-wrap justify-content-between align-items-center small text-muted" id="jm-gg-summary-text">
                    <span>Gesamt-Überschuss Schützen (Konto 1301): <strong class="text-dark">CHF 0.00</strong></span>
                </div>
            </div>
        `;
    }

    /**
     * Rendert den 4. Haupt-Tab «🏆 Gruppengewinne (1301)» direkt in der Jahresmeisterschaft.
     */
    async function jmRenderGruppengewinneTabPane(year) {
        const yr = year || getActiveYear();
        _jmActiveCompYear = yr;
        const pane = document.getElementById('gruppengewinne-pane');
        if (!pane) return;

        // Falls ein altes Modal im DOM liegt, entfernen, damit keine doppelten IDs existieren
        const oldModal = document.getElementById('jmGruppengewinneModal');
        if (oldModal && !oldModal.classList.contains('show')) {
            oldModal.remove();
        }

        if (!pane.querySelector('#jm-gg-main-table')) {
            pane.innerHTML = buildGruppengewinneWorkspaceHTML();
        }

        await jmRenderGruppengewinneList(yr);
    }

    /**
     * Öffnet den Bereich Gruppengewinne:
     * Wenn wir uns in der Jahresmeisterschaft befinden und der 4. Tab existiert, wird direkt auf den Tab gewechselt!
     * Andernfalls wird das Modal geöffnet.
     */
    async function jmOpenGruppengewinneModal(year, opts = {}) {
        const yr = year || getActiveYear();
        _jmActiveCompYear = yr;

        const tabBtn = document.getElementById('gruppengewinne-tab');
        const jmView = document.getElementById('view-jahresmeisterschaft');
        const isJmVisible = jmView && (jmView.classList.contains('active') || jmView.offsetParent !== null);

        if (tabBtn && isJmVisible && !opts.forceModal) {
            if (window.bootstrap && bootstrap.Tab) {
                bootstrap.Tab.getOrCreateInstance(tabBtn).show();
            } else {
                tabBtn.click();
            }
            if (typeof window.jmSetActiveTab === 'function') {
                window.jmSetActiveTab('gruppengewinne');
            } else {
                await jmRenderGruppengewinneTabPane(yr);
            }
            tabBtn.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            return;
        }

        // Fallback: Modal öffnen (und vorher Tab-Pane leeren, um ID-Kollisionen zu vermeiden)
        const pane = document.getElementById('gruppengewinne-pane');
        if (pane) pane.innerHTML = '';

        let modalEl = document.getElementById('jmGruppengewinneModal');
        if (!modalEl) {
            createGruppengewinneModalDOM();
            modalEl = document.getElementById('jmGruppengewinneModal');
        }

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
            window.UIModalKit.makeMovableAndResizable(modalEl);
        }

        await jmRenderGruppengewinneList(yr);
    }

    /**
     * Erstellt das DOM für das Hauptmodal (Fallback wenn ausserhalb der JM aufgerufen).
     */
    function createGruppengewinneModalDOM() {
        const div = document.createElement('div');
        div.id = 'jmGruppengewinneModal';
        div.className = 'modal fade';
        div.tabIndex = -1;
        div.setAttribute('aria-hidden', 'true');
        div.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content shadow-lg border-0">
                    <div class="modal-header bg-dark text-white py-2.5 px-3">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-warning text-dark fs-6"><i class="fas fa-trophy"></i></span>
                            <div>
                                <h5 class="modal-title fw-bold mb-0">Gruppengewinne Auswärtige Schiessen (Konto 1301)</h5>
                                <div class="small text-white-50">Erfassung, Schützen-Zuordnung & Auszahlung/Verrechnung von Gewinnen</div>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <div class="modal-body p-3 bg-light">
                        ${buildGruppengewinneWorkspaceHTML()}
                    </div>
                    <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-end">
                        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Schliessen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    /**
     * Re-rendert die Liste der Gruppengewinne inkl. KPI-Kacheln, Schützen-Pills und FiBu-Abgleich.
     */
    async function jmRenderGruppengewinneList(year) {
        const yr = year || getActiveYear();
        const yearSelect = document.getElementById('jm-gg-year-select');
        if (yearSelect) yearSelect.value = yr;

        const tbody = document.getElementById('jm-gg-table-body');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="7" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Gruppengewinne & Konto 1301 werden geladen...</td></tr>`;

        const [list, fibuRows] = await Promise.all([
            jmLoadGroupCompetitions(yr),
            jmLoadAccounting1301Entries(yr)
        ]);

        const fibuReconcile = reconcileFibu1301WithCompetitions(list, fibuRows);
        await jmRefreshGruppengewinneBadge(yr);

        if (!list || list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center py-5 text-muted">
                        <i class="fas fa-trophy fa-2x mb-2 text-black-50 opacity-50 d-block"></i>
                        Noch keine Gruppengewinne für die Saison ${yr} erfasst.<br>
                        <span class="small">Klicke oben auf <strong>«Neuer Gruppengewinn erfassen»</strong> oder importiere eine Rangliste im Auswärts-Import.</span>
                    </td>
                </tr>
            `;
            updateSummaryAndKpis([], fibuReconcile);
            renderFibuReconcileBanner(fibuReconcile, yr);
            return;
        }

        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);

        tbody.innerHTML = list.map(comp => {
            const anlassTyp = comp.anlass_typ || 'gruppe';
            const isEinzelOnly = anlassTyp === 'einzel';
            const isKombiniert = anlassTyp === 'kombiniert';
            const einzelTotal = Number(comp.einzel_total || 0);

            const doppel = isEinzelOnly ? 0 : Number(comp.gruppendoppel || 30);
            const gewinn = isEinzelOnly ? einzelTotal : Number(comp.gruppengewinn || 0);
            const gruppenUeberschuss = isEinzelOnly ? 0 : Math.max(0, gewinn - doppel);
            const ueberschuss = gruppenUeberschuss + einzelTotal;
            const vereinsDeckung = isEinzelOnly ? 0 : Math.min(gewinn, doppel);
            const members = Array.isArray(comp.members) ? comp.members : [];
            const groupMembers = getEffectiveGroupMembers(members);
            const count = groupMembers.length > 0 ? groupMembers.length : Number(comp.anzahl_schuetzen || 5);
            const perShooterGruppe = count > 0 && gruppenUeberschuss > 0 ? (gruppenUeberschuss / count) : 0;

            // Auszahlungsstatus der Schützen
            const allVerrechnet = members.length > 0 && ueberschuss > 0 && members.every(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt');
            const openJbMembers = members.filter(m => {
                if ((m.payout_method || 'jahresbeitrag') !== 'jahresbeitrag') return false;
                const split = getMemberSplitAmounts(m, comp, isEinzelOnly ? 0 : perShooterGruppe);
                return split.openForTransferAmt > 0;
            });
            const someVerrechnet = members.some(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt' || Boolean(m.contribution_position_id));

            let statusBadge = `<span class="badge bg-secondary">Offen</span>`;
            if (ueberschuss === 0) {
                statusBadge = `<span class="badge bg-light text-muted border" title="Gewinn (${fmtCurr(gewinn)}) übersteigt das Gruppendoppel (${fmtCurr(doppel)}) nicht – kompletter Betrag (${fmtCurr(vereinsDeckung)}) deckt das Vereinsdoppel (Konto 4410).">Kein Überschuss (100% an Doppel)</span>`;
            } else if (allVerrechnet) {
                statusBadge = `<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Abgewickelt (JB)</span>`;
            } else if (someVerrechnet && openJbMembers.length > 0) {
                statusBadge = `<span class="badge bg-info text-dark">Teilweise verrechnet (${openJbMembers.length} offen)</span>`;
            }

            // Anlass-Typ Badge
            let typBadge = '';
            if (isEinzelOnly) {
                typBadge = `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle me-1"><i class="fas fa-crosshairs me-1"></i>Einzel</span>`;
            } else if (isKombiniert) {
                typBadge = `<span class="badge bg-primary-subtle text-primary border border-primary-subtle me-1"><i class="fas fa-layer-group me-1"></i>Gruppe &amp; Einzel</span>`;
            } else {
                typBadge = `<span class="badge bg-light text-dark border me-1"><i class="fas fa-users me-1"></i>Gruppe</span>`;
            }

            // FiBu-Status Badge
            const matchedFibu = fibuReconcile.compToFibuMap?.[comp.id];
            let fibuBadge = '';
            if (matchedFibu) {
                fibuBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle ms-1" title="In Buchhaltung verbucht: ${escapeHtml(matchedFibu.beleg_nr)} (${escapeHtml(matchedFibu.datum)}) · ${escapeHtml(matchedFibu.beschreibung)}"><i class="fas fa-university me-1"></i>${escapeHtml(matchedFibu.beleg_nr)}</span>`;
            } else if (ueberschuss > 0) {
                fibuBadge = `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle ms-1" title="Für dieses Schiessen wurde auf Konto 1301 in der Buchhaltung noch kein passender Bankeingang gefunden."><i class="fas fa-clock me-1"></i>FiBu 1301 ausstehend</span>`;
            }

            // Rang-Badge (Podest farbig hervorheben)
            let rangBadge = '';
            if (comp.rang && !isEinzelOnly) {
                const rNum = Number(comp.rang);
                const rCls = rNum === 1 ? 'bg-warning text-dark border border-warning' : (rNum === 2 ? 'bg-secondary text-white' : (rNum === 3 ? 'bg-danger-subtle text-danger-emphasis border' : 'bg-primary'));
                const rIcon = rNum <= 3 ? '<i class="fas fa-medal me-1"></i>' : '';
                rangBadge = `<span class="badge ${rCls} ms-1">${rIcon}${rNum}. Rang</span>`;
            }

            // Schützen-Liste direkt in der Zeile darstellen
            const sortedMembers = [...members].sort((a, b) => (Number(b.punkte) || 0) - (Number(a.punkte) || 0));
            const shooterPillsHtml = sortedMembers.length > 0
                ? `<div class="d-flex flex-wrap gap-1">
                    ${sortedMembers.map(m => {
                        const isDone = m.status === 'verrechnet' || m.status === 'ausgefuehrt';
                        const isBank = m.status === 'in_zahlung';
                        const pillCls = isDone
                            ? 'bg-success-subtle text-success-emphasis border-success-subtle'
                            : (isBank ? 'bg-info-subtle text-info-emphasis border-info-subtle' : 'bg-light text-dark border-secondary-subtle');
                        const icon = isDone ? '<i class="fas fa-check-circle text-success me-1"></i>' : (isBank ? '<i class="fas fa-university text-info me-1"></i>' : '<i class="far fa-clock text-muted me-1"></i>');
                        const ptsStr = m.punkte ? `<strong>${m.punkte}</strong>` : '-';
                        
                        const split = getMemberSplitAmounts(m, comp, isEinzelOnly ? 0 : perShooterGruppe);
                        const antGruppe = split.grpAmt;
                        const antEinzel = split.einzelAmt;
                        const shareVal = split.totalAmt;
                        
                        let detailHint = '';
                        if (antGruppe > 0 && antEinzel > 0) {
                            detailHint = ` [Grp: ${fmtCurr(antGruppe)} + ${escapeHtml(m.stich_name || 'Einzel')}: ${fmtCurr(antEinzel)}]`;
                        } else if (antEinzel > 0) {
                            detailHint = ` [${escapeHtml(m.stich_name || 'Einzel')}]`;
                        }

                        const shareStr = shareVal > 0 ? ` · ${fmtCurr(shareVal)}${detailHint}` : '';
                        const isPartialEinzelOpen = !isDone && !isBank && Boolean(m.contribution_position_id) && antGruppe > 0 && antEinzel > 0;
                        const statusHint = isDone
                            ? 'Im Jahresbeitrag gutgeschrieben'
                            : (isBank
                                ? 'In Bankzahlung'
                                : (isPartialEinzelOpen
                                    ? 'Gruppenanteil verrechnet · Einzelgewinn noch offen für Übertrag in Jahresbeitrag'
                                    : (shareVal > 0 ? 'Noch offen für Übertrag in Jahresbeitrag' : 'Kein Überschuss')));
                        return `<span class="badge ${pillCls} border fw-normal px-2 py-1" style="font-size: 11px;" title="${escapeHtml(m.schuetze_name)}: ${m.punkte || 0} Pkt.${shareStr} (${statusHint})">
                            ${icon}${escapeHtml(m.schuetze_name)} (${ptsStr})${shareVal > 0 ? `<span class="text-muted ms-1">${fmtCurr(shareVal)}</span>` : ''}
                        </span>`;
                    }).join('')}
                   </div>`
                : `<span class="text-muted fst-italic">Noch keine Schützen zugewiesen (${count} Plätze)</span>`;

            // Punkte-Plausibilität
            const calcPtsSum = computeGroupPointsTotal(members, anlassTyp);
            const totalPtsDisplay = comp.punkte_total || (calcPtsSum > 0 ? calcPtsSum : null);

            // Hinterlegte Ranglisten-Dateien für diesen Anlass
            const rangFiles = getMergedRanglistenForComp(comp);
            const rangBadgesHtml = rangFiles.length > 0
                ? rangFiles.map(rf => `
                    <button type="button" class="badge bg-info-subtle text-info-emphasis border border-info-subtle fw-normal px-2 py-1 d-inline-flex align-items-center gap-1" style="font-size: 10.5px; cursor: pointer;" onclick="window.jmOpenRanglisteFile('${escapeHtml(rf.storage_bucket || 'jm-ranglisten')}', '${escapeHtml(rf.storage_path)}')" title="Gespeicherte Rangliste öffnen: ${escapeHtml(rf.filename || rf.title || 'Rangliste.pdf')} (${rf.size_kb || '?'} KB)">
                        <i class="fas fa-file-pdf text-danger"></i> ${escapeHtml(rf.is_group_ranking ? 'Gruppenrangliste' : 'Rangliste')} (${rf.size_kb || '?'} KB)
                    </button>
                `).join('')
                : `<button type="button" class="badge bg-light text-muted border fw-normal px-2 py-1 d-inline-flex align-items-center gap-1" style="font-size: 10px; cursor: pointer;" onclick="window.jmTriggerQuickRanglisteUpload('${comp.id}')" title="Rangliste (PDF oder Bild) für dieses Schiessen hochladen">
                    <i class="fas fa-cloud-upload-alt text-secondary"></i> + Rangliste
                </button>`;

            const gruppeNameDisplay = isEinzelOnly
                ? '<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle px-2 py-1">🎯 Einzelschützen</span>'
                : `<span class="badge bg-light text-dark border px-2 py-1">${escapeHtml(comp.gruppe_name || 'Strohaus')}</span>`;

            return `
                <tr data-id="${comp.id}" data-type="${anlassTyp}" data-status="${allVerrechnet ? 'verrechnet' : 'offen'}">
                    <td class="ps-3">
                        <div class="fw-bold text-dark d-flex align-items-center gap-1">${typBadge}${escapeHtml(comp.anlass_name)}</div>
                        <div class="d-flex flex-wrap align-items-center gap-1 mt-1" style="font-size: 11px;">
                            ${totalPtsDisplay ? `<span class="badge bg-light text-dark border"><i class="fas fa-bullseye text-primary me-1"></i>Total: ${totalPtsDisplay} Pkt.</span>` : ''}
                            ${statusBadge}
                            ${fibuBadge}
                            ${rangBadgesHtml}
                        </div>
                    </td>
                    <td>
                        <div class="fw-bold text-dark mb-1">${gruppeNameDisplay} ${rangBadge}</div>
                    </td>
                    <td class="text-end text-muted">
                        <div>${isEinzelOnly ? '<span class="text-muted fst-italic">keines</span>' : fmtCurr(doppel)}</div>
                        ${!isEinzelOnly && gewinn > 0 && gewinn < doppel ? `<div class="text-warning-emphasis" style="font-size: 10px;" title="Da der Gewinn (${fmtCurr(gewinn)}) kleiner als das Doppel (${fmtCurr(doppel)}) war, deckt er ${fmtCurr(vereinsDeckung)} des Vereinsdoppels.">gedeckt: ${fmtCurr(vereinsDeckung)}</div>` : ''}
                    </td>
                    <td class="text-end fw-bold ${gewinn > 0 ? 'text-success' : 'text-muted'}">
                        ${fmtCurr(gewinn)}
                    </td>
                    <td class="text-end">
                        <div class="fw-bold ${ueberschuss > 0 ? 'text-primary' : 'text-muted'}">${fmtCurr(ueberschuss)}</div>
                        <div class="text-muted" style="font-size: 10.5px;">
                            ${isEinzelOnly
                                ? `${members.length} Schütze(n)`
                                : (isKombiniert
                                    ? `Grp: ${fmtCurr(gruppenUeberschuss)} + Einzel: ${fmtCurr(einzelTotal)}`
                                    : (ueberschuss > 0 ? `${count} × ${fmtCurr(perShooterGruppe)}` : 'Verein (4410)'))
                            }
                        </div>
                    </td>
                    <td>
                        ${shooterPillsHtml}
                    </td>
                    <td class="text-center pe-3">
                        <div class="d-flex justify-content-center gap-1 flex-wrap">
                            ${openJbMembers.length > 0 && ueberschuss > 0 ? `
                                <button type="button" class="btn btn-xs btn-primary fw-semibold px-2 py-1" id="jm-gg-row-jb-btn-${comp.id}" onclick="window.jmTransferSingleCompToJahresbeitrag('${comp.id}')" title="${openJbMembers.length} Schütze(n) direkt in den Jahresbeitrag ${yr} übertragen">
                                    <i class="fas fa-file-invoice-dollar me-1"></i>In JB
                                </button>
                            ` : ''}
                            <div class="btn-group btn-group-sm">
                                <button type="button" class="btn btn-outline-primary" onclick="window.jmOpenGroupCompetitionEditor('${comp.id}')" title="Anlass, Schützen &amp; Beträge bearbeiten">
                                    <i class="fas fa-pen"></i>
                                </button>
                                <button type="button" class="btn btn-outline-secondary" onclick="window.jmGenerateGruppengewinnPdf('${comp.id}')" title="Abrechnungsbeleg (PDF) drucken">
                                    <i class="fas fa-file-pdf text-danger"></i>
                                </button>
                                <button type="button" class="btn btn-outline-danger" onclick="window.jmDeleteGroupCompetition('${comp.id}')" title="Eintrag löschen">
                                    <i class="fas fa-trash-alt"></i>
                                </button>
                            </div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        updateSummaryAndKpis(list, fibuReconcile);
        renderFibuReconcileBanner(fibuReconcile, yr);
    }

    /**
     * Aktualisiert die 4 KPI-Kacheln, den Sammel-Übertragsbutton und die Fusszeile.
     */
    function updateSummaryAndKpis(list, fibuReconcile) {
        const comps = Array.isArray(list) ? list : [];
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);

        let totalGewinn = 0;
        let totalDoppelSoll = 0;
        let totalDoppelGedeckt = 0;
        let totalUeberschuss = 0;
        let totalVerrechnet = 0;
        let totalOffen = 0;
        let openCompsCount = 0;
        let openShootersCount = 0;
        const partialDoppelNotes = [];

        comps.forEach(c => {
            const anlassTyp = c.anlass_typ || 'gruppe';
            const isEinzelOnly = anlassTyp === 'einzel';
            const einzelTotal = Number(c.einzel_total || 0);

            const doppel = isEinzelOnly ? 0 : Number(c.gruppendoppel || 30);
            const gewinn = isEinzelOnly ? einzelTotal : Number(c.gruppengewinn || 0);
            const gruppenUeberschuss = isEinzelOnly ? 0 : Math.max(0, gewinn - doppel);
            const ueb = gruppenUeberschuss + einzelTotal;
            const gedeckt = isEinzelOnly ? 0 : Math.min(gewinn, doppel);

            totalGewinn += (isEinzelOnly ? einzelTotal : (gewinn + einzelTotal));
            totalDoppelSoll += doppel;
            totalDoppelGedeckt += gedeckt;
            totalUeberschuss += ueb;

            if (!isEinzelOnly && gewinn > 0 && gewinn < doppel) {
                partialDoppelNotes.push(`${c.anlass_name}: ${fmtCurr(gewinn)} statt ${fmtCurr(doppel)}`);
            }

            const members = Array.isArray(c.members) ? c.members : [];
            const groupMembers = getEffectiveGroupMembers(members);
            const count = groupMembers.length > 0 ? groupMembers.length : Number(c.anzahl_schuetzen || 5);
            const perShooterGruppe = count > 0 && gruppenUeberschuss > 0 ? (gruppenUeberschuss / count) : 0;

            let compHasOpen = false;
            members.forEach(m => {
                const split = getMemberSplitAmounts(m, c, isEinzelOnly ? 0 : perShooterGruppe);
                if (split.totalAmt <= 0) return;
                totalVerrechnet += split.settledAmt;
                totalOffen += split.unsettledAmt;
                if (split.openForTransferAmt > 0 && (m.payout_method || 'jahresbeitrag') === 'jahresbeitrag') {
                    compHasOpen = true;
                    openShootersCount++;
                }
            });
            if (compHasOpen && ueb > 0) openCompsCount++;
        });

        // KPI 1: Brutto
        const elBrutto = document.getElementById('jm-gg-kpi-brutto');
        const elBruttoSub = document.getElementById('jm-gg-kpi-brutto-sub');
        if (elBrutto) elBrutto.textContent = fmtCurr(totalGewinn);
        if (elBruttoSub) elBruttoSub.textContent = `${comps.length} Schiessen erfasst`;

        // KPI 2: Vereinsanteil Doppel-Deckung
        const elDoppel = document.getElementById('jm-gg-kpi-doppel');
        const elDoppelSub = document.getElementById('jm-gg-kpi-doppel-sub');
        if (elDoppel) elDoppel.textContent = fmtCurr(totalDoppelGedeckt);
        if (elDoppelSub) {
            const gruppenComps = comps.filter(c => (c.anlass_typ || 'gruppe') !== 'einzel');
            if (totalDoppelGedeckt < totalDoppelSoll && partialDoppelNotes.length > 0) {
                elDoppelSub.innerHTML = `<span title="${escapeHtml(partialDoppelNotes.join(', '))}">aus ${fmtCurr(totalDoppelSoll)} Doppel (Deisigraben CHF 20.00)</span>`;
            } else {
                elDoppelSub.textContent = `aus ${gruppenComps.length} × Gruppendoppel (${fmtCurr(totalDoppelSoll)})`;
            }
        }

        // KPI 3: Netto-Ausschüttung 1301
        const elNetto = document.getElementById('jm-gg-kpi-netto');
        const elNettoSub = document.getElementById('jm-gg-kpi-netto-sub');
        if (elNetto) elNetto.textContent = fmtCurr(totalUeberschuss);
        if (elNettoSub) {
            elNettoSub.innerHTML = `<span class="text-success fw-semibold">Abgewickelt: ${fmtCurr(totalVerrechnet)}</span> · <span class="${totalOffen > 0 ? 'text-primary fw-bold' : 'text-muted'}">Offen: ${fmtCurr(totalOffen)}</span>`;
        }

        // KPI 4: FiBu Konto 1301
        const elFibu = document.getElementById('jm-gg-kpi-fibu');
        const elFibuSub = document.getElementById('jm-gg-kpi-fibu-sub');
        const fibuTotal = fibuReconcile ? fibuReconcile.totalFibuHaben1301 : 0;
        if (elFibu) elFibu.textContent = fmtCurr(fibuTotal);
        if (elFibuSub && fibuReconcile) {
            const unmFibu = fibuReconcile.unmatchedFibu1301?.length || 0;
            const unmComps = fibuReconcile.unmatchedComps?.length || 0;
            if (unmFibu === 0 && unmComps === 0 && Math.abs(fibuTotal - totalUeberschuss) < 0.05) {
                elFibuSub.innerHTML = `<span class="text-success fw-semibold"><i class="fas fa-check-circle me-1"></i>100% synchron mit Buchhaltung</span>`;
            } else {
                const parts = [];
                if (unmFibu > 0) parts.push(`<span class="text-danger fw-semibold">${unmFibu} in FiBu noch nicht zugewiesen</span>`);
                if (unmComps > 0) parts.push(`<span class="text-warning-emphasis">${unmComps} ohne FiBu-Eingang</span>`);
                elFibuSub.innerHTML = parts.join(' · ') || `Differenz: ${fmtCurr(fibuTotal - totalUeberschuss)}`;
            }
        }

        // Sammel-Übertragsbutton steuern
        const bulkBtn = document.getElementById('jm-gg-bulk-transfer-jb-btn');
        if (bulkBtn) {
            if (openCompsCount > 0 && totalOffen > 0) {
                bulkBtn.classList.remove('d-none');
                bulkBtn.innerHTML = `<i class="fas fa-file-invoice-dollar me-1"></i> Alle offenen in Jahresbeitrag übertragen <span class="badge bg-white text-primary ms-1">${openCompsCount} Schiessen · ${fmtCurr(totalOffen)}</span>`;
            } else {
                bulkBtn.classList.add('d-none');
            }
        }

        // Fusszeile
        const sumEl = document.getElementById('jm-gg-summary-text');
        if (sumEl) {
            sumEl.innerHTML = `
                <div>
                    Brutto-Gewinne: <strong class="text-success">${fmtCurr(totalGewinn)}</strong>
                    &minus; Vereinsanteil Doppel (Konto 4410): <strong class="text-dark">${fmtCurr(totalDoppelGedeckt)}</strong>
                    = Netto-Überschuss Schützen (Konto 1301): <strong class="text-primary">${fmtCurr(totalUeberschuss)}</strong>
                </div>
                <div>
                    <span class="badge bg-success-subtle text-success border border-success-subtle me-1">Verrechnet: ${fmtCurr(totalVerrechnet)}</span>
                    <span class="badge ${totalOffen > 0 ? 'bg-warning text-dark' : 'bg-light text-muted border'}">Noch offen: ${fmtCurr(totalOffen)}</span>
                </div>
            `;
        }
    }

    /**
     * Zeigt ein interaktives Abstimmungs-Banner, falls in der Buchhaltung auf Konto 1301
     * Gruppengewinne gebucht sind, die hier noch nicht erfasst/zugewiesen wurden (z.B. Laubberg, ESF),
     * oder falls ein erfasster Gewinn in der FiBu noch fehlt (z.B. Siggenberg).
     */
    function renderFibuReconcileBanner(fibuReconcile, yr) {
        const banner = document.getElementById('jm-gg-fibu-reconcile-banner');
        if (!banner || !fibuReconcile) return;

        const unmFibu = fibuReconcile.unmatchedFibu1301 || [];
        const unmComps = fibuReconcile.unmatchedComps || [];

        if (unmFibu.length === 0 && unmComps.length === 0) {
            banner.className = 'd-none';
            banner.innerHTML = '';
            return;
        }

        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
        let html = '';

        if (unmFibu.length > 0) {
            const rowsHtml = unmFibu.map(f => {
                const net1301 = Number(f.betrag || 0);
                const estBrutto = net1301 + 30;
                return `
                    <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 py-1.5 border-bottom border-warning-subtle">
                        <div>
                            <span class="badge bg-dark me-1">${escapeHtml(f.beleg_nr)}</span>
                            <span class="text-muted me-1">(${escapeHtml(f.datum)})</span>
                            <strong>${escapeHtml(f.beschreibung)}</strong>
                            <span class="ms-2 badge bg-primary">Überschuss 1301: ${fmtCurr(net1301)}</span>
                            <span class="text-muted small ms-1">(Brutto ca. ${fmtCurr(estBrutto)} bei CHF 30.00 Doppel)</span>
                        </div>
                        <button type="button" class="btn btn-xs btn-warning fw-bold shadow-xs" onclick="window.jmCreateCompFromFibuEntry(${f.id})">
                            <i class="fas fa-plus-circle me-1"></i> Jetzt als Gruppengewinn erfassen &amp; Schützen zuweisen
                        </button>
                    </div>
                `;
            }).join('');

            html += `
                <div class="alert alert-warning py-2.5 px-3 small mb-2 shadow-xs border border-warning rounded-3">
                    <div class="fw-bold text-dark mb-1">
                        <i class="fas fa-university text-warning-emphasis me-1"></i>
                        Buchhaltungs-Abgleich Konto 1301: ${unmFibu.length} Bankeingang/-eingänge in der Buchhaltung (${yr}) noch nicht als Gruppengewinn zugewiesen!
                    </div>
                    ${rowsHtml}
                </div>
            `;
        }

        if (unmComps.length > 0) {
            const missingNames = unmComps.map(c => {
                const ueb = Math.max(0, Number(c.gruppengewinn || 0) - Number(c.gruppendoppel || 30));
                return `<strong>${escapeHtml(c.anlass_name)}</strong> (Überschuss ${fmtCurr(ueb)})`;
            }).join(', ');

            html += `
                <div class="alert alert-secondary py-2 px-3 small mb-0 shadow-xs border rounded-3 d-flex align-items-center justify-content-between flex-wrap gap-2">
                    <div>
                        <i class="fas fa-info-circle text-secondary me-1"></i>
                        <strong>Hinweis FiBu Konto 1301:</strong> Für ${missingNames} ist im Modul ein Überschuss erfasst, im Buchhaltungs-Journal (${yr}) aber noch keine Haben-Buchung auf Konto <code>1301</code> verbucht (evtl. Zahlung noch ausstehend oder bar verrechnet).
                    </div>
                </div>
            `;
        }

        banner.className = 'mb-3';
        banner.innerHTML = html;
    }

    /**
     * Übernimmt eine unzugeordnete Buchhaltungs-Buchung (Konto 1301) per 1-Klick direkt in den Gruppengewinn-Editor.
     */
    async function jmCreateCompFromFibuEntry(journalId) {
        const entry = (window._jmFibu1301Cache || []).find(r => Number(r.id) === Number(journalId));
        if (!entry) return;

        const net1301 = Number(entry.betrag || 0);
        const doppel = 30.00;
        const brutto = net1301 + doppel;
        const desc = String(entry.beschreibung || '').trim();

        // Versuche Anlassnamen & Rang intelligent aus dem Buchungstext abzuleiten
        let guessedAnlass = desc
            .replace(/^Gruppengewinn:\s*/i, '')
            .replace(/\(Teilbetrag\s*\d+\)/gi, '')
            .trim();

        let guessedRang = null;
        const rangMatch = desc.match(/(\d+)\.\s*Rang/i) || desc.match(/Rang\s*(\d+)/i);
        if (rangMatch) {
            guessedRang = parseInt(rangMatch[1], 10);
        }

        if (/laubberg/i.test(desc)) {
            guessedAnlass = `Laubbergschiessen (Mettau) ${_jmActiveCompYear || getActiveYear()}`;
        } else if (/eidg.*sch[uü]tzenfest|chur/i.test(desc)) {
            guessedAnlass = `Eidg. Schützenfest (Chur) ${_jmActiveCompYear || getActiveYear()}`;
        }

        await jmOpenGroupCompetitionEditor({
            id: null,
            jahr: _jmActiveCompYear || getActiveYear(),
            anlass_name: guessedAnlass,
            gruppe_name: 'Strohaus',
            rang: guessedRang,
            punkte_total: null,
            gruppendoppel: doppel,
            gruppengewinn: brutto,
            anzahl_schuetzen: 5,
            bemerkung: `Übernommen aus FiBu ${entry.beleg_nr} (${entry.datum})`,
            members: []
        });

        // Falls das Schiessen in der JM existiert, automatisch die 5 Schützen laden
        const grid = await getJMGrid();
        const matched = findJMColumnForAnlass(guessedAnlass, grid);
        if (matched) {
            await jmPopulateShootersFromJMRawGrid(matched.title, true);
        }
    }

    let _jmCurrentTypeFilter = 'all';

    function jmSetTypeFilter(filter) {
        _jmCurrentTypeFilter = filter || 'all';
        const pills = document.querySelectorAll('#jm-gg-filter-pills button');
        pills.forEach(p => {
            const isActive = (p.getAttribute('data-filter') === _jmCurrentTypeFilter);
            p.className = `btn btn-sm fw-semibold ${isActive ? 'btn-primary' : 'btn-outline-secondary'}`;
        });
        jmFilterGruppengewinneTable();
    }

    /**
     * Filtert die Tabelle der Schützengewinne anhand des Suchbegriffs und der Typ-Pills.
     */
    function jmFilterGruppengewinneTable() {
        const searchEl = document.getElementById('jm-gg-search');
        const clearBtn = document.getElementById('jm-gg-search-clear');
        const query = (searchEl?.value || '').toLowerCase().trim();
        if (clearBtn) {
            clearBtn.classList.toggle('d-none', !query);
        }
        const rows = document.querySelectorAll('#jm-gg-table-body tr');
        rows.forEach(r => {
            const txt = r.innerText.toLowerCase();
            const rType = r.getAttribute('data-type') || 'gruppe';
            const rStatus = r.getAttribute('data-status') || 'offen';

            let typeMatch = true;
            if (_jmCurrentTypeFilter === 'open') {
                typeMatch = (rStatus === 'offen');
            } else if (_jmCurrentTypeFilter === 'gruppe') {
                typeMatch = (rType === 'gruppe');
            } else if (_jmCurrentTypeFilter === 'einzel') {
                typeMatch = (rType === 'einzel');
            } else if (_jmCurrentTypeFilter === 'kombiniert') {
                typeMatch = (rType === 'kombiniert');
            }

            const searchMatch = (!query || txt.includes(query));
            r.style.display = (typeMatch && searchMatch) ? '' : 'none';
        });
    }

    /**
     * Saison-Umschalter
     */
    async function jmOnGruppengewinneYearChange(val) {
        const yr = parseInt(val, 10);
        if (!isNaN(yr)) {
            await jmRenderGruppengewinneList(yr);
        }
    }

    /**
     * Aktualisiert die Liste
     */
    async function jmReloadGruppengewinneList() {
        await jmRenderGruppengewinneList(getActiveYear());
    }

    /**
     * Löscht einen Gruppengewinn nach Rückbestätigung.
     */
    async function jmDeleteGroupCompetition(id) {
        const comp = window._jmGroupCompetitions.find(c => String(c.id) === String(id));
        const name = comp ? `${comp.gruppe_name} (${comp.anlass_name})` : 'diesen Gruppengewinn';
        const supa = getSupa();
        if (!supa) return;

        // 1. Prüfen, ob Schützen bereits im Jahresbeitrag verrechnet sind und ob Rechnungen gesperrt sind
        const { data: dbMembers } = await supa.from('group_competition_members').select('*').eq('competition_id', id);
        const verrechnete = (dbMembers || []).filter(m => m.status === 'verrechnet' && m.contribution_position_id);

        if (verrechnete.length > 0) {
            const yr = comp ? (comp.jahr || getActiveYear()) : getActiveYear();
            for (const vm of verrechnete) {
                if (vm.person_number) {
                    const headId = `CH-${yr}-${vm.person_number}`;
                    const { data: head } = await supa.from('contributions_header').select('invoice_id').eq('id', headId).maybeSingle();
                    if (head && head.invoice_id) {
                        const { data: inv } = await supa.from('invoices').select('id, mail_status, total_paid').eq('id', head.invoice_id).maybeSingle();
                        if (inv && (inv.mail_status === 'versendet' || (inv.total_paid && Number(inv.total_paid) > 0))) {
                            if (window.UIConfirmKit) {
                                await UIConfirmKit.alert({
                                    title: 'Löschen gesperrt',
                                    message: `Der Gruppengewinn «${name}» kann nicht gelöscht werden, da für ${vm.schuetze_name} (PN: ${vm.person_number}) die Jahresbeitragsrechnung bereits versendet oder bezahlt wurde. Aus Revisionsgründen (GoBD / OR 957ff) ist eine Löschung gesperrt.`,
                                    type: 'danger'
                                });
                            } else {
                                alert(`Löschen gesperrt: Rechnung für ${vm.schuetze_name} bereits versendet oder bezahlt.`);
                            }
                            return;
                        }
                    }
                }
            }
        }

        let confirmed = false;
        const msgExtra = verrechnete.length > 0 
            ? `<br><br><span class="text-warning"><i class="fas fa-exclamation-triangle me-1"></i>Hinweis: ${verrechnete.length} Gutschrift(en) im Jahresbeitrag werden automatisch zurückgenommen und offene Rechnungsentwürfe neu saldiert.</span>`
            : '';

        if (window.UIConfirmKit) {
            confirmed = await UIConfirmKit.confirm({
                title: 'Gruppengewinn löschen?',
                message: `Möchtest du «${name}» wirklich unwiderruflich löschen? Allfällige Schützenzuordnungen werden ebenfalls entfernt.${msgExtra}`,
                type: 'danger',
                confirmText: 'Ja, löschen',
                cancelText: 'Abbrechen'
            });
        } else {
            confirmed = confirm(`Möchtest du ${name} wirklich löschen?`);
        }

        if (!confirmed) return;

        try {
            // 2. Allfällige Gutschriftspositionen im Jahresbeitrag bereinigen
            const yr = comp ? (comp.jahr || getActiveYear()) : getActiveYear();
            for (const vm of verrechnete) {
                if (vm.contribution_position_id) {
                    await supa.from('contributions_positions').delete().eq('id', vm.contribution_position_id);
                    if (vm.person_number) {
                        const headId = `CH-${yr}-${vm.person_number}`;
                        const { data: allPos } = await supa.from('contributions_positions').select('betrag').eq('header_id', headId);
                        const newGesamt = (allPos || []).reduce((acc, p) => acc + Number(p.betrag || 0), 0);
                        await supa.from('contributions_header').update({ gesamt: Math.max(0, newGesamt) }).eq('id', headId);

                        // Ggf. Entwurfsrechnung im RechnungsCore synchronisieren
                        const { data: head } = await supa.from('contributions_header').select('invoice_id').eq('id', headId).maybeSingle();
                        if (head && head.invoice_id) {
                            const { data: inv } = await supa.from('invoices').select('id, mail_status, total_paid').eq('id', head.invoice_id).maybeSingle();
                            if (inv && (!inv.mail_status || inv.mail_status === 'entwurf') && (!inv.total_paid || Number(inv.total_paid) === 0)) {
                                if (comp?.gruppe_name) {
                                    await supa.from('invoice_positions').delete().eq('invoice_id', inv.id).ilike('description', `%${comp.gruppe_name}%`);
                                }
                                await supa.from('invoices').update({
                                    total_amount: Math.max(0, newGesamt),
                                    open_amount: Math.max(0, newGesamt),
                                    pdf_url: null,
                                    pdf_storage_path: null,
                                    updated_at: new Date().toISOString()
                                }).eq('id', inv.id);
                            }
                        }
                    }
                }
            }

            const { error } = await supa.from('group_competitions').delete().eq('id', id);
            if (error) throw error;

            window._jmGroupCompetitions = window._jmGroupCompetitions.filter(c => String(c.id) !== String(id));
            await jmRenderGruppengewinneList(getActiveYear());

            if (typeof showSuccess === 'function') {
                showSuccess('Gruppengewinn erfolgreich gelöscht.');
            }
        } catch (err) {
            console.error("[Gruppengewinne] Löschfehler:", err);
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'Fehler beim Löschen', message: err.message, type: 'danger' });
            }
        }
    }

    // ==========================================================================
    // DETAIL-EDITOR & SCHÜTZEN-ZUORDNUNG
    // ==========================================================================

    /**
     * Öffnet den Detail-Editor für eine Gruppe (oder neu).
     * @param {string|object|null} compOrId ID, bestehendes Objekt oder null für Neuerfassung
     */
    async function jmOpenGroupCompetitionEditor(compOrId) {
        let comp = null;
        if (typeof compOrId === 'string') {
            comp = window._jmGroupCompetitions.find(c => String(c.id) === String(compOrId));
        } else if (compOrId && typeof compOrId === 'object') {
            comp = compOrId;
        }

        // Sicherstellen, dass bestehende Gruppengewinne des Jahres geladen sind (für Dropdown-Ausweisung)
        const targetYr = comp?.jahr || getActiveYear();
        if (!window._jmGroupCompetitions || window._jmGroupCompetitions.length === 0 || Number(_jmActiveCompYear) !== Number(targetYr)) {
            await jmLoadGroupCompetitions(targetYr);
            if (typeof compOrId === 'string' && !comp) {
                comp = window._jmGroupCompetitions.find(c => String(c.id) === String(compOrId));
            }
        }

        // Falls neu: Standard-Werte belegen
        if (!comp) {
            comp = {
                id: null,
                jahr: getActiveYear(),
                anlass_typ: 'gruppe',
                anlass_name: '',
                gruppe_name: 'Strohaus',
                rang: null,
                punkte_total: null,
                gruppendoppel: 30.00,
                gruppengewinn: 0.00,
                einzel_total: 0.00,
                anzahl_schuetzen: 5,
                bemerkung: '',
                members: []
            };
        }

        _jmCurrentEditingComp = JSON.parse(JSON.stringify(comp));

        // Mitglieder-Stamm für Dropdowns und IBAN-Vervollständigung sicherstellen
        await ensureMembersLoaded();

        let modalEl = document.getElementById('jmGruppengewinnEditModal');
        if (!modalEl) {
            createGruppengewinnEditModalDOM();
            modalEl = document.getElementById('jmGruppengewinnEditModal');
        }

        populateMembersDatalist();
        await populateCompetitionOptions(_jmCurrentEditingComp.anlass_name);
        populateEditorFields(_jmCurrentEditingComp);

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();
        if (window.UIModalKit && typeof window.UIModalKit.makeMovableAndResizable === 'function') {
            window.UIModalKit.makeMovableAndResizable(modalEl);
        }
    }

    /**
     * Lädt aktive Mitglieder zur Auswahl & IBAN-Ermittlung
     */
    let _allMembersCache = null;
    async function ensureMembersLoaded() {
        if (_allMembersCache && _allMembersCache.length > 0) return _allMembersCache;
        const supa = getSupa();
        if (!supa) return [];

        try {
            const { data, error } = await supa
                .from('members')
                .select('person_number, first_name, last_name, birth_date, iban, is_active')
                .eq('is_active', true)
                .order('last_name', { ascending: true });
            if (!error && data) {
                _allMembersCache = data;
            }
        } catch (_) {}
        return _allMembersCache || [];
    }

    /**
     * Erstellt das DOM für das Bearbeitungs-Modal.
     */
    
    /**
     * Ermittelt verfügbare Schiessen für die Auswahl im Editor:
     * 1. Bereits in Jahresmeisterschaft vorhanden (Spalten in jmRawGrid)
     * 2. Noch nicht in Jahresmeisterschaft erfasst (aus public.jm_competitions_catalog)
     */
    /**
     * Ermittelt das aktuelle Jahresmeisterschafts-Grid (jmRawGrid).
     * 1. RAM / window.jmRawGrid / window.getJMRawGrid()
     * 2. Fallback: Direkt atomar aus Supabase public.jm_seasons laden!
     */
    async function getJMGrid() {
        if (window.jmRawGrid && Array.isArray(window.jmRawGrid) && window.jmRawGrid.length > 5) {
            return window.jmRawGrid;
        }
        if (typeof window.getJMRawGrid === 'function') {
            const g = window.getJMRawGrid();
            if (g && Array.isArray(g) && g.length > 5) {
                window.jmRawGrid = g;
                return g;
            }
        }
        if (typeof jmRawGrid !== 'undefined' && Array.isArray(jmRawGrid) && jmRawGrid.length > 5) {
            window.jmRawGrid = jmRawGrid;
            return jmRawGrid;
        }

        // Fallback: Direkt aus Supabase public.jm_seasons laden
        const supa = getSupa();
        if (supa) {
            try {
                const yr = getActiveYear();
                const yearStr = String(yr);
                const { data, error } = await supa
                    .from('jm_seasons')
                    .select('raw_grid')
                    .in('jahr', ['current', yearStr, String(new Date().getFullYear())])
                    .order('is_archived', { ascending: true })
                    .limit(1)
                    .maybeSingle();

                if (!error && data && Array.isArray(data.raw_grid) && data.raw_grid.length > 5) {
                    window.jmRawGrid = data.raw_grid;
                    console.log('[Gruppengewinne] jmRawGrid erfolgreich aus Supabase jm_seasons bezogen.');
                    return data.raw_grid;
                }
            } catch (err) {
                console.warn('[Gruppengewinne] Fehler beim Laden von jm_seasons:', err);
            }
        }
        return null;
    }

    /**
     * Findet bestehende Gruppengewinn-Abrechnungen für einen Anlass im aktiven Jahr.
     */
    function findExistingGroupCompetitionsForAnlass(anlassTitle, gridInstance = null, excludeCompId = null) {
        if (!anlassTitle || !Array.isArray(window._jmGroupCompetitions)) return [];
        const grid = gridInstance || window.jmRawGrid;
        const norm = str => String(str || '')
            .toLowerCase()
            .replace(/ä/g, 'ae')
            .replace(/ö/g, 'oe')
            .replace(/ü/g, 'ue')
            .replace(/ß/g, 'ss')
            .replace(/[^a-z0-9]/g, '');

        const targetNorm = norm(anlassTitle);
        const targetClean = targetNorm.replace(/\d+/g, '');
        const targetCol = findJMColumnForAnlass(anlassTitle, grid);

        return window._jmGroupCompetitions.filter(c => {
            if (excludeCompId && String(c.id) === String(excludeCompId)) return false;
            const cName = String(c.anlass_name || '').trim();
            if (!cName) return false;

            // 1. Gleiche Jahresmeisterschafts-Spalte?
            if (targetCol && grid) {
                const cCol = findJMColumnForAnlass(cName, grid);
                if (cCol && cCol.colIndex === targetCol.colIndex) return true;
            }

            // 2. Direkter oder normalisierter Teilstring-Match
            const cNorm = norm(cName);
            if (cNorm === targetNorm || cNorm.includes(targetNorm) || targetNorm.includes(cNorm)) return true;

            const cClean = cNorm.replace(/\d+/g, '');
            if (targetClean.length > 5 && cClean.length > 5 && (cClean.includes(targetClean) || targetClean.includes(cClean))) {
                return true;
            }
            return false;
        });
    }

    /**
     * Formatiert eine Kurz-Zusammenfassung bestehender Abrechnungen für das Dropdown.
     */
    function formatExistingCompsSummary(comps) {
        if (!comps || comps.length === 0) return '';
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
        return comps.map(c => {
            const members = Array.isArray(c.members) ? c.members : [];
            const allDone = members.length > 0 && members.every(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt');
            const someDone = members.some(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt' || m.status === 'in_zahlung');
            const statusTxt = allDone ? 'Abgewickelt' : (someDone ? 'Teilw. verrechnet' : 'Offen');
            return `${c.gruppe_name || 'Gruppe'} · ${fmtCurr(Number(c.gruppengewinn || 0))} · ${statusTxt}`;
        }).join(' | ');
    }

    async function getAvailableCompetitionsForSelection() {
        const list = {
            jmCols: [],
            jmColsOpen: [],
            jmColsSettled: [],
            catalog: []
        };

        const norm = str => {
            if (!str) return '';
            return String(str)
                .toLowerCase()
                .replace(/ä/g, 'ae')
                .replace(/ö/g, 'oe')
                .replace(/ü/g, 'ue')
                .replace(/ß/g, 'ss')
                .replace(/[^a-z0-9]/g, '');
        };

        // 1. Aus Jahresmeisterschaft (jmRawGrid) ab Spalte 41
        const grid = await getJMGrid();
        const existingNorms = new Set();

        if (grid && Array.isArray(grid) && grid.length > 5 && grid[2]) {
            let hasStatusCol = false;
            if (grid[4]) {
                hasStatusCol = grid[4].some(cell => String(cell || '').trim().toLowerCase() === 'status');
            }
            const limitIndex = hasStatusCol ? 42 : 41;
            for (let c = limitIndex; c < grid[2].length; c++) {
                const title = String(grid[2][c] || '').trim();
                if (title && !title.toLowerCase().startsWith('spalte')) {
                    const maxPts = parseFloat(grid[3]?.[c]) || 100;
                    let shooterCount = 0;
                    for (let r = 5; r < grid.length; r++) {
                        if (r === 13 || r === 14) continue;
                        const val = parseFloat(String(grid[r]?.[c] || '').replace(',', '.'));
                        if (!isNaN(val) && val > 0) shooterCount++;
                    }
                    const existingComps = findExistingGroupCompetitionsForAnlass(title, grid);
                    const colEntry = {
                        colIndex: c,
                        title: title,
                        maxPts: maxPts,
                        shooterCount: shooterCount,
                        existingComps: existingComps
                    };
                    list.jmCols.push(colEntry);
                    if (existingComps.length > 0) {
                        list.jmColsSettled.push(colEntry);
                    } else {
                        list.jmColsOpen.push(colEntry);
                    }
                    existingNorms.add(norm(title));
                }
            }
        }

        // 2. Aus Schützenfeste-Katalog: NUR Schiessen, die NOCH NICHT in der Jahresmeisterschaft erfasst sind!
        if (typeof window.loadJMSchuetzenfesteCatalog === 'function') {
            try {
                const cat = await window.loadJMSchuetzenfesteCatalog();
                (cat || []).filter(c => c.is_active !== false).forEach(c => {
                    const catNorm = norm(c.anlass);
                    const keywords = String(c.suchbegriffe || '').split(';').map(k => norm(k)).filter(Boolean);

                    // Prüfen ob bereits in existingNorms vorhanden
                    let isAlreadyInJM = false;
                    for (const ex of existingNorms) {
                        if (ex === catNorm || ex.includes(catNorm) || catNorm.includes(ex)) {
                            isAlreadyInJM = true;
                            break;
                        }
                        if (keywords.some(kw => kw.length > 3 && (ex.includes(kw) || kw.includes(ex)))) {
                            isAlreadyInJM = true;
                            break;
                        }
                    }

                    // Nur aufnehmen, wenn NOCH NICHT in der Jahresmeisterschaft vorhanden!
                    if (!isAlreadyInJM) {
                        const existingComps = findExistingGroupCompetitionsForAnlass(c.anlass, grid);
                        if (existingComps.length > 0) {
                            list.jmColsSettled.push({
                                colIndex: null,
                                title: c.anlass,
                                maxPts: c.max_punkte,
                                shooterCount: 0,
                                existingComps: existingComps
                            });
                        } else {
                            list.catalog.push({
                                id: c.id,
                                title: c.anlass,
                                ort: c.ort,
                                maxPts: c.max_punkte
                            });
                        }
                    }
                });
            } catch (e) {
                console.warn('[Gruppengewinne] Schützenfeste-Katalog konnte nicht geladen werden:', e);
            }
        }

        return list;
    }

    /**
     * Findet die zugehörige Spalte in jmRawGrid anhand des Anlassnamens.
     */
    function findJMColumnForAnlass(anlassName, gridInstance = null) {
        const grid = gridInstance || window.jmRawGrid;
        if (!grid || !Array.isArray(grid) || grid.length < 6 || !grid[2]) return null;

        let hasStatusCol = false;
        if (grid[4]) {
            hasStatusCol = grid[4].some(cell => String(cell || '').trim().toLowerCase() === 'status');
        }
        const limitIndex = hasStatusCol ? 42 : 41;

        const norm = str => {
            if (!str) return '';
            return String(str)
                .toLowerCase()
                .replace(/ä/g, 'ae')
                .replace(/ö/g, 'oe')
                .replace(/ü/g, 'ue')
                .replace(/ß/g, 'ss')
                .replace(/[^a-z0-9]/g, '');
        };

        const targetNorm = norm(anlassName);
        if (!targetNorm) return null;

        // 1. Exakter Match
        for (let c = limitIndex; c < grid[2].length; c++) {
            const title = String(grid[2][c] || '').trim();
            if (!title || title.toLowerCase().startsWith('spalte')) continue;
            if (title.toLowerCase() === anlassName.toLowerCase()) {
                return { colIndex: c, title };
            }
        }

        // 2. Normalisierter Match
        for (let c = limitIndex; c < grid[2].length; c++) {
            const title = String(grid[2][c] || '').trim();
            if (!title || title.toLowerCase().startsWith('spalte')) continue;
            const colNorm = norm(title);
            if (colNorm === targetNorm) {
                return { colIndex: c, title };
            }
        }

        // 3. Teilstring Match (z. B. "Deisigrabenschiessen" in "26. Deisigrabenschiessen 2026")
        for (let c = limitIndex; c < grid[2].length; c++) {
            const title = String(grid[2][c] || '').trim();
            if (!title || title.toLowerCase().startsWith('spalte')) continue;
            const colNorm = norm(title);
            if (colNorm.includes(targetNorm) || targetNorm.includes(colNorm)) {
                return { colIndex: c, title };
            }
            const targetClean = targetNorm.replace(/\d+/g, '');
            const colClean = colNorm.replace(/\d+/g, '');
            if (targetClean.length > 4 && colClean.length > 4 && (colClean.includes(targetClean) || targetClean.includes(colClean))) {
                return { colIndex: c, title };
            }
        }

        // 4. Katalog-Suchbegriffe Match
        if (window._jmCatalogCache && window._jmCatalogCache.length > 0) {
            const catEntry = window._jmCatalogCache.find(cat => {
                const cNorm = norm(cat.anlass);
                if (cNorm === targetNorm || targetNorm.includes(cNorm) || cNorm.includes(targetNorm)) return true;
                const kw = String(cat.suchbegriffe || '').split(';').map(k => norm(k)).filter(Boolean);
                return kw.some(k => k.length > 3 && (targetNorm.includes(k) || k.includes(targetNorm)));
            });

            if (catEntry) {
                const catNorm = norm(catEntry.anlass);
                const catKws = String(catEntry.suchbegriffe || '').split(';').map(k => norm(k)).filter(Boolean);
                for (let c = limitIndex; c < grid[2].length; c++) {
                    const title = String(grid[2][c] || '').trim();
                    if (!title || title.toLowerCase().startsWith('spalte')) continue;
                    const colNorm = norm(title);
                    if (colNorm.includes(catNorm) || catNorm.includes(colNorm) || catKws.some(k => k.length > 3 && colNorm.includes(k))) {
                        return { colIndex: c, title };
                    }
                }
            }
        }

        return null;
    }

    let _jmLastDetectedGridShooters = [];

    /**
     * Befüllt das Dropdown und die Datalist für den Anlass.
     */
    async function populateCompetitionOptions(selectedAnlass = '') {
        const select = document.getElementById('jme-anlass-select');
        const datalist = document.getElementById('jme-anlass-datalist');
        if (!select || !datalist) return;

        const available = await getAvailableCompetitionsForSelection();
        const curYear = getActiveYear();

        let optionsHtml = '<option value="">-- Schiessen aus Dropdown wählen --</option>';

        // 1. In Jahresmeisterschaft vorhanden – noch offen (keine Abrechnung vorhanden)
        if (available.jmColsOpen && available.jmColsOpen.length > 0) {
            optionsHtml += `<optgroup label="🎯 In Jahresmeisterschaft vorhanden – noch offen (${curYear})">`;
            available.jmColsOpen.forEach(col => {
                const countStr = col.shooterCount > 0 ? ` (${col.shooterCount} Resultate)` : ' (Noch keine Resultate)';
                optionsHtml += `<option value="${escapeHtml(col.title)}" data-source="jm" data-settled="false" data-col="${col.colIndex}" data-count="${col.shooterCount}">${escapeHtml(col.title)}${countStr}</option>`;
            });
            optionsHtml += '</optgroup>';
        }

        // 2. Bereits abgerechnet / Gruppengewinn erfasst (gesondert ausgewiesen)
        if (available.jmColsSettled && available.jmColsSettled.length > 0) {
            optionsHtml += `<optgroup label="💰 Bereits abgerechnet / Gruppengewinn erfasst (${curYear})">`;
            available.jmColsSettled.forEach(col => {
                const countStr = col.shooterCount > 0 ? ` (${col.shooterCount} Resultate)` : '';
                const summary = formatExistingCompsSummary(col.existingComps);
                const infoStr = summary ? ` — [Erfasst: ${summary}]` : ' — [Bereits erfasst]';
                optionsHtml += `<option value="${escapeHtml(col.title)}" data-source="jm" data-settled="true" data-col="${col.colIndex ?? ''}" data-count="${col.shooterCount || 0}">✓ ${escapeHtml(col.title)}${countStr}${escapeHtml(infoStr)}</option>`;
            });
            optionsHtml += '</optgroup>';
        }

        // 3. Noch nicht in Jahresmeisterschaft erfasst (aus Katalog)
        if (available.catalog && available.catalog.length > 0) {
            optionsHtml += '<optgroup label="📋 Noch nicht in Jahresmeisterschaft erfasst (aus Festkatalog)">';
            available.catalog.forEach(cat => {
                const ortStr = cat.ort ? ` (${cat.ort})` : '';
                optionsHtml += `<option value="${escapeHtml(cat.title)}" data-source="catalog" data-settled="false">${escapeHtml(cat.title)}${ortStr}</option>`;
            });
            optionsHtml += '</optgroup>';
        }

        optionsHtml += '<option value="__custom__">✏️ Anderer / Eigener Anlass (Freitext eingeben)...</option>';
        select.innerHTML = optionsHtml;

        // Datalist befüllen
        let dlHtml = '';
        const allTitles = new Set();
        if (available.jmCols) available.jmCols.forEach(c => allTitles.add(c.title));
        if (available.catalog) available.catalog.forEach(c => allTitles.add(c.title));
        allTitles.forEach(t => {
            dlHtml += `<option value="${escapeHtml(t)}">`;
        });
        datalist.innerHTML = dlHtml;

        // Vorselektion & Custom-Feld Steuerung
        const customWrap = document.getElementById('jme-anlass-custom-wrap');
        if (selectedAnlass) {
            const grid = await getJMGrid();
            const matched = findJMColumnForAnlass(selectedAnlass, grid);
            const selectValue = matched ? matched.title : selectedAnlass;

            const found = Array.from(select.options).find(opt => opt.value.toLowerCase() === selectValue.toLowerCase());
            if (found) {
                select.value = found.value;
                if (customWrap) customWrap.classList.add('d-none');
            } else {
                select.value = '__custom__';
                if (customWrap) customWrap.classList.remove('d-none');
            }
        } else {
            select.value = '';
            if (customWrap) customWrap.classList.add('d-none');
        }

        await checkAnlassJMSyncBanner(selectedAnlass);
    }

    /**
     * Schaltet das manuelle Freitext-Feld für den Anlassnamen ein/aus.
     */
    function jmToggleCustomAnlassInput(forceShow) {
        const customWrap = document.getElementById('jme-anlass-custom-wrap');
        const input = document.getElementById('jme-anlass');
        if (!customWrap) return;
        const willShow = typeof forceShow === 'boolean' ? forceShow : customWrap.classList.contains('d-none');
        customWrap.classList.toggle('d-none', !willShow);
        if (willShow && input) {
            input.focus();
            input.select();
        }
    }

    /**
     * Befüllt die Datalist der aktiven Mitglieder.
     */
    function populateMembersDatalist() {
        const dl = document.getElementById('jme-members-datalist');
        if (!dl || !_allMembersCache || _allMembersCache.length === 0) return;

        dl.innerHTML = _allMembersCache.map(m => {
            const fullName = `${m.first_name} ${m.last_name}`;
            const ibanNote = m.iban ? 'IBAN vorhanden' : 'Keine IBAN';
            return `<option value="${fullName}">PN: ${m.person_number} · ${ibanNote}</option>`;
        }).join('');
    }

    /**
     * Prüft bestehende Abrechnungen für den gewählten Anlass und zeigt ein Hinweis-/Schnellwechsel-Banner.
     */
    async function renderExistingSettlementNotice(anlassTitle) {
        const noticeEl = document.getElementById('jme-existing-comp-banner');
        if (!noticeEl) return;

        const title = (anlassTitle || '').trim();
        if (!title) {
            noticeEl.className = 'd-none';
            noticeEl.innerHTML = '';
            return;
        }

        const grid = await getJMGrid();
        const currentId = _jmCurrentEditingComp?.id || null;
        const existingOther = findExistingGroupCompetitionsForAnlass(title, grid, currentId);

        if (!existingOther || existingOther.length === 0) {
            noticeEl.className = 'd-none';
            noticeEl.innerHTML = '';
            return;
        }

        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
        const itemsHtml = existingOther.map(c => {
            const members = Array.isArray(c.members) ? c.members : [];
            const allDone = members.length > 0 && members.every(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt');
            const badgeCls = allDone ? 'bg-success' : 'bg-secondary';
            const badgeTxt = allDone ? 'Abgewickelt' : 'Offen';
            return `
                <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 py-1">
                    <div>
                        <i class="fas fa-exclamation-circle text-warning me-1"></i>
                        Für dieses Schiessen besteht bereits eine Abrechnung:
                        <strong>Gruppe «${escapeHtml(c.gruppe_name)}»</strong>
                        (${fmtCurr(Number(c.gruppengewinn || 0))} · <span class="badge ${badgeCls}" style="font-size:10px;">${badgeTxt}</span> · ${members.length} Schützen)
                    </div>
                    <button type="button" class="btn btn-xs btn-warning fw-bold shadow-xs" onclick="window.jmOpenGroupCompetitionEditor('${c.id}')">
                        <i class="fas fa-pen me-1"></i> Bestehende Abrechnung «${escapeHtml(c.gruppe_name)}» öffnen
                    </button>
                </div>
            `;
        }).join('<hr class="my-1 opacity-25">');

        noticeEl.className = 'alert alert-warning py-2 px-3 small mb-3 shadow-xs border border-warning';
        noticeEl.innerHTML = `
            ${itemsHtml}
            <div class="text-muted mt-1" style="font-size: 11px;">
                <i class="fas fa-info-circle me-1"></i>Falls ihr mit einer <strong>zweiten Gruppe</strong> (z. B. <em>Strohaus 2</em>) teilgenommen habt, kannst du unten direkt die nächste Gruppe erfassen.
            </div>
        `;
    }

    /**
     * Rendert im grünen Sync-Banner bei > 5 Schützen eine Schnell-Auswahl (Tauschen/Hinzufügen).
     */
    function renderAdditionalShootersPills(matchedTitle) {
        const banner = document.getElementById('jme-jm-sync-banner');
        if (!banner || !_jmLastDetectedGridShooters || _jmLastDetectedGridShooters.length === 0) return;

        const currentMembers = _jmCurrentEditingComp?.members || [];
        const currentNames = new Set(currentMembers.map(m => String(m.schuetze_name || '').trim().toLowerCase()));

        let extraHtml = '';
        if (_jmLastDetectedGridShooters.length > 5 || _jmLastDetectedGridShooters.some(s => !currentNames.has(s.name.toLowerCase()))) {
            const pills = _jmLastDetectedGridShooters.map((s, idx) => {
                const isSelected = currentNames.has(s.name.toLowerCase());
                const btnCls = isSelected
                    ? 'btn-success text-white shadow-xs'
                    : 'btn-outline-secondary bg-white text-dark';
                const icon = isSelected ? 'fa-check' : 'fa-plus';
                const titleHint = isSelected
                    ? 'Ist aktuell in der Gruppe eingeteilt (Klick zum Entfernen)'
                    : 'Klicken, um diesen Schützen in die Gruppe aufzunehmen';
                return `
                    <button type="button" class="btn btn-xs ${btnCls} py-1 px-2.5 rounded-pill" style="font-size: 11.5px; line-height: 1.3;" onclick="window.jmToggleGridShooterInEditor(${idx})" title="${titleHint}">
                        <i class="fas ${icon} me-1"></i>${escapeHtml(s.name)} <strong>(${s.punkte})</strong>
                    </button>
                `;
            }).join('');

            extraHtml = `
                <div class="mt-2.5 pt-2 border-top border-success-subtle">
                    <div class="text-muted mb-2 fw-semibold" style="font-size: 11.5px;">
                        <i class="fas fa-exchange-alt me-1"></i>Alle ${_jmLastDetectedGridShooters.length} Schützen dieses Schiessens (Klick zum Ein-/Austeilen):
                    </div>
                    <div class="d-flex flex-wrap align-items-center gap-2">
                        ${pills}
                    </div>
                </div>
            `;
        }

        banner.className = 'alert alert-success py-2.5 px-3 small mb-3 shadow-xs border';
        banner.innerHTML = `
            <div class="d-flex flex-wrap align-items-center justify-content-between gap-2">
                <div class="d-flex align-items-center gap-2">
                    <i class="fas fa-check-circle text-success fa-lg"></i>
                    <div>
                        <strong>${currentMembers.length} Schützen & Punkte</strong> (Total: ${_jmCurrentEditingComp?.punkte_total || 0} Pkt.) aus der Jahresmeisterschaft «${escapeHtml(matchedTitle)}» geladen.
                    </div>
                </div>
                <button type="button" class="btn btn-xs btn-outline-success fw-semibold" onclick="window.jmPopulateShootersFromJMRawGrid('${escapeHtml(matchedTitle)}', false)">
                    <i class="fas fa-sync-alt me-1"></i> Top 5 neu laden
                </button>
            </div>
            ${extraHtml}
        `;
        banner.classList.remove('d-none');
    }

    /**
     * Schaltet einen erkannten Schützen aus dem JM-Grid per 1-Klick in die aktuelle Gruppe ein oder aus.
     */
    function jmToggleGridShooterInEditor(detectedIdx) {
        const s = _jmLastDetectedGridShooters?.[detectedIdx];
        if (!s || !_jmCurrentEditingComp) return;

        _jmCurrentEditingComp.members = _jmCurrentEditingComp.members || [];
        const existingIdx = _jmCurrentEditingComp.members.findIndex(
            m => String(m.schuetze_name || '').trim().toLowerCase() === s.name.toLowerCase()
        );

        if (existingIdx !== -1) {
            const targetMember = _jmCurrentEditingComp.members[existingIdx];
            if (targetMember.status === 'verrechnet' || targetMember.status === 'in_zahlung' || targetMember.status === 'ausgefuehrt') {
                if (window.UIConfirmKit) {
                    UIConfirmKit.alert({
                        title: 'Schütze bereits abgerechnet',
                        message: `${targetMember.schuetze_name} wurde bereits verrechnet bzw. zur Zahlung angewiesen und kann nicht mehr aus der Gruppe entfernt werden.`,
                        type: 'warning'
                    });
                }
                return;
            }
            _jmCurrentEditingComp.members.splice(existingIdx, 1);
        } else {
            let pn = null;
            let iban = '';
            const mObj = findMemberByName(s.name) || findMemberByPn(s.lizenz);
            if (mObj) {
                pn = mObj.person_number;
                iban = mObj.iban || '';
            } else if (s.lizenz && !isNaN(parseInt(s.lizenz, 10))) {
                pn = parseInt(s.lizenz, 10);
            }
            _jmCurrentEditingComp.members.push({
                person_number: pn,
                schuetze_name: s.name,
                jahrgang: s.jahrgang,
                punkte: s.punkte,
                stich_name: '',
                anteil_gruppe: 0,
                anteil_einzel: 0,
                betrag: 0,
                payout_method: 'jahresbeitrag',
                iban: iban,
                status: 'offen'
            });
        }

        const typ = _jmCurrentEditingComp.anlass_typ || 'gruppe';
        _jmCurrentEditingComp.punkte_total = computeGroupPointsTotal(_jmCurrentEditingComp.members, typ);
        _jmCurrentEditingComp.anzahl_schuetzen = _jmCurrentEditingComp.members.length;

        const punkteInput = document.getElementById('jme-punkte');
        if (punkteInput) punkteInput.value = _jmCurrentEditingComp.punkte_total || '';

        renderShooterRows(_jmCurrentEditingComp.members);
        jmRecalculateCurrentComp();
        renderAdditionalShootersPills(_jmCurrentEditingComp.anlass_name || '');
    }

    /**
     * Prüft, ob für den gewählten Anlass Resultate in der Jahresmeisterschaft existieren.
     */
    async function checkAnlassJMSyncBanner(anlassTitle) {
        const banner = document.getElementById('jme-jm-sync-banner');
        const quickBtn = document.getElementById('jme-quick-import-jm-btn');
        if (!banner) return;

        const title = (anlassTitle || document.getElementById('jme-anlass')?.value || '').trim();
        await renderExistingSettlementNotice(title);

        if (!title) {
            banner.classList.add('d-none');
            banner.classList.remove('d-flex');
            if (quickBtn) quickBtn.style.display = 'none';
            return;
        }

        const grid = await getJMGrid();
        const matched = findJMColumnForAnlass(title, grid);
        if (!matched) {
            banner.classList.add('d-none');
            banner.classList.remove('d-flex');
            if (quickBtn) quickBtn.style.display = 'none';
            return;
        }

        const headerRow = grid[4] || [];
        const colNachname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'nachname');
        const colVorname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'vorname');
        const colLizenz = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('lizenz'));
        const colJahrgang = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('jahrgang'));

        const detected = [];
        for (let r = 5; r < grid.length; r++) {
            if (r === 13 || r === 14) continue;
            const val = parseFloat(String(grid[r]?.[matched.colIndex] || '').replace(',', '.'));
            if (!isNaN(val) && val > 0) {
                const nachname = colNachname !== -1 ? String(grid[r][colNachname] || '').trim() : '';
                const vorname = colVorname !== -1 ? String(grid[r][colVorname] || '').trim() : '';
                const fullName = `${vorname} ${nachname}`.trim();
                const liz = colLizenz !== -1 ? String(grid[r][colLizenz] || '').trim() : '';
                const jg = colJahrgang !== -1 ? parseInt(grid[r][colJahrgang], 10) : null;
                if (fullName) {
                    detected.push({ name: fullName, punkte: val, lizenz: liz, jahrgang: isNaN(jg) ? null : jg });
                }
            }
        }
        detected.sort((a, b) => b.punkte - a.punkte);
        _jmLastDetectedGridShooters = detected;

        const count = detected.length;
        if (count > 0) {
            if (quickBtn) quickBtn.style.display = '';
            if (_jmCurrentEditingComp?.members && _jmCurrentEditingComp.members.length > 0) {
                renderAdditionalShootersPills(matched.title);
            } else {
                banner.className = 'alert alert-primary py-2.5 px-3 small d-flex align-items-center justify-content-between mb-3 shadow-xs border';
                banner.innerHTML = `
                    <div class="d-flex align-items-center gap-2">
                        <i class="fas fa-medal text-primary fa-lg"></i>
                        <div>
                            In der Jahresmeisterschaft <strong>«${escapeHtml(matched.title)}»</strong> gefunden (<span class="fw-bold">${count}</span> Schützen mit Resultat).
                        </div>
                    </div>
                    <button type="button" class="btn btn-xs btn-primary fw-semibold shadow-xs" onclick="window.jmPopulateShootersFromJMRawGrid()">
                        <i class="fas fa-users me-1"></i> Schützen & Punkte übernehmen
                    </button>
                `;
                banner.classList.remove('d-none');
            }
        } else {
            banner.classList.add('d-none');
            banner.classList.remove('d-flex');
            if (quickBtn) quickBtn.style.display = 'none';
        }
    }

    /**
     * Event-Handler: Auswahl im Anlass-Dropdown geändert.
     * Wenn ein Schiessen aus der Jahresmeisterschaft gewählt wird:
     * SOFORT AUTOMATISCH DIE SCHÜTZEN UND RESULTATE ÜBERNEHMEN!
     */
    async function jmOnAnlassSelectChange(val) {
        const input = document.getElementById('jme-anlass');
        const customWrap = document.getElementById('jme-anlass-custom-wrap');
        if (!input) return;

        if (val === '__custom__') {
            if (customWrap) customWrap.classList.remove('d-none');
            input.value = '';
            input.focus();
            if (_jmCurrentEditingComp) _jmCurrentEditingComp.anlass_name = '';
            await checkAnlassJMSyncBanner('');
            return;
        }

        if (customWrap) customWrap.classList.add('d-none');

        if (val) {
            input.value = val;
            if (_jmCurrentEditingComp) {
                _jmCurrentEditingComp.anlass_name = val;
            }

            const grid = await getJMGrid();
            const existingOther = findExistingGroupCompetitionsForAnlass(val, grid, _jmCurrentEditingComp?.id);

            // Falls für diesen Anlass bereits eine Gruppe (z. B. Strohaus) existiert und wir im Neu-Modus sind:
            // Automatisch nächste Gruppenbezeichnung vorschlagen (z. B. Strohaus 2)
            if (!_jmCurrentEditingComp?.id && existingOther.length > 0) {
                const grpInput = document.getElementById('jme-gruppe');
                if (grpInput && (grpInput.value === 'Strohaus' || grpInput.value === 'Strohhaus 1' || !grpInput.value.trim())) {
                    const nextNum = existingOther.length + 1;
                    grpInput.value = `Strohaus ${nextNum}`;
                    _jmCurrentEditingComp.gruppe_name = grpInput.value;
                }
            } else if (!_jmCurrentEditingComp?.id) {
                const grpInput = document.getElementById('jme-gruppe');
                if (grpInput && /^Strohaus\s+\d+$/i.test(grpInput.value)) {
                    grpInput.value = 'Strohaus';
                    _jmCurrentEditingComp.gruppe_name = 'Strohaus';
                }
            }

            await renderExistingSettlementNotice(val);
            renderEditorRanglistenFiles(_jmCurrentEditingComp);

            // Automatische Übernahme der Schützen & Punkte aus der Jahresmeisterschaft!
            const matched = findJMColumnForAnlass(val, grid);
            if (matched) {
                await jmPopulateShootersFromJMRawGrid(matched.title, true);
            } else {
                await checkAnlassJMSyncBanner(val);
            }

            // Fokus direkt auf das Feld "Gruppengewinn (Brutto)" legen für flüssige Dateneingabe
            setTimeout(() => {
                const gewinnInput = document.getElementById('jme-gewinn');
                if (gewinnInput) {
                    gewinnInput.focus();
                    gewinnInput.select();
                }
            }, 80);
        } else {
            input.value = '';
            if (_jmCurrentEditingComp) _jmCurrentEditingComp.anlass_name = '';
            await checkAnlassJMSyncBanner('');
        }
    }

    /**
     * Event-Handler: Manuelle Eingabe im Anlass-Textfeld.
     */
    async function jmOnAnlassInputChange(val) {
        if (_jmCurrentEditingComp) {
            _jmCurrentEditingComp.anlass_name = val.trim();
        }
        const select = document.getElementById('jme-anlass-select');
        if (select) {
            const found = Array.from(select.options).find(opt => opt.value.toLowerCase() === val.trim().toLowerCase());
            if (found) {
                select.value = found.value;
            } else if (val.trim()) {
                select.value = '__custom__';
            } else {
                select.value = '';
            }
        }

        // Wenn noch keine Schützen erfasst sind und ein JM-Schiessen getippt wird:
        const grid = await getJMGrid();
        const matched = findJMColumnForAnlass(val.trim(), grid);
        if (matched && (!_jmCurrentEditingComp?.members || _jmCurrentEditingComp.members.length === 0)) {
            await jmPopulateShootersFromJMRawGrid(matched.title, true);
        } else {
            await checkAnlassJMSyncBanner(val);
        }
    }

    /**
     * Leert das Anlass-Eingabefeld.
     */
    function jmClearAnlassInput() {
        const input = document.getElementById('jme-anlass');
        const select = document.getElementById('jme-anlass-select');
        const customWrap = document.getElementById('jme-anlass-custom-wrap');
        if (input) input.value = '';
        if (select) select.value = '';
        if (customWrap) customWrap.classList.add('d-none');
        if (_jmCurrentEditingComp) _jmCurrentEditingComp.anlass_name = '';
        checkAnlassJMSyncBanner('');
        if (select) select.focus();
    }

    /**
     * 1-Klick-Übernahme: Liest die Schützen und Punkte dieses Schiessens direkt aus der Jahresmeisterschaft!
     * @param {string} [forceAnlassName] - Optionaler Anlass-Name
     * @param {boolean} [isAuto=false] - Ob der Aufruf automatisch beim Auswählen im Dropdown erfolgte
     */
    async function jmPopulateShootersFromJMRawGrid(forceAnlassName, isAuto = false) {
        const anlassName = (forceAnlassName || document.getElementById('jme-anlass')?.value || _jmCurrentEditingComp?.anlass_name || '').trim();
        if (!anlassName) return false;

        // Schutz: Wenn in der aktuellen Gruppe bereits verrechnete Schützen vorhanden sind, nicht blind überschreiben
        const lockedMembers = (_jmCurrentEditingComp?.members || []).filter(
            m => m.status === 'verrechnet' || m.status === 'in_zahlung' || m.status === 'ausgefuehrt'
        );
        if (lockedMembers.length > 0 && !isAuto) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Schützen bereits abgerechnet',
                    message: `In dieser Gruppe sind bereits ${lockedMembers.length} Schütze(n) verrechnet oder zur Zahlung angewiesen. Du kannst einzelne offene Schützen über die Auswahl-Buttons oben ein- oder austeilen.`,
                    type: 'warning'
                });
            }
            return false;
        }

        const grid = await getJMGrid();
        const matched = findJMColumnForAnlass(anlassName, grid);
        if (!matched) {
            if (!isAuto && window.UIConfirmKit) {
                UIConfirmKit.alert({
                    title: 'Schiessen nicht im Grid',
                    message: `Für «${anlassName}» wurde keine passende Auswärtsschiessen-Spalte in der Jahresmeisterschaft gefunden. Du kannst die Schützen manuell erfassen.`,
                    type: 'info'
                });
            }
            return false;
        }

        const foundCol = matched.colIndex;
        const matchedTitle = matched.title;

        const headerRow = grid[4] || [];
        const colNachname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'nachname');
        const colVorname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'vorname');
        const colLizenz = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('lizenz'));
        const colJahrgang = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('jahrgang'));

        const detected = [];
        for (let r = 5; r < grid.length; r++) {
            if (r === 13 || r === 14) continue;
            const rawScore = grid[r]?.[foundCol];
            const pts = parseFloat(String(rawScore === undefined || rawScore === null ? '' : rawScore).replace(',', '.'));
            if (!isNaN(pts) && pts > 0) {
                const nachname = colNachname !== -1 ? String(grid[r][colNachname] || '').trim() : '';
                const vorname = colVorname !== -1 ? String(grid[r][colVorname] || '').trim() : '';
                const fullName = `${vorname} ${nachname}`.trim();
                const liz = colLizenz !== -1 ? String(grid[r][colLizenz] || '').trim() : '';
                const jg = colJahrgang !== -1 ? parseInt(grid[r][colJahrgang], 10) : null;
                if (fullName) {
                    detected.push({
                        name: fullName,
                        punkte: pts,
                        lizenz: liz,
                        jahrgang: isNaN(jg) ? null : jg
                    });
                }
            }
        }

        if (detected.length === 0) {
            if (!isAuto && window.UIConfirmKit) {
                UIConfirmKit.alert({
                    title: 'Keine Resultate vorhanden',
                    message: `In der Spalte «${matchedTitle}» sind noch keine Schützenresultate eingetragen.`,
                    type: 'info'
                });
            }
            return false;
        }

        // Nach Punkten absteigend sortieren
        detected.sort((a, b) => b.punkte - a.punkte);
        _jmLastDetectedGridShooters = detected;

        // Falls bereits eine 1. Gruppe für dieses Schiessen existiert, zuerst noch nicht eingeteilte Schützen bevorzugen
        const existingOther = findExistingGroupCompetitionsForAnlass(matchedTitle, grid, _jmCurrentEditingComp?.id);
        const alreadyAssignedNames = new Set();
        existingOther.forEach(comp => {
            (comp.members || []).forEach(m => {
                if (m.schuetze_name) alreadyAssignedNames.add(String(m.schuetze_name).trim().toLowerCase());
            });
        });

        const unassignedShooters = detected.filter(s => !alreadyAssignedNames.has(s.name.toLowerCase()));
        const candidatePool = (existingOther.length > 0 && unassignedShooters.length > 0) ? unassignedShooters : detected;

        // Bis zu 5 Schützen übernehmen (oder alle vorhandenen falls weniger als 5)
        const countToTake = Math.min(5, candidatePool.length);
        const topShooters = candidatePool.slice(0, countToTake);

        _jmCurrentEditingComp.members = topShooters.map(s => {
            let pn = null;
            let iban = '';
            const mObj = findMemberByName(s.name) || findMemberByPn(s.lizenz);
            if (mObj) {
                pn = mObj.person_number;
                iban = mObj.iban || '';
            } else if (s.lizenz && !isNaN(parseInt(s.lizenz, 10))) {
                pn = parseInt(s.lizenz, 10);
            }

            return {
                person_number: pn,
                schuetze_name: s.name,
                jahrgang: s.jahrgang,
                punkte: s.punkte,
                betrag: 0,
                payout_method: 'jahresbeitrag',
                iban: iban,
                status: 'offen'
            };
        });

        // Punkte Total der Gruppe berechnen
        const sumPts = _jmCurrentEditingComp.members.reduce((a, b) => a + (b.punkte || 0), 0);
        _jmCurrentEditingComp.punkte_total = Math.round(sumPts * 10) / 10;
        _jmCurrentEditingComp.anzahl_schuetzen = _jmCurrentEditingComp.members.length;

        const punkteInput = document.getElementById('jme-punkte');
        if (punkteInput) punkteInput.value = _jmCurrentEditingComp.punkte_total;

        // Anlass-Textfeld auf genauen Spaltentitel setzen
        const anlassInput = document.getElementById('jme-anlass');
        if (anlassInput && anlassInput.value !== matchedTitle) {
            anlassInput.value = matchedTitle;
            _jmCurrentEditingComp.anlass_name = matchedTitle;
        }

        renderShooterRows(_jmCurrentEditingComp.members);
        jmRecalculateCurrentComp();
        renderAdditionalShootersPills(matchedTitle);

        if (typeof showSuccess === 'function') {
            showSuccess(`🎉 ${_jmCurrentEditingComp.members.length} Schützen für «${matchedTitle}» automatisch aus Jahresmeisterschaft übernommen!`);
        }

        return true;
    }

    function ensureGruppengewinnModalStyles() {
        if (document.getElementById('jm-gruppengewinn-custom-style')) return;
        const style = document.createElement('style');
        style.id = 'jm-gruppengewinn-custom-style';
        style.textContent = `
            /* Pfeile bei Number-Inputs (Punkte, Gruppe, Einzel) komplett entfernen */
            .jme-no-spin::-webkit-outer-spin-button,
            .jme-no-spin::-webkit-inner-spin-button,
            input.jme-shooter-pts::-webkit-outer-spin-button,
            input.jme-shooter-pts::-webkit-inner-spin-button,
            input.jme-shooter-gruppe::-webkit-outer-spin-button,
            input.jme-shooter-gruppe::-webkit-inner-spin-button,
            input.jme-shooter-einzel::-webkit-outer-spin-button,
            input.jme-shooter-einzel::-webkit-inner-spin-button {
                -webkit-appearance: none !important;
                margin: 0 !important;
            }
            .jme-no-spin,
            input.jme-shooter-pts,
            input.jme-shooter-gruppe,
            input.jme-shooter-einzel {
                -moz-appearance: textfield !important;
            }

            /* Tabelle im Erfassungs-Modal: angenehmes Padding nach Portal-Standard */
            #jme-shooters-table td {
                padding: 0.45rem 0.4rem !important;
                vertical-align: middle !important;
            }
            #jme-shooters-table thead th {
                padding: 0.5rem 0.4rem !important;
                font-weight: 600;
                vertical-align: middle;
            }
        `;
        document.head.appendChild(style);
    }

    function createGruppengewinnEditModalDOM() {
        ensureGruppengewinnModalStyles();
        const div = document.createElement('div');
        div.id = 'jmGruppengewinnEditModal';
        div.className = 'modal fade';
        div.tabIndex = -1;
        div.setAttribute('aria-hidden', 'true');
        div.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable" style="max-width: 1360px; width: 96vw;">
                <div class="modal-content shadow-lg border-0">
                    <div class="modal-header bg-dark text-white py-2.5 px-3">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-warning text-dark"><i class="fas fa-edit"></i></span>
                            <div>
                                <h5 class="modal-title fw-bold mb-0" id="jm-edit-modal-title">Schützengewinn erfassen &amp; aufteilen</h5>
                                <div class="small text-white-50">Konto 1301 · Gruppenwettkämpfe, Einzelgewinne &amp; Auszahler</div>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <div class="modal-body p-3 bg-light">
                        <!-- Abrechnungs-Typ Umschalter (Gruppe / Einzel / Kombiniert) -->
                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 p-2 bg-white rounded-3 shadow-xs border">
                            <div class="d-flex align-items-center gap-2">
                                <span class="small fw-bold text-muted"><i class="fas fa-layer-group text-primary me-1"></i>Abrechnungs-Typ:</span>
                                <div class="btn-group btn-group-sm" role="group" id="jme-anlass-typ-group">
                                    <input type="radio" class="btn-check" name="jme-anlass-typ" id="jme-typ-gruppe" value="gruppe" checked onchange="window.jmOnAnlassTypChange(this.value)">
                                    <label class="btn btn-outline-primary fw-semibold" for="jme-typ-gruppe"><i class="fas fa-users me-1"></i>👥 Nur Gruppe</label>

                                    <input type="radio" class="btn-check" name="jme-anlass-typ" id="jme-typ-einzel" value="einzel" onchange="window.jmOnAnlassTypChange(this.value)">
                                    <label class="btn btn-outline-primary fw-semibold" for="jme-typ-einzel"><i class="fas fa-crosshairs me-1"></i>🎯 Nur Einzelgewinne</label>

                                    <input type="radio" class="btn-check" name="jme-anlass-typ" id="jme-typ-kombiniert" value="kombiniert" onchange="window.jmOnAnlassTypChange(this.value)">
                                    <label class="btn btn-outline-primary fw-semibold" for="jme-typ-kombiniert"><i class="fas fa-layer-group me-1"></i>👥+🎯 Gruppe &amp; Einzel</label>
                                </div>
                            </div>
                            <span class="badge bg-light text-dark border small" id="jme-typ-hint-badge">👥 Gruppenwettkampf mit Doppel-Abzug (CHF 30.-)</span>
                        </div>

                        <!-- Stammdaten Gruppe & Finanzen -->
                        <div class="card shadow-sm border-0 mb-3">
                            <div class="card-header bg-white py-2 fw-bold text-dark border-bottom small">
                                <i class="fas fa-bullseye me-1 text-primary"></i> 1. Anlass, Gruppe &amp; Abrechnungswerte
                            </div>
                            <div class="card-body p-3">
                                <div class="row g-2">
                                    <div class="col-md-5">
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <label class="form-label small fw-bold mb-0">Anlass / Schiessen *</label>
                                            <span class="badge bg-secondary-subtle text-muted border" style="font-size: 10px;">Offene &amp; abgerechnete Schiessen</span>
                                        </div>
                                        <div class="input-group input-group-sm">
                                            <select class="form-select form-select-sm fw-semibold text-primary" id="jme-anlass-select" onchange="window.jmOnAnlassSelectChange(this.value)">
                                                <option value="">-- Schiessen aus Dropdown wählen --</option>
                                            </select>
                                            <button type="button" class="btn btn-outline-secondary" onclick="window.jmToggleCustomAnlassInput()" title="Anlassnamen frei bearbeiten / manuell eingeben">
                                                <i class="fas fa-pen"></i>
                                            </button>
                                        </div>
                                        <div class="input-group input-group-sm mt-1 d-none" id="jme-anlass-custom-wrap">
                                            <input type="text" class="form-control form-control-sm" id="jme-anlass" list="jme-anlass-datalist" placeholder="Eigener Anlassname (z. B. 14. Bärenmoosschiessen 2026)" required oninput="window.jmOnAnlassInputChange(this.value)">
                                            <button type="button" class="btn btn-outline-secondary" onclick="window.jmClearAnlassInput()" title="Freitext zurücksetzen">
                                                <i class="fas fa-times"></i>
                                            </button>
                                        </div>
                                        <datalist id="jme-anlass-datalist"></datalist>
                                    </div>
                                    <div class="col-md-3" id="jme-gruppe-col">
                                        <label class="form-label small fw-bold mb-1">Gruppenname <span id="jme-gruppe-required">*</span></label>
                                        <input type="text" class="form-control form-control-sm" id="jme-gruppe" placeholder="z. B. Strohaus" required>
                                    </div>
                                    <div class="col-md-2" id="jme-rang-col">
                                        <label class="form-label small fw-bold mb-1">Rang</label>
                                        <input type="number" class="form-control form-control-sm text-center" id="jme-rang" placeholder="z. B. 2">
                                    </div>
                                    <div class="col-md-2" id="jme-punkte-col">
                                        <label class="form-label small fw-bold mb-1">Total Punkte</label>
                                        <input type="number" step="0.1" class="form-control form-control-sm text-center" id="jme-punkte" placeholder="z. B. 487">
                                    </div>

                                    <!-- Finanz-Berechnung (4-Spalten Grid ohne Umbruch-Probleme) -->
                                    <div class="col-12 mt-2">
                                        <div class="p-2.5 rounded bg-light border">
                                            <div class="row g-2 align-items-center">
                                                <div class="col-sm-6 col-md-3" id="jme-doppel-col">
                                                    <label class="small fw-bold text-muted d-block mb-1">Gruppendoppel (Verein)</label>
                                                    <div class="input-group input-group-sm">
                                                        <span class="input-group-text">CHF</span>
                                                        <input type="number" step="0.5" class="form-control fw-bold text-end" id="jme-doppel" value="30.00" oninput="window.jmRecalculateCurrentComp()">
                                                    </div>
                                                </div>
                                                <div class="col-sm-6 col-md-3" id="jme-gewinn-col">
                                                    <label class="small fw-bold text-success d-block mb-1" id="jme-gewinn-label">Gruppengewinn (Brutto) *</label>
                                                    <div class="input-group input-group-sm">
                                                        <span class="input-group-text bg-success text-white fw-bold border-success">CHF</span>
                                                        <input type="number" step="0.5" class="form-control fw-bold text-end text-success border-success bg-white" id="jme-gewinn" value="0.00" oninput="window.jmRecalculateCurrentComp()">
                                                    </div>
                                                </div>
                                                <div class="col-sm-6 col-md-3 text-sm-center" id="jme-ueberschuss-col">
                                                    <label class="small fw-bold text-primary d-block mb-1" id="jme-ueberschuss-label">Netto-Überschuss Schützen</label>
                                                    <span class="badge bg-primary fs-6 px-3 py-1.5 d-inline-block" id="jme-ueberschuss-badge">CHF 0.00</span>
                                                </div>
                                                <div class="col-sm-6 col-md-3 text-sm-center" id="jme-pershooter-col">
                                                    <label class="small fw-bold text-dark d-block mb-1" id="jme-pershooter-label">Anteil je Schütze</label>
                                                    <span class="badge bg-warning text-dark fs-6 px-3 py-1.5 d-inline-block" id="jme-pershooter-badge">CHF 0.00</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Hinweis-Banner bei bereits bestehender Abrechnung für dieses Schiessen -->
                        <div id="jme-existing-comp-banner" class="d-none"></div>

                        <!-- Smart Sync Banner für Jahresmeisterschaft -->
                        <div id="jme-jm-sync-banner" class="alert alert-primary py-2 px-3 small d-none align-items-center justify-content-between mb-3 shadow-xs border">
                            <div class="d-flex align-items-center gap-2">
                                <i class="fas fa-medal text-primary fa-lg"></i>
                                <div>
                                    In der Jahresmeisterschaft <strong id="jme-jm-sync-colname"></strong> gefunden (<span id="jme-jm-sync-count" class="fw-bold">0</span> Schützen mit Resultat).
                                </div>
                            </div>
                            <button type="button" class="btn btn-xs btn-primary fw-semibold shadow-xs" onclick="window.jmPopulateShootersFromJMRawGrid()">
                                <i class="fas fa-users me-1"></i> 5 Schützen &amp; Punkte übernehmen
                            </button>
                        </div>

                        <!-- 2. Beteiligte Schützen & Gewinnaufteilung -->
                        <div class="card shadow-sm border-0 mb-3">
                            <div class="card-header bg-white py-2 d-flex align-items-center justify-content-between border-bottom small">
                                <span class="fw-bold text-dark">
                                    <i class="fas fa-users me-1 text-primary"></i> 2. Beteiligte Schützen &amp; Zuweisung (<span id="jme-shooter-count">0</span>)
                                </span>
                                <div class="d-flex align-items-center gap-2">
                                    <button type="button" class="btn btn-xs btn-outline-secondary" id="jme-quick-import-jm-btn" onclick="window.jmPopulateShootersFromJMRawGrid()" style="display:none;" title="Übernimmt die besten Muhen-Schützen dieses Schiessens aus der Jahresmeisterschaft">
                                        <i class="fas fa-file-import me-1 text-primary"></i> Aus Jahresmeisterschaft laden
                                    </button>
                                    <button type="button" class="btn btn-xs btn-outline-primary fw-semibold" onclick="window.jmAddShooterRowToEditor()">
                                        <i class="fas fa-user-plus me-1"></i> Schütze hinzufügen
                                    </button>
                                </div>
                            </div>
                            <div class="card-body p-0">
                                <datalist id="jme-members-datalist"></datalist>
                                <datalist id="jme-stiche-datalist">
                                    <option value="Auszahler">
                                    <option value="Festsieger">
                                    <option value="Gabenstich">
                                    <option value="Kategoriensieg">
                                    <option value="Tiefschuss">
                                    <option value="Meisterschaft">
                                </datalist>
                                <div class="table-responsive" style="max-height: 420px;">
                                    <table class="table table-hover align-middle mb-0" id="jme-shooters-table" style="table-layout: fixed; width: 100%;">
                                        <thead class="table-light small text-secondary border-bottom">
                                            <tr id="jme-shooters-thead-tr">
                                                <th class="ps-3" style="width: 22%;">Schütze (Name / Status)</th>
                                                <th class="text-center" style="width: 7%;">Punkte</th>
                                                <th style="width: 12%;" id="jme-th-stich">Stich / Gabe</th>
                                                <th class="text-end" style="width: 11%;" id="jme-th-gruppe">Gruppe (CHF)</th>
                                                <th class="text-end" style="width: 11%;" id="jme-th-einzel">Einzel (CHF)</th>
                                                <th class="text-end" style="width: 9%;" id="jme-th-total">Total</th>
                                                <th style="width: 13%;">Auszahlungsweg</th>
                                                <th style="width: 12%;">IBAN</th>
                                                <th class="text-center pe-3" style="width: 3%;"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="jme-shooters-body" class="small">
                                            <!-- Dynamische Schützenzeilen -->
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>

                        <!-- 3. Offizielle Rangliste(n) & Belege -->
                        <div class="card shadow-sm border-0">
                            <div class="card-header bg-white py-2 d-flex align-items-center justify-content-between border-bottom small">
                                <span class="fw-bold text-dark">
                                    <i class="fas fa-file-pdf me-1 text-danger"></i> 3. Offizielle Ranglisten-Belege (automatische 180-Tage-Links beim Jahresbeitrag)
                                </span>
                                <div class="d-flex align-items-center gap-2">
                                    <input type="file" id="jme-rangliste-file-input" class="d-none" accept=".pdf,image/*" onchange="window.jmHandleEditorRanglisteUpload(this.files)">
                                    <button type="button" class="btn btn-xs btn-outline-primary fw-semibold" onclick="document.getElementById('jme-rangliste-file-input')?.click()">
                                        <i class="fas fa-cloud-upload-alt me-1"></i> Rangliste / Snip hochladen
                                    </button>
                                </div>
                            </div>
                            <div class="card-body p-2.5 bg-white">
                                <div id="jme-ranglisten-list" class="d-flex flex-wrap gap-2 align-items-center">
                                    <span class="text-muted small fst-italic">Noch keine Rangliste verknüpft. Beim Import in der Jahresmeisterschaft wird die Datei automatisch hier hinterlegt.</span>
                                </div>
                                <div class="text-muted mt-1.5" style="font-size: 11px;">
                                    <i class="fas fa-link text-primary me-1"></i> Hinterlegte Ranglisten erhalten automatisch einen sauberen Titel, bleiben komplett erhalten und werden beim Versand des Jahresbeitrags als <strong>180 Tage gültiger Direktlink</strong> (ohne E-Mail-Anhang) in der persönlichen Einzelberechnung des Schützen mitgesendet.
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
                        <div class="d-flex flex-wrap gap-2">
                            <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.jmGenerateGruppengewinnPdfFromEditor()">
                                <i class="fas fa-file-pdf me-1 text-danger"></i> Beleg drucken (PDF)
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-info text-dark fw-semibold" id="jme-transfer-jb-btn" onclick="window.jmTransferCurrentCompToJahresbeitrag()">
                                <i class="fas fa-file-invoice-dollar me-1 text-primary"></i> In Jahresbeitrag übertragen
                            </button>
                            <button type="button" class="btn btn-sm btn-outline-primary fw-semibold" id="jme-transfer-po-btn" onclick="window.jmTransferCurrentCompToPaymentOrder()">
                                <i class="fas fa-file-export me-1"></i> Bank-Überweisung (pain.001)
                            </button>
                        </div>
                        <div class="d-flex gap-2">
                            <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Abbrechen</button>
                            <button type="button" class="btn btn-sm btn-primary fw-bold px-3" id="jme-save-btn" onclick="window.jmSaveCurrentComp()">
                                <i class="fas fa-save me-1"></i> Schützengewinn speichern
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    /**
     * Schaltet zwischen den 3 Abrechnungs-Typen (gruppe, einzel, kombiniert) um
     */
    function jmOnAnlassTypChange(typ, triggerRecalc = true) {
        if (!_jmCurrentEditingComp) return;
        _jmCurrentEditingComp.anlass_typ = typ;

        const isGruppe = typ === 'gruppe';
        const isEinzel = typ === 'einzel';
        const isKombiniert = typ === 'kombiniert';

        // Sichtbarkeiten Gruppenfelder
        const gruppeCol = document.getElementById('jme-gruppe-col');
        const rangCol = document.getElementById('jme-rang-col');
        const punkteCol = document.getElementById('jme-punkte-col');
        const doppelCol = document.getElementById('jme-doppel-col');
        const gewinnCol = document.getElementById('jme-gewinn-col');
        const ueberschussCol = document.getElementById('jme-ueberschuss-col');
        const pershooterCol = document.getElementById('jme-pershooter-col');
        const gruppeReq = document.getElementById('jme-gruppe-required');

        if (gruppeReq) gruppeReq.style.display = isEinzel ? 'none' : 'inline';

        if (isEinzel) {
            if (gruppeCol) gruppeCol.style.display = 'none';
            if (rangCol) rangCol.style.display = 'none';
            if (punkteCol) punkteCol.style.display = 'none';
            if (doppelCol) doppelCol.style.display = 'none';
            if (gewinnCol) gewinnCol.style.display = 'none';
            if (pershooterCol) pershooterCol.style.display = 'none';
            const ueberLabel = document.getElementById('jme-ueberschuss-label');
            if (ueberLabel) ueberLabel.innerText = 'Total Einzelgewinne';
        } else if (isGruppe) {
            if (gruppeCol) gruppeCol.style.display = '';
            if (rangCol) rangCol.style.display = '';
            if (punkteCol) punkteCol.style.display = '';
            if (doppelCol) doppelCol.style.display = '';
            if (gewinnCol) gewinnCol.style.display = '';
            if (pershooterCol) pershooterCol.style.display = '';
            const gewinnLabel = document.getElementById('jme-gewinn-label');
            if (gewinnLabel) gewinnLabel.innerText = 'Gruppengewinn (Brutto) *';
            const ueberLabel = document.getElementById('jme-ueberschuss-label');
            if (ueberLabel) ueberLabel.innerText = 'Netto-Überschuss Schützen';
            const perLabel = document.getElementById('jme-pershooter-label');
            if (perLabel) perLabel.innerText = 'Anteil je Schütze';
        } else {
            // kombiniert
            if (gruppeCol) gruppeCol.style.display = '';
            if (rangCol) rangCol.style.display = '';
            if (punkteCol) punkteCol.style.display = '';
            if (doppelCol) doppelCol.style.display = '';
            if (gewinnCol) gewinnCol.style.display = '';
            if (pershooterCol) pershooterCol.style.display = '';
            const gewinnLabel = document.getElementById('jme-gewinn-label');
            if (gewinnLabel) gewinnLabel.innerText = 'Gruppengewinn (Brutto) *';
            const ueberLabel = document.getElementById('jme-ueberschuss-label');
            if (ueberLabel) ueberLabel.innerText = 'Gruppen-Überschuss';
            const perLabel = document.getElementById('jme-pershooter-label');
            if (perLabel) perLabel.innerText = 'Gruppen-Anteil je Schütze';
        }

        // Tabellen-Header anpassen
        const thStich = document.getElementById('jme-th-stich');
        const thGruppe = document.getElementById('jme-th-gruppe');
        const thEinzel = document.getElementById('jme-th-einzel');
        const thTotal = document.getElementById('jme-th-total');

        if (thStich) thStich.style.display = isGruppe ? 'none' : '';
        if (thGruppe) thGruppe.style.display = isEinzel ? 'none' : '';
        if (thEinzel) thEinzel.style.display = isGruppe ? 'none' : '';
        if (thTotal) {
            thTotal.style.display = '';
            thTotal.innerText = isGruppe ? 'Gutschrift' : 'Total (CHF)';
        }

        // Modal-Titel anpassen
        const modalTitle = document.getElementById('jm-edit-modal-title');
        if (modalTitle) {
            const anlassName = document.getElementById('jme-anlass')?.value || _jmCurrentEditingComp.anlass_name || '';
            const gruppeName = document.getElementById('jme-gruppe')?.value || _jmCurrentEditingComp.gruppe_name || '';
            if (isEinzel) {
                modalTitle.innerText = _jmCurrentEditingComp.id ? `🎯 Einzelgewinne bearbeiten: ${anlassName}` : '🎯 Einzelgewinne erfassen';
            } else if (isKombiniert) {
                modalTitle.innerText = _jmCurrentEditingComp.id ? `👥+🎯 Kombinierte Gewinne: ${gruppeName || anlassName}` : '👥+🎯 Kombinierten Schützengewinn erfassen';
            } else {
                modalTitle.innerText = _jmCurrentEditingComp.id ? `👥 Gruppengewinn bearbeiten: ${gruppeName || anlassName}` : '👥 Gruppengewinn erfassen';
            }
        }

        renderShooterRows(_jmCurrentEditingComp.members || []);

        if (triggerRecalc) {
            jmRecalculateCurrentComp();
        }
    }

    /**
     * Erzeugt das Status-Badge für eine Schützenzeile im Editor.
     */
    function buildShooterStatusBadgeHtml(m) {
        const status = m?.status || 'offen';
        const hasSettledGroup = Boolean(m?.contribution_position_id) && Number(m?.anteil_gruppe || 0) > 0;
        if (status === 'verrechnet') {
            return `<span class="badge bg-success-subtle text-success border border-success-subtle" style="font-size: 9.5px;"><i class="fas fa-check-circle me-1"></i>Verrechnet (JB)</span>`;
        }
        if (status === 'in_zahlung') {
            return `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle" style="font-size: 9.5px;"><i class="fas fa-university me-1"></i>In Zahlung</span>`;
        }
        if (status === 'ausgefuehrt') {
            return `<span class="badge bg-success" style="font-size: 9.5px;"><i class="fas fa-check-double me-1"></i>Ausbezahlt</span>`;
        }
        if (hasSettledGroup) {
            return `<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle" style="font-size: 9.5px;" title="Gruppenanteil bereits im Jahresbeitrag verrechnet – Einzelgewinn noch offen"><i class="fas fa-clock me-1"></i>Gruppe verr. · Einzel offen</span>`;
        }
        return `<span class="badge bg-secondary-subtle text-secondary border" style="font-size: 9.5px;">Offen</span>`;
    }

    /**
     * Befüllt die Felder des Detail-Editors
     */
    function populateEditorFields(comp) {
        const typ = comp.anlass_typ || 'gruppe';
        const typRadio = document.querySelector(`input[name="jme-anlass-typ"][value="${typ}"]`);
        if (typRadio) typRadio.checked = true;

        if (Array.isArray(comp.members)) {
            comp.members.forEach(m => {
                m._initialStatus = m.status || 'offen';
                m._initialEinzel = Number(m.anteil_einzel || 0);
                m._initialStich = String(m.stich_name || '').trim();
                // Alt-Datensätze absichern, bei denen nur betrag belegt war
                if (typ !== 'einzel' && Number(m.anteil_gruppe || 0) === 0 && Number(m.betrag || 0) > 0 && Number(m.anteil_einzel || 0) === 0) {
                    m.anteil_gruppe = Number(m.betrag);
                }
            });
        }

        document.getElementById('jme-anlass').value = comp.anlass_name || '';
        document.getElementById('jme-gruppe').value = comp.gruppe_name || (typ === 'einzel' ? '' : 'Strohaus');
        document.getElementById('jme-rang').value = comp.rang || '';
        document.getElementById('jme-punkte').value = comp.punkte_total || '';
        document.getElementById('jme-doppel').value = Number(comp.gruppendoppel !== undefined ? comp.gruppendoppel : (typ === 'einzel' ? 0 : 30)).toFixed(2);
        document.getElementById('jme-gewinn').value = Number(comp.gruppengewinn || 0).toFixed(2);

        jmOnAnlassTypChange(typ, false);
        renderShooterRows(comp.members || []);
        jmRecalculateCurrentComp();
        renderEditorRanglistenFiles(comp);
        checkAnlassJMSyncBanner(comp.anlass_name);
    }

    /**
     * Rendert die Schützen-Zeilen im Detail-Editor
     */
    function renderShooterRows(members) {
        const tbody = document.getElementById('jme-shooters-body');
        if (!tbody) return;

        const typ = _jmCurrentEditingComp?.anlass_typ || 'gruppe';
        const isGruppe = typ === 'gruppe';
        const isEinzel = typ === 'einzel';
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);

        if (!members || members.length === 0) {
            tbody.innerHTML = `<tr><td colspan="9" class="text-center py-4 text-muted">Noch keine Schützen zugewiesen. Wähle oben ein Schiessen aus oder klicke auf «Schütze hinzufügen».</td></tr>`;
            document.getElementById('jme-shooter-count').innerText = '0';
            updateTransferActionButtons();
            return;
        }

        document.getElementById('jme-shooter-count').innerText = String(members.length);

        tbody.innerHTML = members.map((m, idx) => {
            const memberObj = findMemberByPn(m.person_number) || findMemberByName(m.schuetze_name);
            if (memberObj) {
                if (!m.person_number) m.person_number = memberObj.person_number;
                if (!m.iban && memberObj.iban) m.iban = memberObj.iban;
            }
            const currentIban = m.iban || memberObj?.iban || '';
            const hasIban = Boolean(currentIban && currentIban.trim().length > 10);
            const payoutMethod = m.payout_method || 'jahresbeitrag';
            const status = m.status || 'offen';
            const isFullyLocked = status === 'in_zahlung' || status === 'ausgefuehrt';
            const isGroupProtected = isFullyLocked || status === 'verrechnet' || (Boolean(m.contribution_position_id) && Number(m.anteil_gruppe || 0) > 0);
            const isMethodLocked = isFullyLocked || status === 'verrechnet';
            const isEinzelLocked = isFullyLocked;

            const statusBadge = buildShooterStatusBadgeHtml(m);

            return `
                <tr data-idx="${idx}" class="${isGroupProtected ? 'table-light' : ''}">
                    <td class="ps-3">
                        <input type="text" class="form-control form-control-sm fw-semibold jme-shooter-name" list="jme-members-datalist" value="${escapeHtml(m.schuetze_name || '')}" placeholder="Vorname Nachname (tippen zum Suchen)" ${isGroupProtected ? 'disabled' : ''} onchange="window.jmOnShooterNameChange(${idx}, this.value)">
                        <input type="hidden" class="jme-shooter-pn" value="${m.person_number || memberObj?.person_number || ''}">
                        <div class="d-flex align-items-center justify-content-between mt-1" style="font-size: 10px;">
                            <span class="text-muted">
                                ${m.person_number || memberObj?.person_number ? `PN: ${m.person_number || memberObj.person_number}` : '<span class="text-warning">Nicht im Mitgliederstamm verknüpft</span>'}
                            </span>
                            <span class="jme-status-badge-slot">${statusBadge}</span>
                        </div>
                    </td>
                    <td class="text-center">
                        <input type="number" step="0.1" class="form-control form-control-sm text-center jme-no-spin jme-shooter-pts" value="${m.punkte || ''}" placeholder="Pkt" style="font-size: 12px;" ${isGroupProtected ? 'disabled' : ''} onchange="window.jmOnShooterPointsChange(${idx}, this.value)">
                    </td>
                    <td style="${isGruppe ? 'display:none;' : ''}">
                        <input type="text" class="form-control form-control-sm jme-shooter-stich" list="jme-stiche-datalist" value="${escapeHtml(m.stich_name || '')}" placeholder="z. B. Auszahler" style="font-size: 12px;" ${isEinzelLocked ? 'disabled' : ''} onchange="window.jmOnShooterStichChange(${idx}, this.value)">
                    </td>
                    <td class="text-end" style="${isEinzel ? 'display:none;' : ''}">
                        <div class="input-group input-group-sm">
                            <span class="input-group-text px-1 text-muted small">CHF</span>
                            <input type="number" step="0.05" class="form-control form-control-sm text-end jme-no-spin px-1.5 jme-shooter-gruppe" value="${Number(m.anteil_gruppe || 0).toFixed(2)}" ${isGroupProtected || isGruppe ? 'disabled' : ''} onchange="window.jmOnShooterGruppeChange(${idx}, this.value)">
                        </div>
                    </td>
                    <td class="text-end" style="${isGruppe ? 'display:none;' : ''}">
                        <div class="input-group input-group-sm">
                            <span class="input-group-text px-1 text-muted small">CHF</span>
                            <input type="number" step="0.05" class="form-control form-control-sm fw-bold text-end text-success jme-no-spin px-1.5 jme-shooter-einzel" value="${Number(m.anteil_einzel || 0).toFixed(2)}" ${isEinzelLocked ? 'disabled' : ''} oninput="window.jmOnShooterEinzelChange(${idx}, this.value)" onchange="window.jmOnShooterEinzelChange(${idx}, this.value)">
                        </div>
                    </td>
                    <td class="text-end fw-bold text-dark">
                        <span class="jme-shooter-total">${fmtCurr(m.betrag || 0)}</span>
                    </td>
                    <td>
                        <select class="form-select form-select-sm jme-shooter-method" style="font-size: 11.5px;" ${isMethodLocked ? 'disabled' : ''} onchange="window.jmOnShooterMethodChange(${idx}, this.value)">
                            <option value="jahresbeitrag" ${payoutMethod === 'jahresbeitrag' ? 'selected' : ''}>Verrechnung JB</option>
                            <option value="bank" ${payoutMethod === 'bank' ? 'selected' : ''}>Bank (pain.001)</option>
                            <option value="kasse" ${payoutMethod === 'kasse' ? 'selected' : ''}>Bar (Kasse 1000)</option>
                            <option value="pendent" ${payoutMethod === 'pendent' ? 'selected' : ''}>Pendent / Unklar</option>
                        </select>
                    </td>
                    <td>
                        <div class="d-flex align-items-center gap-1">
                            <input type="text" class="form-control form-control-sm font-monospace jme-shooter-iban ${hasIban ? 'border-success' : 'border-warning'}" style="font-size: 11px;" value="${escapeHtml(currentIban)}" placeholder="CH..." ${isMethodLocked ? 'disabled' : ''} onchange="window.jmOnShooterIbanChange(${idx}, this.value)">
                            ${hasIban ? '<i class="fas fa-check-circle text-success" title="IBAN vorhanden"></i>' : '<i class="fas fa-exclamation-triangle text-warning" title="Keine IBAN im System"></i>'}
                        </div>
                        ${!memberObj?.iban && hasIban && !isMethodLocked ? `
                            <div class="form-check mt-1" style="font-size: 10px;">
                                <input class="form-check-input jme-save-iban-check" type="checkbox" id="save-iban-${idx}" checked>
                                <label class="form-check-label text-muted" for="save-iban-${idx}">Im Mitgliederstamm sichern</label>
                            </div>
                        ` : ''}
                    </td>
                    <td class="text-center pe-3">
                        <button type="button" class="btn btn-xs btn-outline-danger" ${isGroupProtected ? 'disabled title="Bereits abgerechneter Schütze kann nicht entfernt werden"' : 'title="Schütze entfernen"'} onclick="window.jmRemoveShooterRow(${idx})">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        updateTransferActionButtons();
    }

    /**
     * Ermittelt den noch offenen (nicht bereits per JB/Bank abgewickelten) Betrag eines Schützen.
     */
    function getMemberOpenAmount(m) {
        return getMemberSplitAmounts(m, _jmCurrentEditingComp).openForTransferAmt;
    }

    /**
     * Aktualisiert die Zähler und Zustände der Footer-Aktionsbuttons (Jahresbeitrag / pain.001).
     */
    function updateTransferActionButtons() {
        const jbBtn = document.getElementById('jme-transfer-jb-btn');
        const poBtn = document.getElementById('jme-transfer-po-btn');
        const members = _jmCurrentEditingComp?.members || [];

        const jbOpen = members.filter(m => (m.payout_method || 'jahresbeitrag') === 'jahresbeitrag' && getMemberOpenAmount(m) > 0 && m.status !== 'verrechnet');
        const poOpen = members.filter(m => m.payout_method === 'bank' && getMemberOpenAmount(m) > 0 && m.status !== 'in_zahlung' && m.status !== 'ausgefuehrt');

        if (jbBtn) {
            jbBtn.innerHTML = `<i class="fas fa-file-invoice-dollar me-1 text-primary"></i> In Jahresbeitrag übertragen${jbOpen.length > 0 ? ` <span class="badge bg-primary ms-1">${jbOpen.length}</span>` : ''}`;
            jbBtn.disabled = jbOpen.length === 0;
            jbBtn.title = jbOpen.length > 0
                ? `${jbOpen.length} Schütze(n) direkt speichern & im Jahresbeitrag gutschreiben`
                : 'Zuerst einen Gruppengewinn (> Doppel) oder Einzelgewinn eintragen und «Verrechnung JB» wählen.';
        }
        if (poBtn) {
            poBtn.innerHTML = `<i class="fas fa-file-export me-1"></i> Bank-Überweisung (pain.001)${poOpen.length > 0 ? ` <span class="badge bg-primary ms-1">${poOpen.length}</span>` : ''}`;
            poBtn.disabled = poOpen.length === 0;
            poBtn.title = poOpen.length > 0
                ? `Für ${poOpen.length} Schütze(n) direkt speichern & Zahlungsauftrag (pain.001) erstellen`
                : 'Keine offenen Schützen mit Auszahlungsweg «Banküberweisung» und offenem Betrag > CHF 0.00.';
        }
    }

    function findMemberByPn(pn) {
        if (!pn || !_allMembersCache) return null;
        return _allMembersCache.find(m => String(m.person_number) === String(pn));
    }

    function findMemberByName(fullName) {
        if (!fullName || !_allMembersCache) return null;
        const clean = fullName.toLowerCase().replace(/[^a-z0-9]/g, '');
        return _allMembersCache.find(m => {
            const mFull1 = `${m.last_name}${m.first_name}`.toLowerCase().replace(/[^a-z0-9]/g, '');
            const mFull2 = `${m.first_name}${m.last_name}`.toLowerCase().replace(/[^a-z0-9]/g, '');
            return clean === mFull1 || clean === mFull2;
        });
    }

    /**
     * Fügt eine neue Schützenzeile hinzu.
     */
    function jmAddShooterRowToEditor() {
        if (!_jmCurrentEditingComp) return;
        _jmCurrentEditingComp.members = _jmCurrentEditingComp.members || [];
        const typ = _jmCurrentEditingComp.anlass_typ || 'gruppe';
        _jmCurrentEditingComp.members.push({
            person_number: null,
            schuetze_name: '',
            jahrgang: null,
            punkte: null,
            stich_name: typ === 'einzel' ? 'Auszahler' : '',
            anteil_gruppe: 0,
            anteil_einzel: 0,
            betrag: 0,
            payout_method: 'jahresbeitrag',
            iban: '',
            status: 'offen'
        });
        renderShooterRows(_jmCurrentEditingComp.members);
        jmRecalculateCurrentComp();
    }

    /**
     * Entfernt eine Schützenzeile.
     */
    function jmRemoveShooterRow(idx) {
        if (!_jmCurrentEditingComp || !_jmCurrentEditingComp.members) return;
        const target = _jmCurrentEditingComp.members[idx];
        if (target && (target.status === 'verrechnet' || target.status === 'in_zahlung' || target.status === 'ausgefuehrt')) {
            return;
        }
        _jmCurrentEditingComp.members.splice(idx, 1);
        renderShooterRows(_jmCurrentEditingComp.members);
        jmRecalculateCurrentComp();
        if (_jmCurrentEditingComp.anlass_name) {
            renderAdditionalShootersPills(_jmCurrentEditingComp.anlass_name);
        }
    }

    /**
     * Berechnet den Überschuss und den Betrag je Schütze live neu.
     */
    function jmRecalculateCurrentComp() {
        if (!_jmCurrentEditingComp) return;
        const typ = _jmCurrentEditingComp.anlass_typ || 'gruppe';
        const isGruppe = typ === 'gruppe';
        const isEinzel = typ === 'einzel';

        const doppel = parseFloat(document.getElementById('jme-doppel')?.value || (isEinzel ? 0 : 30)) || 0;
        const gewinn = parseFloat(document.getElementById('jme-gewinn')?.value || 0) || 0;
        const ueberschuss = isEinzel ? 0 : Math.max(0, gewinn - doppel);

        const badgeUeberschuss = document.getElementById('jme-ueberschuss-badge');
        const badgePerShooter = document.getElementById('jme-pershooter-badge');
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);

        const members = _jmCurrentEditingComp.members || [];
        const protectedMembers = members.filter(isMemberGroupProtected);
        const openGroupMembers = members.filter(m => !isMemberGroupProtected(m));
        const settledGruppeSum = protectedMembers.reduce((acc, m) => acc + Number(m.anteil_gruppe || 0), 0);
        const remainingUeberschuss = Math.max(0, ueberschuss - settledGruppeSum);

        let openPerShooter = 0;
        if (!isEinzel && openGroupMembers.length > 0 && remainingUeberschuss > 0) {
            // Rappen-Rundung (5 Rappen) für offene Gruppenmitglieder
            openPerShooter = Math.round((remainingUeberschuss / openGroupMembers.length) * 20) / 20;
        }

        // Anzeige-Badge oben: offener Anteil je Gruppenmitglied oder (falls Gruppe bereits komplett verteilt) der Gruppenanteil
        let displayPerShooter = openPerShooter;
        if (!isEinzel && displayPerShooter === 0 && ueberschuss > 0 && protectedMembers.length > 0) {
            const protectedWithGroup = protectedMembers.filter(m => Number(m.anteil_gruppe || 0) > 0);
            const groupCountForDisplay = protectedWithGroup.length > 0 ? protectedWithGroup.length : protectedMembers.length;
            const basisSum = settledGruppeSum > 0 ? settledGruppeSum : ueberschuss;
            displayPerShooter = groupCountForDisplay > 0 ? Math.round((basisSum / groupCountForDisplay) * 20) / 20 : 0;
        }

        let sumEinzel = 0;
        members.forEach(m => {
            sumEinzel += Number(m.anteil_einzel || 0);
        });
        _jmCurrentEditingComp.einzel_total = sumEinzel;

        if (isEinzel) {
            if (badgeUeberschuss) badgeUeberschuss.innerText = fmtCurr(sumEinzel);
        } else if (isGruppe) {
            if (badgeUeberschuss) badgeUeberschuss.innerText = fmtCurr(ueberschuss);
            if (badgePerShooter) badgePerShooter.innerText = fmtCurr(displayPerShooter);
        } else {
            // kombiniert
            if (badgeUeberschuss) badgeUeberschuss.innerText = `${fmtCurr(ueberschuss)} (+ ${fmtCurr(sumEinzel)})`;
            if (badgePerShooter) badgePerShooter.innerText = fmtCurr(displayPerShooter);
        }

        // Zeilen-Beträge aktualisieren
        const rows = document.querySelectorAll('#jme-shooters-body tr');
        rows.forEach((r, idx) => {
            const m = members[idx];
            if (!m) return;
            const isProtected = isMemberGroupProtected(m);
            const isFullyLocked = m.status === 'in_zahlung' || m.status === 'ausgefuehrt';

            if (!isProtected) {
                if (isGruppe) {
                    m.anteil_gruppe = openPerShooter;
                    m.anteil_einzel = 0;
                    m.betrag = openPerShooter;
                } else if (isEinzel) {
                    m.anteil_gruppe = 0;
                    m.betrag = Number(m.anteil_einzel || 0);
                } else {
                    m.anteil_gruppe = openPerShooter;
                    m.betrag = openPerShooter + Number(m.anteil_einzel || 0);
                }
            } else if (!isFullyLocked) {
                // Bereits verrechneter Gruppenanteil bleibt unverändert; Gesamtsumme führt Einzelgewinn mit nach
                m.betrag = (isEinzel ? 0 : Number(m.anteil_gruppe || 0)) + (isGruppe ? 0 : Number(m.anteil_einzel || 0));
            }

            const elGruppe = r.querySelector('.jme-shooter-gruppe');
            if (elGruppe) elGruppe.value = Number(m.anteil_gruppe || 0).toFixed(2);

            const elEinzel = r.querySelector('.jme-shooter-einzel');
            if (elEinzel && !r.dataset.editingEinzel) elEinzel.value = Number(m.anteil_einzel || 0).toFixed(2);

            const elTotal = r.querySelector('.jme-shooter-total');
            if (elTotal) elTotal.innerText = fmtCurr(m.betrag || 0);
        });

        updateTransferActionButtons();
    }

    function jmOnShooterNameChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        _jmCurrentEditingComp.members[idx].schuetze_name = val.trim();
        const mObj = findMemberByName(val.trim());
        if (mObj) {
            _jmCurrentEditingComp.members[idx].person_number = mObj.person_number;
            if (mObj.iban && !_jmCurrentEditingComp.members[idx].iban) {
                _jmCurrentEditingComp.members[idx].iban = mObj.iban;
            }
        } else {
            _jmCurrentEditingComp.members[idx].person_number = null;
        }
        renderShooterRows(_jmCurrentEditingComp.members);
        jmRecalculateCurrentComp();
    }

    function jmOnShooterPointsChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        _jmCurrentEditingComp.members[idx].punkte = val ? parseFloat(val) : null;
        const typ = _jmCurrentEditingComp.anlass_typ || 'gruppe';
        _jmCurrentEditingComp.punkte_total = computeGroupPointsTotal(_jmCurrentEditingComp.members, typ);
        const punkteInput = document.getElementById('jme-punkte');
        if (punkteInput) punkteInput.value = _jmCurrentEditingComp.punkte_total || '';
    }

    function syncProtectedShooterStatusAfterEinzelEdit(idx, m) {
        if (!m || m._initialStatus !== 'verrechnet') return;
        const curEinzel = Number(m.anteil_einzel || 0);
        const initEinzel = Number(m._initialEinzel || 0);
        const curStich = String(m.stich_name || '').trim();
        const initStich = String(m._initialStich || '').trim();
        const hasNewOrChangedEinzel = (Math.abs(curEinzel - initEinzel) > 0.001 && curEinzel > 0)
            || (curEinzel > 0 && initEinzel > 0 && curStich !== initStich);

        m.status = hasNewOrChangedEinzel ? 'offen' : 'verrechnet';

        const row = document.querySelector(`#jme-shooters-body tr[data-idx="${idx}"]`);
        if (row) {
            const badgeSlot = row.querySelector('.jme-status-badge-slot');
            if (badgeSlot) badgeSlot.innerHTML = buildShooterStatusBadgeHtml(m);
            const methodLocked = m.status === 'verrechnet';
            const elMethod = row.querySelector('.jme-shooter-method');
            const elIban = row.querySelector('.jme-shooter-iban');
            if (elMethod) elMethod.disabled = methodLocked;
            if (elIban) elIban.disabled = methodLocked;
        }
    }

    function jmOnShooterStichChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        const m = _jmCurrentEditingComp.members[idx];
        m.stich_name = val.trim();
        syncProtectedShooterStatusAfterEinzelEdit(idx, m);
        updateTransferActionButtons();
    }

    function jmOnShooterGruppeChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        const m = _jmCurrentEditingComp.members[idx];
        m.anteil_gruppe = parseFloat(val) || 0;
        m.betrag = (Number(m.anteil_gruppe) || 0) + (Number(m.anteil_einzel) || 0);
        const row = document.querySelector(`#jme-shooters-body tr[data-idx="${idx}"]`);
        if (row) {
            const elTotal = row.querySelector('.jme-shooter-total');
            const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
            if (elTotal) elTotal.innerText = fmtCurr(m.betrag);
        }
        updateTransferActionButtons();
    }

    function jmOnShooterEinzelChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        const m = _jmCurrentEditingComp.members[idx];
        const typ = _jmCurrentEditingComp.anlass_typ || 'gruppe';
        if (typ !== 'einzel' && Number(m.anteil_gruppe || 0) === 0 && Number(m.betrag || 0) > 0 && Number(m._initialEinzel || 0) === 0) {
            m.anteil_gruppe = Number(m.betrag);
        }
        m.anteil_einzel = parseFloat(val) || 0;
        m.betrag = (Number(m.anteil_gruppe) || 0) + (Number(m.anteil_einzel) || 0);
        syncProtectedShooterStatusAfterEinzelEdit(idx, m);

        const row = document.querySelector(`#jme-shooters-body tr[data-idx="${idx}"]`);
        if (row) {
            row.dataset.editingEinzel = '1';
            const elTotal = row.querySelector('.jme-shooter-total');
            const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
            if (elTotal) elTotal.innerText = fmtCurr(m.betrag);
            setTimeout(() => { delete row.dataset.editingEinzel; }, 300);
        }
        jmRecalculateCurrentComp();
    }

    function jmOnShooterAmountChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        _jmCurrentEditingComp.members[idx].betrag = parseFloat(val) || 0;
        _jmCurrentEditingComp.members[idx]._manualAmount = true;
        updateTransferActionButtons();
    }

    function jmOnShooterMethodChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        _jmCurrentEditingComp.members[idx].payout_method = val;
        updateTransferActionButtons();
    }

    function jmOnShooterIbanChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        _jmCurrentEditingComp.members[idx].iban = val.trim();
    }

    /**
     * Speichert den aktuellen Gruppengewinn und alle Schützen in Supabase.
     */
    async function jmSaveCurrentComp() {
        const btn = document.getElementById('jme-save-btn');
        if (window.UIButtonKit && btn) {
            await UIButtonKit.withLoading(btn, async () => {
                await _jmSaveCurrentCompInternal({ closeModal: true, silent: false });
            });
        } else {
            await _jmSaveCurrentCompInternal({ closeModal: true, silent: false });
        }
    }

    async function _jmSaveCurrentCompInternal(opts = {}) {
        const closeModal = opts.closeModal !== false;
        const silent = Boolean(opts.silent);
        const supa = getSupa();
        if (!supa) return false;

        const anlass = (document.getElementById('jme-anlass')?.value || document.getElementById('jme-anlass-select')?.value || '').trim();
        const typ = _jmCurrentEditingComp?.anlass_typ || 'gruppe';
        let gruppe = (document.getElementById('jme-gruppe')?.value || '').trim();
        if (typ === 'einzel' && !gruppe) {
            gruppe = 'Einzel';
        }

        if (!anlass || anlass === '__custom__' || (typ !== 'einzel' && !gruppe)) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'Pflichtfelder fehlen', message: 'Bitte wähle einen Anlass aus' + (typ !== 'einzel' ? ' und trage den Gruppennamen ein.' : '.'), type: 'warning' });
            } else {
                alert('Bitte Anlass eintragen.');
            }
            return false;
        }

        const rang = parseInt(document.getElementById('jme-rang')?.value, 10) || null;
        const punkte = parseFloat(document.getElementById('jme-punkte')?.value) || null;
        const doppel = typ === 'einzel' ? 0.00 : (parseFloat(document.getElementById('jme-doppel')?.value) || 30.00);
        const gewinn = typ === 'einzel' ? 0.00 : (parseFloat(document.getElementById('jme-gewinn')?.value) || 0.00);
        const members = _jmCurrentEditingComp?.members || [];
        for (const m of members) {
            if (!m.person_number) {
                const mObj = findMemberByName(m.schuetze_name);
                if (mObj) {
                    m.person_number = mObj.person_number;
                    if (!m.iban && mObj.iban) m.iban = mObj.iban;
                }
            }
        }

        // Duplikats-Prüfung: Prüfen, ob für dasselbe Schiessen und dieselbe Gruppe bereits ein Eintrag existiert
        const compIdCheck = _jmCurrentEditingComp?.id;
        const compYrCheck = _jmCurrentEditingComp?.jahr || getActiveYear();
        const existingDup = (window._jmGroupCompetitions || []).find(c => 
            String(c.id) !== String(compIdCheck) &&
            Number(c.jahr) === Number(compYrCheck) &&
            String(c.anlass_name || '').trim().toLowerCase() === anlass.toLowerCase() &&
            String(c.gruppe_name || '').trim().toLowerCase() === gruppe.toLowerCase() &&
            (c.anlass_typ || 'gruppe') === typ
        );

        if (existingDup) {
            let proceed = false;
            if (window.UIConfirmKit) {
                proceed = await UIConfirmKit.confirm({
                    title: 'Mögliches Duplikat erkannt',
                    message: `Für «${anlass}» (Saison ${compYrCheck}) existiert bereits ein Eintrag für «${gruppe}».<br><br>Möchtest du diesen Eintrag wirklich speichern?`,
                    type: 'warning',
                    confirmText: 'Ja, trotzdem speichern',
                    cancelText: 'Abbrechen'
                });
            } else {
                proceed = confirm(`Für «${anlass}» existiert bereits ein Eintrag für «${gruppe}». Trotzdem speichern?`);
            }
            if (!proceed) return false;
        }

        const mergedRanglisten = getMergedRanglistenForComp(_jmCurrentEditingComp);
        const effectiveGroupMembers = getEffectiveGroupMembers(members);
        const payloadComp = {
            jahr: _jmCurrentEditingComp?.jahr || getActiveYear(),
            anlass_name: anlass,
            gruppe_name: gruppe,
            anlass_typ: typ,
            rang: typ === 'einzel' ? null : rang,
            punkte_total: punkte,
            gruppendoppel: doppel,
            gruppengewinn: gewinn,
            anzahl_schuetzen: members.length,
            betrag_pro_schuetze: typ === 'einzel' ? 0 : (effectiveGroupMembers.length > 0 ? (Math.max(0, gewinn - doppel) / effectiveGroupMembers.length) : 0),
            einzel_total: Number(_jmCurrentEditingComp?.einzel_total || 0),
            status: 'offen',
            ranglisten_files: mergedRanglisten
        };

        try {
            let compId = _jmCurrentEditingComp?.id;
            if (compId) {
                // Update
                const { error: updErr } = await supa.from('group_competitions').update(payloadComp).eq('id', compId);
                if (updErr) throw updErr;
            } else {
                // Insert
                const { data: insData, error: insErr } = await supa.from('group_competitions').insert(payloadComp).select().single();
                if (insErr) throw insErr;
                compId = insData.id;
                _jmCurrentEditingComp.id = compId;
            }

            _jmCurrentEditingComp.anlass_name = anlass;
            _jmCurrentEditingComp.gruppe_name = gruppe;
            _jmCurrentEditingComp.anlass_typ = typ;
            _jmCurrentEditingComp.rang = rang;
            _jmCurrentEditingComp.punkte_total = punkte;
            _jmCurrentEditingComp.gruppendoppel = doppel;
            _jmCurrentEditingComp.gruppengewinn = gewinn;
            _jmCurrentEditingComp.einzel_total = payloadComp.einzel_total;

            // Schützen speichern / synchronisieren
            await supa.from('group_competition_members').delete().eq('competition_id', compId);

            if (members.length > 0) {
                const memberInserts = members.map(m => ({
                    competition_id: compId,
                    person_number: m.person_number ? parseInt(m.person_number, 10) : null,
                    schuetze_name: m.schuetze_name || 'Unbekannt',
                    jahrgang: m.jahrgang || null,
                    punkte: m.punkte || null,
                    anteil_gruppe: Number(m.anteil_gruppe || 0),
                    anteil_einzel: Number(m.anteil_einzel || 0),
                    stich_name: m.stich_name || null,
                    betrag: Number(m.betrag || 0),
                    payout_method: m.payout_method || 'jahresbeitrag',
                    iban: m.iban || null,
                    status: m.status || 'offen',
                    payment_order_id: m.payment_order_id || null,
                    contribution_position_id: m.contribution_position_id || null
                }));

                const { data: insertedMembers, error: memErr } = await supa
                    .from('group_competition_members')
                    .insert(memberInserts)
                    .select();
                if (memErr) throw memErr;

                if (Array.isArray(insertedMembers) && insertedMembers.length > 0) {
                    insertedMembers.forEach(im => {
                        im._initialStatus = im.status || 'offen';
                        im._initialEinzel = Number(im.anteil_einzel || 0);
                        im._initialStich = String(im.stich_name || '').trim();
                    });
                    _jmCurrentEditingComp.members = insertedMembers;
                }

                // Allfällige neue IBANs im Mitgliederstamm speichern
                const rows = document.querySelectorAll('#jme-shooters-body tr');
                for (let i = 0; i < rows.length; i++) {
                    const saveCheck = rows[i].querySelector('.jme-save-iban-check');
                    if (saveCheck && saveCheck.checked && members[i] && members[i].person_number && members[i].iban) {
                        try {
                            await supa.from('members').update({ iban: members[i].iban }).eq('person_number', parseInt(members[i].person_number, 10));
                            console.log(`[Schützengewinne] IBAN für Mitglied ${members[i].person_number} im Profil gespeichert.`);
                        } catch (ibErr) {
                            console.warn("Konnte IBAN nicht im Mitgliederstamm sichern:", ibErr);
                        }
                    }
                }
            }

            if (closeModal) {
                const modalEl = document.getElementById('jmGruppengewinnEditModal');
                if (modalEl) {
                    const bsModal = bootstrap.Modal.getInstance(modalEl);
                    if (bsModal) bsModal.hide();
                }
            }

            await jmRenderGruppengewinneList(getActiveYear());

            if (!silent && typeof showSuccess === 'function') {
                const typMsg = typ === 'einzel'
                    ? `Einzelgewinne für ${anlass} erfolgreich gespeichert!`
                    : (typ === 'kombiniert'
                        ? `Kombinierte Gewinne für ${gruppe} (${anlass}) erfolgreich gespeichert!`
                        : `Gruppengewinn für ${gruppe} (${anlass}) erfolgreich gespeichert!`);
                showSuccess(typMsg);
            }
            return true;
        } catch (err) {
            console.error("[Schützengewinne] Speicherfehler:", err);
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'Speicherfehler', message: err.message, type: 'danger' });
            } else {
                alert('Fehler beim Speichern: ' + err.message);
            }
            return false;
        }
    }

    // ==========================================================================
    // SCHNITTSTELLE 1: VERRECHNUNG JAHRESBEITRAG (Konto 1301)
    // ==========================================================================

    /**
     * Interner Helfer: Überträgt offene Schützen-Anteile (Gruppe & Einzel) als Gutschrift (Konto 1301) in den Jahresbeitrag.
     */
    async function _transferCompMembersToJahresbeitragInternal(comp, yr) {
        const supa = getSupa();
        if (!supa || !comp) return { successCount: 0, failedShooters: [], lockedInvoiceShooters: [] };

        await ensureMembersLoaded();

        const typ = comp.anlass_typ || 'gruppe';
        const doppel = Number(comp.gruppendoppel || 30);
        const gewinn = Number(comp.gruppengewinn || 0);
        const ueberschuss = typ === 'einzel' ? 0 : Math.max(0, gewinn - doppel);
        const allMembers = Array.isArray(comp.members) ? comp.members : [];
        const count = allMembers.length > 0 ? allMembers.length : Number(comp.anzahl_schuetzen || 5);
        const defaultShare = (count > 0 && ueberschuss > 0) ? (Math.round((ueberschuss / count) * 20) / 20) : 0;

        let successCount = 0;
        const failedShooters = [];
        const lockedInvoiceShooters = [];

        for (const m of allMembers) {
            const grpAmtRaw = Number(m.anteil_gruppe ?? (typ !== 'einzel' ? (m.betrag ?? defaultShare) : 0));
            const anzEinzelRaw = Number(m.anteil_einzel ?? (typ === 'einzel' ? m.betrag : 0));
            const shareAmt = Number(m.betrag ?? ((grpAmtRaw + anzEinzelRaw) || defaultShare) ?? 0);
            if ((m.payout_method || 'jahresbeitrag') !== 'jahresbeitrag' || shareAmt <= 0) continue;
            if (m.status === 'ausgefuehrt' || m.status === 'in_zahlung') continue;

            let pn = m.person_number;
            if (!pn) {
                const found = findMemberByName(m.schuetze_name);
                if (found) {
                    pn = found.person_number;
                    m.person_number = pn;
                    if (m.id) {
                        await supa.from('group_competition_members').update({ person_number: pn }).eq('id', m.id);
                    }
                }
            }

            if (!pn) {
                console.warn(`[Schützengewinne] Schütze ${m.schuetze_name} hat keine Personennummer und wird übersprungen.`);
                failedShooters.push(m.schuetze_name);
                continue;
            }

            const pnStr = String(pn);
            const headId = `CH-${yr}-${pnStr}`;

            // Teil-Gutschriften bestimmen: Gruppenanteil und/oder Einzelanteil
            const positionsToCreate = [];
            const grpAmt = typ === 'einzel' ? 0 : (m.anteil_gruppe !== undefined && m.anteil_gruppe !== null ? Number(m.anteil_gruppe || 0) : shareAmt);
            const anzEinzel = typ === 'gruppe' ? 0 : Number(m.anteil_einzel || (typ === 'einzel' ? shareAmt : 0));

            if (typ === 'kombiniert') {
                if (grpAmt > 0) {
                    positionsToCreate.push({
                        desc: `Gutschrift Gruppengewinn: ${comp.gruppe_name} (${comp.anlass_name})`,
                        amt: -Math.abs(grpAmt)
                    });
                }
                if (anzEinzel > 0) {
                    const stichSuffix = m.stich_name ? ` (${m.stich_name})` : '';
                    positionsToCreate.push({
                        desc: `Gutschrift Einzelgewinn${stichSuffix}: ${comp.anlass_name}`,
                        amt: -Math.abs(anzEinzel)
                    });
                }
            } else if (typ === 'einzel') {
                const stichSuffix = m.stich_name ? ` (${m.stich_name})` : '';
                positionsToCreate.push({
                    desc: `Gutschrift Einzelgewinn${stichSuffix}: ${comp.anlass_name}`,
                    amt: -Math.abs(anzEinzel || shareAmt)
                });
            } else {
                // Gruppe
                positionsToCreate.push({
                    desc: `Gutschrift Gruppengewinn: ${comp.gruppe_name} (${comp.anlass_name})`,
                    amt: -Math.abs(grpAmt || shareAmt)
                });
            }

            if (positionsToCreate.length === 0) continue;

            // Falls bereits als verrechnet markiert, prüfen ob alle Teilpositionen in contributions_positions sauber vorhanden sind
            if (m.status === 'verrechnet' && m.contribution_position_id) {
                const { data: ex1301Pos } = await supa
                    .from('contributions_positions')
                    .select('id, beschreibung, betrag, konto')
                    .eq('header_id', headId)
                    .eq('konto', '1301');

                const allPresentAndMatching = positionsToCreate.every(posDef =>
                    (ex1301Pos || []).some(ep => ep.beschreibung === posDef.desc && Math.abs(Number(ep.betrag) - Number(posDef.amt)) < 0.005)
                );
                if (allPresentAndMatching) {
                    continue; // Bereits vollständig und betragsgenau vorhanden
                }
            }

            try {
                // Prüfen ob Header existiert
                let { data: head } = await supa.from('contributions_header').select('*').eq('id', headId).maybeSingle();
                if (!head) {
                    const { data: newHead, error: nhErr } = await supa.from('contributions_header').insert({
                        id: headId,
                        person_number: pnStr,
                        year: yr,
                        status: 'offen',
                        gesamt: 0.00
                    }).select().single();
                    if (nhErr) throw nhErr;
                    head = newHead;
                }

                // Lebenszyklus-Sperre: Versendete oder bezahlte Rechnungen niemals nachträglich mutieren
                let draftInv = null;
                if (head && head.invoice_id) {
                    const { data: inv } = await supa
                        .from('invoices')
                        .select('id, invoice_number, mail_status, status, total_paid')
                        .eq('id', head.invoice_id)
                        .maybeSingle();
                    if (inv) {
                        if (inv.mail_status === 'versendet' || inv.status === 'bezahlt' || Number(inv.total_paid || 0) > 0) {
                            lockedInvoiceShooters.push(`${m.schuetze_name} (Rechnung ${inv.invoice_number || ''} bereits ${Number(inv.total_paid || 0) > 0 || inv.status === 'bezahlt' ? 'bezahlt' : 'versendet'})`);
                            continue;
                        }
                        draftInv = inv;
                    }
                }

                let lastPosId = null;

                for (const posDef of positionsToCreate) {
                    // Prüfen ob identische Gutschrift bereits für diesen Header existiert (Duplikatsschutz)
                    const { data: existingSame } = await supa
                        .from('contributions_positions')
                        .select('id, position_nr, betrag')
                        .eq('header_id', headId)
                        .eq('konto', '1301')
                        .eq('beschreibung', posDef.desc)
                        .maybeSingle();

                    let posId = existingSame?.id || null;
                    let nextPosNr = existingSame?.position_nr || 1;

                    if (!posId) {
                        const { data: posList } = await supa
                            .from('contributions_positions')
                            .select('position_nr')
                            .eq('header_id', headId)
                            .order('position_nr', { ascending: false })
                            .limit(1);
                        nextPosNr = (posList && posList.length > 0) ? (posList[0].position_nr + 1) : 1;
                        posId = `${headId}-${nextPosNr}`;

                        const { error: insPosErr } = await supa.from('contributions_positions').insert({
                            id: posId,
                            header_id: headId,
                            person_number: pnStr,
                            year: yr,
                            position_nr: nextPosNr,
                            beschreibung: posDef.desc,
                            betrag: posDef.amt,
                            typ: 'Credit',
                            source_field: '1301',
                            konto: '1301'
                        });
                        if (insPosErr) throw insPosErr;

                        if (draftInv) {
                            await supa.from('invoice_positions').insert({
                                invoice_id: draftInv.id,
                                position_nr: nextPosNr,
                                description: posDef.desc,
                                quantity: 1,
                                unit_price: posDef.amt,
                                amount: posDef.amt,
                                konto: '1301'
                            });
                        }
                    } else if (Math.abs(Number(existingSame.betrag) - Number(posDef.amt)) > 0.005) {
                        const { error: updPosErr } = await supa
                            .from('contributions_positions')
                            .update({ betrag: posDef.amt, last_upd: new Date().toISOString() })
                            .eq('id', posId);
                        if (updPosErr) throw updPosErr;

                        if (draftInv) {
                            await supa
                                .from('invoice_positions')
                                .update({ unit_price: posDef.amt, amount: posDef.amt })
                                .eq('invoice_id', draftInv.id)
                                .eq('description', posDef.desc);
                        }
                    }

                    lastPosId = posId;
                }

                // Header Gesamtbetrag neu berechnen
                const { data: allPos } = await supa.from('contributions_positions').select('betrag').eq('header_id', headId);
                const newGesamt = (allPos || []).reduce((acc, p) => acc + Number(p.betrag || 0), 0);
                await supa.from('contributions_header').update({ gesamt: Math.max(0, newGesamt) }).eq('id', headId);

                if (draftInv) {
                    await supa.from('invoices').update({
                        total_amount: Math.max(0, newGesamt),
                        open_amount: Math.max(0, newGesamt),
                        pdf_url: null,
                        pdf_storage_path: null,
                        updated_at: new Date().toISOString()
                    }).eq('id', draftInv.id);

                    if (window.RechnungsCore && typeof window.RechnungsCore.renderPdf === 'function') {
                        window.RechnungsCore.renderPdf(draftInv.id, { forceRecreate: true }).catch(err => {
                            console.warn('[Schützengewinne] Hintergrund-PDF-Neugenerierung fehlgeschlagen:', err);
                        });
                    }
                }

                // Status in group_competition_members auf verrechnet setzen
                if (m.id) {
                    await supa.from('group_competition_members').update({
                        betrag: shareAmt,
                        status: 'verrechnet',
                        contribution_position_id: lastPosId
                    }).eq('id', m.id);
                }
                m.betrag = shareAmt;
                m.status = 'verrechnet';
                m.contribution_position_id = lastPosId;
                m._initialStatus = 'verrechnet';
                m._initialEinzel = Number(m.anteil_einzel || 0);
                m._initialStich = String(m.stich_name || '').trim();
                successCount++;
            } catch (pErr) {
                console.error(`Fehler bei Übertragung für Schütze ${m.schuetze_name}:`, pErr);
            }
        }

        return { successCount, failedShooters, lockedInvoiceShooters };
    }

    /**
     * Überträgt die offenen Beträge der aktuellen Gruppe (im Editor) als Gutschrift in den Jahresbeitrag.
     */
    async function jmTransferCurrentCompToJahresbeitrag() {
        const btn = document.getElementById('jme-transfer-jb-btn');
        const runTransfer = async () => {
            if (!_jmCurrentEditingComp) return;

            const saved = await _jmSaveCurrentCompInternal({ closeModal: false, silent: true });
            if (!saved || !_jmCurrentEditingComp.id) return;

            const members = (_jmCurrentEditingComp.members || []).filter(m => (m.payout_method || 'jahresbeitrag') === 'jahresbeitrag' && getMemberOpenAmount(m) > 0 && m.status !== 'verrechnet');
            if (members.length === 0) {
                if (window.UIConfirmKit) {
                    await UIConfirmKit.alert({ title: 'Keine offenen Positionen', message: 'Es gibt keine Schützen mit Methode «Verrechnung Jahresbeitrag» und offenem Betrag.', type: 'info' });
                }
                return;
            }

            const openSum = members.reduce((a, b) => a + getMemberOpenAmount(b), 0);
            let confirmed = false;
            if (window.UIConfirmKit) {
                confirmed = await UIConfirmKit.confirm({
                    title: 'In Jahresbeitrag verrechnen?',
                    message: `Möchtest du für ${members.length} Schütze(n) die offene Gutschrift (total CHF ${openSum.toFixed(2)}) direkt als Abzug im Jahresbeitrag ${getActiveYear()} verbuchen?`,
                    type: 'primary',
                    confirmText: 'Ja, übertragen',
                    cancelText: 'Abbrechen'
                });
            } else {
                confirmed = confirm(`Gutschrift für ${members.length} Schützen in Jahresbeitrag übertragen?`);
            }

            if (!confirmed) return;

            const yr = getActiveYear();
            const { successCount, failedShooters, lockedInvoiceShooters } = await _transferCompMembersToJahresbeitragInternal(_jmCurrentEditingComp, yr);

            if (failedShooters.length > 0 && window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Schützen ohne Mitgliedsnummer',
                    message: `Folgende Schützen konnten nicht im Mitgliederstamm gefunden werden und wurden nicht übertragen: ${failedShooters.join(', ')}. Bitte verknüpfe sie im Editor.`,
                    type: 'warning'
                });
            }
            if (lockedInvoiceShooters.length > 0 && window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Rechnung bereits versendet / bezahlt',
                    message: `Für folgende Schützen ist die Jahresbeitragsrechnung bereits versendet oder bezahlt, weshalb der Betrag dort nicht mehr automatisch gutgeschrieben werden darf:<br><br>• ${lockedInvoiceShooters.map(escapeHtml).join('<br>• ')}<br><br>Bitte stelle den Auszahlungsweg für den offenen Anteil z. B. auf <strong>Bank (pain.001)</strong> oder <strong>Bar (Kasse 1000)</strong> um.`,
                    type: 'warning'
                });
            }

            renderShooterRows(_jmCurrentEditingComp.members);
            await jmRenderGruppengewinneList(yr);
            await populateCompetitionOptions(_jmCurrentEditingComp.anlass_name);
            if (successCount > 0 && typeof showSuccess === 'function') {
                showSuccess(`🎉 ${successCount} Schütze(n) erfolgreich im Jahresbeitrag ${yr} gutgeschrieben!`);
            }
        };

        if (window.UIButtonKit && btn) {
            await UIButtonKit.withLoading(btn, runTransfer);
        } else {
            await runTransfer();
        }
    }

    /**
     * 1-Klick-Übertrag eines einzelnen Schiessens direkt aus der Haupttabelle in den Jahresbeitrag.
     */
    async function jmTransferSingleCompToJahresbeitrag(compId) {
        const comp = (window._jmGroupCompetitions || []).find(c => String(c.id) === String(compId));
        if (!comp) return;

        const btn = document.getElementById(`jm-gg-row-jb-btn-${compId}`);
        const run = async () => {
            const yr = comp.jahr || getActiveYear();
            const isEinzelOnly = (comp.anlass_typ || 'gruppe') === 'einzel';
            const doppel = isEinzelOnly ? 0 : Number(comp.gruppendoppel || 30);
            const gewinn = isEinzelOnly ? 0 : Number(comp.gruppengewinn || 0);
            const ueb = Math.max(0, gewinn - doppel);
            const members = Array.isArray(comp.members) ? comp.members : [];
            const groupMembers = getEffectiveGroupMembers(members);
            const count = groupMembers.length > 0 ? groupMembers.length : 5;
            const perShooter = (!isEinzelOnly && count > 0) ? (Math.round((ueb / count) * 20) / 20) : 0;

            const getOpenAmt = (m) => getMemberSplitAmounts(m, comp, isEinzelOnly ? 0 : perShooter).openForTransferAmt;

            const openMembers = members.filter(m => (m.payout_method || 'jahresbeitrag') === 'jahresbeitrag' && getOpenAmt(m) > 0);
            if (openMembers.length === 0) return;

            const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
            const totalSum = openMembers.reduce((acc, m) => acc + getOpenAmt(m), 0);
            const avgHint = (!isEinzelOnly && comp.anlass_typ !== 'kombiniert' && perShooter > 0) ? `je ${fmtCurr(perShooter)}, ` : '';

            const confirmed = window.UIConfirmKit
                ? await UIConfirmKit.confirm({
                    title: 'In Jahresbeitrag übertragen?',
                    message: `Möchtest du für <strong>${escapeHtml(comp.anlass_name)}</strong> (${escapeHtml(comp.gruppe_name || 'Einzel')}) die offenen Gewinnanteile von <strong>${openMembers.length} Schützen</strong> (${avgHint}Total <strong>${fmtCurr(totalSum)}</strong>) direkt als Gutschrift in den Jahresbeitrag ${yr} übertragen?`,
                    type: 'primary',
                    confirmText: 'Ja, in Jahresbeitrag übertragen',
                    cancelText: 'Abbrechen'
                })
                : confirm(`${openMembers.length} Schützen (${fmtCurr(totalSum)}) in Jahresbeitrag ${yr} übertragen?`);

            if (!confirmed) return;

            const { successCount, failedShooters, lockedInvoiceShooters } = await _transferCompMembersToJahresbeitragInternal(comp, yr);
            if (failedShooters.length > 0 && window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Hinweis zu fehlenden Mitgliedernummern',
                    message: `Folgende Schützen konnten nicht verknüpft werden: ${failedShooters.join(', ')}`,
                    type: 'warning'
                });
            }
            if (lockedInvoiceShooters.length > 0 && window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Rechnung bereits versendet / bezahlt',
                    message: `Für folgende Schützen ist die Jahresbeitragsrechnung bereits versendet oder bezahlt:<br><br>• ${lockedInvoiceShooters.map(escapeHtml).join('<br>• ')}`,
                    type: 'warning'
                });
            }

            await jmRenderGruppengewinneList(yr);
            if (successCount > 0 && typeof showSuccess === 'function') {
                showSuccess(`🎉 ${successCount} Gewinnanteil(e) für «${comp.anlass_name}» im Jahresbeitrag ${yr} gutgeschrieben!`);
            }
        };

        if (window.UIButtonKit && btn) {
            await UIButtonKit.withLoading(btn, run);
        } else {
            await run();
        }
    }

    /**
     * Sammel-Übertrag: Überträgt ALLE noch offenen Gruppengewinne des Jahres mit 1 Klick in den Jahresbeitrag!
     */
    async function jmTransferAllOpenToJahresbeitrag() {
        const btn = document.getElementById('jm-gg-bulk-transfer-jb-btn');
        const runBulk = async () => {
            const yr = getActiveYear();
            const list = (window._jmGroupCompetitions && window._jmGroupCompetitions.length > 0)
                ? window._jmGroupCompetitions
                : await jmLoadGroupCompetitions(yr);

            const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);

            const openComps = [];
            let totalShooters = 0;
            let totalAmount = 0;

            (list || []).forEach(c => {
                const isEinzelOnly = (c.anlass_typ || 'gruppe') === 'einzel';
                const doppel = isEinzelOnly ? 0 : Number(c.gruppendoppel || 30);
                const gewinn = isEinzelOnly ? 0 : Number(c.gruppengewinn || 0);
                const grpUeb = isEinzelOnly ? 0 : Math.max(0, gewinn - doppel);
                const ueb = grpUeb + Number(c.einzel_total || 0);
                if (ueb <= 0) return;

                const members = Array.isArray(c.members) ? c.members : [];
                const groupMembers = getEffectiveGroupMembers(members);
                const count = groupMembers.length > 0 ? groupMembers.length : 5;
                const perShooter = (!isEinzelOnly && count > 0) ? (Math.round((grpUeb / count) * 20) / 20) : 0;

                const getOpenAmt = (m) => getMemberSplitAmounts(m, c, isEinzelOnly ? 0 : perShooter).openForTransferAmt;

                const openMems = members.filter(m => (m.payout_method || 'jahresbeitrag') === 'jahresbeitrag' && getOpenAmt(m) > 0);
                if (openMems.length > 0) {
                    const compSum = openMems.reduce((acc, m) => acc + getOpenAmt(m), 0);
                    openComps.push({ comp: c, count: openMems.length, sum: compSum });
                    totalShooters += openMems.length;
                    totalAmount += compSum;
                }
            });

            if (openComps.length === 0) {
                if (window.UIConfirmKit) {
                    await UIConfirmKit.alert({
                        title: 'Alles bereits übertragen',
                        message: `Alle Schützengewinne mit Überschuss der Saison ${yr} sind bereits im Jahresbeitrag gutgeschrieben.`,
                        type: 'info'
                    });
                }
                return;
            }

            const detailsHtml = openComps.map(oc =>
                `<li><strong>${escapeHtml(oc.comp.anlass_name)}</strong> (${escapeHtml(oc.comp.gruppe_name || 'Einzel')}): ${oc.count} Schützen · <strong>${fmtCurr(oc.sum)}</strong></li>`
            ).join('');

            const confirmed = window.UIConfirmKit
                ? await UIConfirmKit.confirm({
                    title: 'Alle offenen Schützengewinne in Jahresbeitrag übertragen?',
                    message: `Möchtest du die folgenden <strong>${openComps.length} offenen Schiessen</strong> (${totalShooters} Gutschriftspositionen, Gesamtsumme <strong>${fmtCurr(totalAmount)}</strong>) jetzt gesammelt in den Jahresbeitrag ${yr} (Konto 1301) übertragen?<ul class="mt-2 mb-0 ps-3 small">${detailsHtml}</ul>`,
                    type: 'primary',
                    confirmText: `Ja, alle übertragen (${fmtCurr(totalAmount)})`,
                    cancelText: 'Abbrechen'
                })
                : confirm(`Alle ${openComps.length} offenen Schiessen (${fmtCurr(totalAmount)}) in den Jahresbeitrag ${yr} übertragen?`);

            if (!confirmed) return;

            let totalTransferred = 0;
            const allFailed = new Set();
            const allLocked = new Set();

            // Alle Wettkämpfe (inkl. Self-Healing für bereits verrechnete) durchgehen
            for (const c of (list || [])) {
                const { successCount, failedShooters, lockedInvoiceShooters } = await _transferCompMembersToJahresbeitragInternal(c, yr);
                totalTransferred += successCount;
                failedShooters.forEach(fn => allFailed.add(fn));
                (lockedInvoiceShooters || []).forEach(ln => allLocked.add(ln));
            }

            if (allFailed.size > 0 && window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Schützen ohne Mitgliedsnummer',
                    message: `Folgende Schützen konnten nicht automatisch im Mitgliederstamm zugeordnet werden: ${Array.from(allFailed).join(', ')}`,
                    type: 'warning'
                });
            }
            if (allLocked.size > 0 && window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Rechnung bereits versendet / bezahlt',
                    message: `Für folgende Schützen ist die Jahresbeitragsrechnung bereits versendet oder bezahlt:<br><br>• ${Array.from(allLocked).map(escapeHtml).join('<br>• ')}`,
                    type: 'warning'
                });
            }

            await jmRenderGruppengewinneList(yr);
            if (totalTransferred > 0 && typeof showSuccess === 'function') {
                showSuccess(`🎉 ${totalTransferred} Gutschriftsposition(en) aus ${openComps.length} Schiessen erfolgreich im Jahresbeitrag ${yr} verbucht!`);
            }
        };

        if (window.UIButtonKit && btn) {
            await UIButtonKit.withLoading(btn, runBulk);
        } else {
            await runBulk();
        }
    }

    // ==========================================================================
    // SCHNITTSTELLE 2: BANK-ÜBERWEISUNG (ISO 20022 pain.001 via Konto 1301)
    // ==========================================================================

    /**
     * Erstellt Zahlungsaufträge für Schützen mit Banküberweisung.
     * Speichert den Gruppengewinn automatisch vorab, falls noch ungespeichert.
     */
    async function jmTransferCurrentCompToPaymentOrder() {
        const btn = document.getElementById('jme-transfer-po-btn');
        const runTransfer = async () => {
            if (!_jmCurrentEditingComp) return;

            // Automatisch vorab in Supabase sichern
            const saved = await _jmSaveCurrentCompInternal({ closeModal: false, silent: true });
            if (!saved || !_jmCurrentEditingComp.id) return;

            const members = (_jmCurrentEditingComp.members || []).filter(m => m.payout_method === 'bank' && getMemberOpenAmount(m) > 0 && m.status !== 'in_zahlung' && m.status !== 'ausgefuehrt');
            if (members.length === 0) {
                if (window.UIConfirmKit) {
                    await UIConfirmKit.alert({ title: 'Keine Positionen für Banküberweisung', message: 'Es gibt keine Schützen mit Methode «Banküberweisung» und offenem Betrag.', type: 'info' });
                }
                return;
            }

            // Prüfen, ob alle eine gültige IBAN haben
            const missingIban = members.filter(m => !m.iban || m.iban.trim().length < 15);
            if (missingIban.length > 0) {
                const names = missingIban.map(m => m.schuetze_name).join(', ');
                if (window.UIConfirmKit) {
                    await UIConfirmKit.alert({
                        title: 'IBAN fehlt',
                        message: `Folgende Schützen haben keine gültige IBAN hinterlegt: ${names}. Bitte trage die IBAN ein oder stelle auf «Verrechnung Jahresbeitrag» um.`,
                        type: 'warning'
                    });
                } else {
                    alert(`IBAN fehlt für: ${names}`);
                }
                return;
            }

            const totalBankSum = members.reduce((a, b) => a + getMemberOpenAmount(b), 0);
            let confirmed = false;
            if (window.UIConfirmKit) {
                confirmed = await UIConfirmKit.confirm({
                    title: 'Zahlungsaufträge erstellen?',
                    message: `Möchtest du für ${members.length} Schütze(n) Zahlungsaufträge (Konto 1301 an Bank 1020) im Gesamtbetrag von CHF ${totalBankSum.toFixed(2)} erstellen? Diese können anschliessend im Menü Finanzbuchhaltung als ISO 20022 pain.001 XML heruntergeladen werden.`,
                    type: 'primary',
                    confirmText: 'Ja, Zahlungsaufträge anlegen',
                    cancelText: 'Abbrechen'
                });
            } else {
                confirmed = confirm(`Zahlungsaufträge für ${members.length} Schützen anlegen?`);
            }

            if (!confirmed) return;

            const supa = getSupa();
            if (!supa) return;

            const yr = getActiveYear();
            const todayStr = new Date().toISOString().split('T')[0];
            let createdCount = 0;

            for (const m of members) {
                try {
                    const groupAlreadyInJb = Boolean(m.contribution_position_id) && Number(m.anteil_gruppe || 0) > 0;
                    const openBankAmt = getMemberOpenAmount(m);

                    // Nächste Auftrags-Nr ZA-YYYY-xxx ermitteln
                    let nextNr = `ZA-${yr}-001`;
                    const { data: poRows } = await supa.from('accounting_payment_orders').select('order_nr').ilike('order_nr', `ZA-${yr}-%`).order('created_at', { ascending: false }).limit(1);
                    if (poRows && poRows.length > 0) {
                        const match = poRows[0].order_nr.match(/(\d+)$/);
                        if (match) {
                            const cur = parseInt(match[1], 10);
                            nextNr = `ZA-${yr}-${String(cur + 1).padStart(3, '0')}`;
                        }
                    }

                    const positions = [];
                    if (!groupAlreadyInJb && Number(m.anteil_gruppe || 0) > 0) {
                        positions.push({
                            text: `Anteil Gruppengewinn ${_jmCurrentEditingComp.gruppe_name} (${_jmCurrentEditingComp.anlass_name})`,
                            betrag: Number(m.anteil_gruppe),
                            konto_soll: '1301'
                        });
                    }
                    if (Number(m.anteil_einzel || 0) > 0) {
                        const stichSuffix = m.stich_name ? ` (${m.stich_name})` : '';
                        positions.push({
                            text: `Einzelgewinn${stichSuffix} (${_jmCurrentEditingComp.anlass_name})`,
                            betrag: Number(m.anteil_einzel),
                            konto_soll: '1301'
                        });
                    }
                    if (positions.length === 0) {
                        positions.push({
                            text: `Schützengewinn ${_jmCurrentEditingComp.anlass_name}`,
                            betrag: openBankAmt,
                            konto_soll: '1301'
                        });
                    }

                    const poDesc = (_jmCurrentEditingComp.anlass_typ === 'einzel' || groupAlreadyInJb)
                        ? `Einzelgewinn ${m.stich_name || ''} (${_jmCurrentEditingComp.anlass_name})`
                        : `Schützengewinn ${_jmCurrentEditingComp.gruppe_name} (${_jmCurrentEditingComp.anlass_name})`;

                    const orderPayload = {
                        order_nr: nextNr,
                        jahr: yr,
                        datum: todayStr,
                        execution_date: todayStr,
                        member_pn: m.person_number ? String(m.person_number) : null,
                        recipient_name: m.schuetze_name,
                        recipient_iban: m.iban.replace(/\s+/g, ''),
                        betrag: openBankAmt,
                        konto_soll: '1301',
                        konto_haben: '1020',
                        beschreibung: poDesc,
                        positions: positions,
                        status: 'pendent'
                    };

                    const { data: insPo, error: insPoErr } = await supa.from('accounting_payment_orders').insert(orderPayload).select().single();
                    if (insPoErr) throw insPoErr;

                    // Status in group_competition_members aktualisieren
                    if (m.id) {
                        await supa.from('group_competition_members').update({
                            status: 'in_zahlung',
                            payment_order_id: insPo.id
                        }).eq('id', m.id);
                    }
                    m.status = 'in_zahlung';
                    m.payment_order_id = insPo.id;
                    createdCount++;
                } catch (err) {
                    console.error(`Fehler beim Erstellen des Zahlungsauftrags für ${m.schuetze_name}:`, err);
                }
            }

            renderShooterRows(_jmCurrentEditingComp.members);
            await jmRenderGruppengewinneList(yr);
            await populateCompetitionOptions(_jmCurrentEditingComp.anlass_name);
            if (typeof showSuccess === 'function') {
                showSuccess(`🎉 ${createdCount} Zahlungsauftrag/-aufträge für Banküberweisung angelegt!`);
            }
        };

        if (window.UIButtonKit && btn) {
            await UIButtonKit.withLoading(btn, runTransfer);
        } else {
            await runTransfer();
        }
    }

    // ==========================================================================
    // PDF-EXPORT: ABRECHNUNGS- & QUITTUNGSBELEG (DIN-A4 Druckbeleg)
    // ==========================================================================

    /**
     * Erzeugt ein professionelles Abrechnungs-PDF via jsPDF.
     */
    async function jmGenerateGruppengewinnPdf(compId) {
        let comp = window._jmGroupCompetitions.find(c => String(c.id) === String(compId));
        if (!comp) {
            await jmLoadGroupCompetitions(getActiveYear());
            comp = window._jmGroupCompetitions.find(c => String(c.id) === String(compId));
        }
        if (!comp) {
            if (window.UIConfirmKit) await UIConfirmKit.alert({ title: 'Nicht gefunden', message: 'Wettkampfdaten nicht gefunden.', type: 'danger' });
            return;
        }

        await _generatePdfFromCompData(comp);
    }

    async function jmGenerateGruppengewinnPdfFromEditor() {
        if (!_jmCurrentEditingComp) return;
        const anlass = document.getElementById('jme-anlass')?.value || _jmCurrentEditingComp.anlass_name;
        const gruppe = document.getElementById('jme-gruppe')?.value || _jmCurrentEditingComp.gruppe_name;
        const doppel = parseFloat(document.getElementById('jme-doppel')?.value) || 30.00;
        const gewinn = parseFloat(document.getElementById('jme-gewinn')?.value) || 0.00;

        const tempComp = {
            ..._jmCurrentEditingComp,
            anlass_name: anlass,
            gruppe_name: gruppe,
            gruppendoppel: doppel,
            gruppengewinn: gewinn
        };

        await _generatePdfFromCompData(tempComp);
    }

    async function _generatePdfFromCompData(comp) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'PDF-Fehler', message: 'Die jsPDF-Bibliothek ist noch nicht geladen. Bitte lade die Seite neu.', type: 'danger' });
            }
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

        if (typeof doc.autoTable !== 'function') {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'PDF-Fehler', message: 'jspdf-autotable ist nicht geladen.', type: 'danger' });
            }
            return;
        }

        const typ = comp.anlass_typ || 'gruppe';
        const isGruppe = typ === 'gruppe';
        const isEinzel = typ === 'einzel';
        const isKombiniert = typ === 'kombiniert';

        const doppel = isEinzel ? 0 : Number(comp.gruppendoppel || 30);
        const gewinn = isEinzel ? 0 : Number(comp.gruppengewinn || 0);
        const ueberschuss = isEinzel ? 0 : Math.max(0, gewinn - doppel);
        const einzelTotal = Number(comp.einzel_total || 0);
        const members = Array.isArray(comp.members) ? comp.members : [];
        const groupMembers = getEffectiveGroupMembers(members);
        const count = groupMembers.length > 0 ? groupMembers.length : 5;
        const perShooter = (!isEinzel && count > 0) ? (ueberschuss / count) : 0;

        const todayStr = (window.UIFormatKit && UIFormatKit.formatDate) ? UIFormatKit.formatDate(new Date().toISOString().split('T')[0]) : new Date().toLocaleDateString('de-CH');
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);

        // Briefkopf
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(30, 64, 120);
        doc.text('SPORTSCHÜTZEN MUHEN', 15, 18);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(100, 100, 100);
        doc.text('Gegründet 1928 · 5037 Muhen · www.sportschuetzen-muhen.ch', 15, 23);

        // Beleg-Titel
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(14);
        doc.setTextColor(20, 20, 20);
        const titleText = isEinzel
            ? 'Abrechnungsbeleg: Einzelgewinne / Auszahler Auswärtiges Schiessen'
            : (isKombiniert
                ? 'Abrechnungsbeleg: Gruppen- & Einzelgewinne Auswärtiges Schiessen'
                : 'Abrechnungsbeleg: Gruppengewinn Auswärtiges Schiessen');
        doc.text(titleText, 15, 34);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(`Abrechnungsdatum: ${todayStr} · Buchungskonto: 1301 Transit Schützengewinne`, 15, 39);

        // Stammdaten-Box
        doc.setDrawColor(210, 215, 225);
        doc.setFillColor(248, 249, 252);
        doc.roundedRect(15, 43, 180, 24, 2, 2, 'FD');

        doc.setFontSize(9.5);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(30, 30, 30);
        doc.text(`Anlass:`, 19, 50);
        doc.setFont('helvetica', 'normal');
        doc.text(`${comp.anlass_name}`, 40, 50);

        doc.setFont('helvetica', 'bold');
        doc.text(`Typ / Gruppe:`, 19, 56);
        doc.setFont('helvetica', 'normal');
        const grpDisplay = isEinzel
            ? `Einzelstarts (${members.length} Schützen)`
            : `${comp.gruppe_name || 'Gruppe'} ${comp.rang ? `(Rang ${comp.rang})` : ''} [${isKombiniert ? 'Kombiniert' : 'Gruppe'}]`;
        doc.text(grpDisplay, 40, 56);

        doc.setFont('helvetica', 'bold');
        doc.text(`Saison:`, 120, 50);
        doc.setFont('helvetica', 'normal');
        doc.text(`${comp.jahr || new Date().getFullYear()}`, 145, 50);

        doc.setFont('helvetica', 'bold');
        doc.text(`Punkte Total:`, 120, 56);
        doc.setFont('helvetica', 'normal');
        doc.text(`${comp.punkte_total ? `${comp.punkte_total} Pkt.` : '-'}`, 145, 56);

        // Finanz-Tabelle
        const effDoppel = Math.min(gewinn, doppel);
        const doppelLabel = (gewinn > 0 && gewinn < doppel)
            ? `Abzug Gruppendoppel (Teil-Deckung aus CHF ${doppel.toFixed(2)})`
            : 'Abzug Gruppendoppel (Verein)';

        const finHead = [['Finanzielle Aufstellung', 'Betrag (CHF)', 'Buchungsziel']];
        let finBody = [];

        if (isEinzel) {
            const memberSum = members.reduce((a, b) => a + Number(b.betrag || b.anteil_einzel || 0), 0);
            finBody = [
                ['Total Einzelgewinne / Auszahler (Brutto)', fmtCurr(einzelTotal || memberSum), 'Geldeingang Bank 1020'],
                ['Netto-Auszahlung an Schützen', fmtCurr(einzelTotal || memberSum), 'Transitkonto 1301']
            ];
        } else if (isKombiniert) {
            finBody = [
                ['Gruppengewinn Ausrichter (Brutto)', fmtCurr(gewinn), 'Geldeingang Bank 1020'],
                [doppelLabel, `- ${fmtCurr(effDoppel)}`, 'Rückerstattung Aufwand 4410'],
                ['Netto-Überschuss Gruppe', fmtCurr(ueberschuss), 'Transitkonto 1301'],
                ['Total Einzelgewinne / Auszahler', fmtCurr(einzelTotal), 'Transitkonto 1301'],
                ['Gesamtausschüttung an Schützen', fmtCurr(ueberschuss + einzelTotal), 'Auszahlung / Verrechnung']
            ];
        } else {
            finBody = [
                ['Gruppengewinn Ausrichter (Brutto)', fmtCurr(gewinn), 'Geldeingang Bank 1020'],
                [doppelLabel, `- ${fmtCurr(effDoppel)}`, 'Rückerstattung Aufwand 4410'],
                ['Netto-Überschuss für Schützen', fmtCurr(ueberschuss), 'Transitkonto 1301'],
                ['Anteil je Schütze (bei ' + count + ' Schützen)', fmtCurr(perShooter), 'Auszahlung / Verrechnung']
            ];
        }

        doc.autoTable({
            head: finHead,
            body: finBody,
            startY: 72,
            margin: { left: 15, right: 15 },
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 9, cellPadding: 2.2 },
            headStyles: { fillColor: [30, 64, 120], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 95 },
                1: { cellWidth: 35, halign: 'right', fontStyle: 'bold' },
                2: { cellWidth: 50, halign: 'left', textColor: [90, 90, 90] }
            },
            didParseCell: (hook) => {
                if (hook.section === 'body') {
                    const isHighlightRow = isEinzel ? hook.row.index === 1 : (isKombiniert ? hook.row.index === 4 : hook.row.index === 2);
                    if (isHighlightRow) {
                        hook.cell.styles.fillColor = [226, 240, 233];
                        hook.cell.styles.textColor = [15, 81, 50];
                    }
                }
            }
        });

        // Schützen-Verteiler-Tabelle
        let shooterHead = [];
        let shooterBody = [];
        let colStyles = {};

        if (isEinzel) {
            shooterHead = [['Nr.', 'Name des Schützen', 'Pkt.', 'Stich / Gabe', 'Betrag', 'Auszahlungsweg / Details', 'Visum']];
            shooterBody = members.map((m, idx) => {
                const split = getMemberSplitAmounts(m, comp, 0);
                const methodLabel = m.payout_method === 'jahresbeitrag'
                    ? 'Verrechnung Jahresbeitrag'
                    : (m.payout_method === 'bank' ? `Bank (${m.iban || 'IBAN fehlt'})` : 'Barauszahlung');
                return [
                    String(idx + 1),
                    m.schuetze_name,
                    m.punkte ? String(m.punkte) : '-',
                    m.stich_name || 'Auszahler',
                    fmtCurr(split.einzelAmt || split.totalAmt),
                    methodLabel,
                    ''
                ];
            });
            colStyles = {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 50, fontStyle: 'bold' },
                2: { cellWidth: 14, halign: 'center' },
                3: { cellWidth: 30 },
                4: { cellWidth: 24, halign: 'right', fontStyle: 'bold' },
                5: { cellWidth: 32, fontSize: 8 },
                6: { cellWidth: 20 }
            };
        } else if (isKombiniert) {
            shooterHead = [['Nr.', 'Name des Schützen', 'Pkt.', 'Stich', 'Gruppe', 'Einzel', 'Total', 'Auszahlung', 'Visum']];
            shooterBody = members.map((m, idx) => {
                const split = getMemberSplitAmounts(m, comp, perShooter);
                const methodLabel = m.payout_method === 'jahresbeitrag'
                    ? 'Jahresbeitrag'
                    : (m.payout_method === 'bank' ? 'Bank' : 'Bar');
                return [
                    String(idx + 1),
                    m.schuetze_name,
                    m.punkte ? String(m.punkte) : '-',
                    m.stich_name || '-',
                    fmtCurr(split.grpAmt),
                    fmtCurr(split.einzelAmt),
                    fmtCurr(split.totalAmt),
                    methodLabel,
                    ''
                ];
            });
            colStyles = {
                0: { cellWidth: 10, halign: 'center' },
                1: { cellWidth: 44, fontStyle: 'bold' },
                2: { cellWidth: 12, halign: 'center' },
                3: { cellWidth: 22 },
                4: { cellWidth: 20, halign: 'right' },
                5: { cellWidth: 20, halign: 'right' },
                6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
                7: { cellWidth: 18, fontSize: 8 },
                8: { cellWidth: 12 }
            };
        } else {
            shooterHead = [['Rang', 'Name des Schützen', 'Pkt.', 'Anteil', 'Auszahlungsweg / Details', 'Visum / Quittung']];
            shooterBody = members.map((m, idx) => {
                const split = getMemberSplitAmounts(m, comp, perShooter);
                const methodLabel = m.payout_method === 'jahresbeitrag'
                    ? 'Verrechnung Jahresbeitrag'
                    : (m.payout_method === 'bank' ? `Bank (${m.iban || 'IBAN fehlt'})` : 'Barauszahlung Stand');
                return [
                    String(idx + 1),
                    m.schuetze_name,
                    m.punkte ? String(m.punkte) : '-',
                    fmtCurr(split.totalAmt),
                    methodLabel,
                    ''
                ];
            });
            colStyles = {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 55, fontStyle: 'bold' },
                2: { cellWidth: 16, halign: 'center' },
                3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
                4: { cellWidth: 46, fontSize: 8 },
                5: { cellWidth: 25 }
            };
        }

        doc.autoTable({
            head: shooterHead,
            body: shooterBody,
            startY: doc.lastAutoTable.finalY + 8,
            margin: { left: 15, right: 15 },
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2 },
            headStyles: { fillColor: [70, 80, 95], textColor: 255, fontStyle: 'bold' },
            columnStyles: colStyles
        });

        // Revisionsvermerk & Fusszeile
        const finalY = doc.lastAutoTable.finalY + 12;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text('Revisionssicherer Buchungsvermerk gemäss Vereinsreglement Sportschützen Muhen (OR 957ff).', 15, finalY);
        doc.text('Der Betrag wird ordnungsgemäss über das Bilanz-Transitkonto 1301 geführt und bei Jahresabschluss auf Null saldiert.', 15, finalY + 4);

        doc.setFont('helvetica', 'normal');
        doc.text('Für die Richtigkeit (Schützenmeister / Kassier): __________________________________', 15, finalY + 15);

        // Download / Anzeige
        const filePrefix = isEinzel ? 'Einzelgewinne' : (isKombiniert ? 'Schuetzengewinne' : 'Gruppengewinn');
        const safeName = (comp.gruppe_name || comp.anlass_name || 'Abrechnung').replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Abrechnung_${filePrefix}_${safeName}_${comp.jahr || '2026'}.pdf`);
    }

    // ==========================================================================
    // GESAMTAUSWERTUNG & JAHRESBERICHT-EXPORT (PDF & WORD)
    // ==========================================================================

    /**
     * Aggregiert alle Kennzahlen, Schiessen und Schützen-Statistiken für den PDF- und Word-Export.
     */
    async function buildGruppengewinneReportData(year) {
        const yr = year || getActiveYear();
        const comps = (window._jmGroupCompetitions && window._jmGroupCompetitions.length > 0 && Number(_jmActiveCompYear) === Number(yr))
            ? window._jmGroupCompetitions
            : await jmLoadGroupCompetitions(yr);

        let totalGewinn = 0;
        let totalDoppelSoll = 0;
        let totalDoppelGedeckt = 0;
        let totalUeberschuss = 0;
        let totalVerrechnet = 0;
        let totalOffen = 0;

        const rank1List = [];
        const rank2List = [];
        const rank3List = [];
        const shooterStatsMap = {};

        // Chronologisch oder nach Rang sortierte Kopie
        const sortedComps = [...(comps || [])].sort((a, b) => (Number(a.rang) || 99) - (Number(b.rang) || 99));

        sortedComps.forEach(c => {
            const typ = c.anlass_typ || 'gruppe';
            const isEinzel = typ === 'einzel';
            const doppel = isEinzel ? 0 : Number(c.gruppendoppel || 30);
            const gewinn = isEinzel ? 0 : Number(c.gruppengewinn || 0);
            const einzelAmt = Number(c.einzel_total || 0);
            const ueb = Math.max(0, gewinn - doppel);
            const gedeckt = Math.min(gewinn, doppel);

            totalGewinn += (gewinn + einzelAmt);
            totalDoppelSoll += doppel;
            totalDoppelGedeckt += gedeckt;
            totalUeberschuss += (ueb + einzelAmt);

            const r = Number(c.rang || 0);
            if (r === 1) rank1List.push(c);
            else if (r === 2) rank2List.push(c);
            else if (r === 3) rank3List.push(c);

            const members = Array.isArray(c.members) ? c.members : [];
            const groupMembers = getEffectiveGroupMembers(members);
            const count = groupMembers.length > 0 ? groupMembers.length : Number(c.anzahl_schuetzen || 5);
            const perShooter = (!isEinzel && count > 0) ? (Math.round((ueb / count) * 20) / 20) : 0;

            members.forEach(m => {
                const split = getMemberSplitAmounts(m, c, perShooter);
                const amt = split.totalAmt;
                if (amt > 0) {
                    totalVerrechnet += split.settledAmt;
                    totalOffen += split.unsettledAmt;
                }

                // Schützenname normalisieren ("Vorname Nachname")
                const rawName = String(m.schuetze_name || 'Unbekannt').trim();
                const mObj = findMemberByPn(m.person_number) || findMemberByName(rawName);
                const normName = mObj ? `${mObj.first_name} ${mObj.last_name}` : rawName;
                const key = mObj ? `PN_${mObj.person_number}` : normName.toLowerCase();

                if (!shooterStatsMap[key]) {
                    shooterStatsMap[key] = {
                        name: normName,
                        pn: mObj?.person_number || m.person_number || '',
                        einsaetze: 0,
                        einsatz100Count: 0,
                        sum100Pts: 0,
                        best100Pts: 0,
                        otherScores: [],
                        totalShare: 0,
                        verrechnetShare: 0,
                        offenShare: 0,
                        events: []
                    };
                }

                const st = shooterStatsMap[key];
                st.einsaetze++;
                const pts = Number(m.punkte || 0);
                if (pts > 0) {
                    if (pts <= 100) {
                        st.einsatz100Count++;
                        st.sum100Pts += pts;
                        if (pts > st.best100Pts) st.best100Pts = pts;
                    } else {
                        st.otherScores.push(`${pts} (${c.anlass_name})`);
                    }
                }
                st.totalShare += amt;
                st.verrechnetShare += split.settledAmt;
                st.offenShare += split.unsettledAmt;
                st.events.push({
                    anlass: c.anlass_name,
                    gruppe: c.gruppe_name,
                    rang: c.rang,
                    punkte: pts,
                    betrag: amt,
                    status: m.status || 'offen'
                });
            });
        });

        const shooterStats = Object.values(shooterStatsMap).sort((a, b) => {
            if (b.einsaetze !== a.einsaetze) return b.einsaetze - a.einsaetze;
            if (b.totalShare !== a.totalShare) return b.totalShare - a.totalShare;
            return b.sum100Pts - a.sum100Pts;
        });

        return {
            year: yr,
            comps: comps || [],
            sortedComps,
            totalGewinn,
            totalDoppelSoll,
            totalDoppelGedeckt,
            totalUeberschuss,
            totalVerrechnet,
            totalOffen,
            rank1List,
            rank2List,
            rank3List,
            shooterStats
        };
    }

    /**
     * Erzeugt eine umfassende PDF-Gesamtauswertung aller Gruppengewinne, Teilnehmer, Einzelpunkte & Schützenstatistik.
     */
    async function jmExportGruppengewinneSummaryPdf(year) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'PDF-Fehler', message: 'Die jsPDF-Bibliothek ist noch nicht geladen.', type: 'danger' });
            }
            return;
        }

        const data = await buildGruppengewinneReportData(year);
        if (!data.comps || data.comps.length === 0) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'Keine Daten', message: `Für die Saison ${data.year} sind noch keine Gruppengewinne erfasst.`, type: 'info' });
            }
            return;
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
        const todayStr = (window.UIFormatKit && UIFormatKit.formatDate) ? UIFormatKit.formatDate(new Date().toISOString().split('T')[0]) : new Date().toLocaleDateString('de-CH');

        // Header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(16);
        doc.setTextColor(30, 64, 120);
        doc.text(`SPORTSCHÜTZEN MUHEN – Auswärtige Gruppenschiessen & Konto 1301 (Saison ${data.year})`, 14, 15);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(90, 90, 90);
        const podiumCount = data.rank1List.length + data.rank2List.length + data.rank3List.length;
        doc.text(`Stand: ${todayStr} · ${data.comps.length} Gruppenschiessen (${podiumCount} Podestplätze: ${data.rank1List.length}x 1. Rang, ${data.rank2List.length}x 2. Rang, ${data.rank3List.length}x 3. Rang) · Buchungskonto: 1301`, 14, 20.5);

        // Finanz-KPI Box
        doc.setDrawColor(200, 210, 225);
        doc.setFillColor(246, 248, 252);
        doc.roundedRect(14, 24, 269, 13, 2, 2, 'FD');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(25, 135, 84);
        doc.text(`Brutto-Gewinne: ${fmtCurr(data.totalGewinn)}`, 18, 32);

        doc.setTextColor(60, 60, 60);
        doc.text(`Vereinsanteil Doppel (4410): ${fmtCurr(data.totalDoppelGedeckt)} (aus ${fmtCurr(data.totalDoppelSoll)})`, 78, 32);

        doc.setTextColor(13, 110, 253);
        doc.text(`Netto-Überschuss Schützen (1301): ${fmtCurr(data.totalUeberschuss)}`, 165, 32);

        doc.setTextColor(40, 40, 40);
        doc.text(`Abgewickelt: ${fmtCurr(data.totalVerrechnet)} | Offen: ${fmtCurr(data.totalOffen)}`, 235, 32);

        // Tabelle 1: Alle Gruppenschiessen mit Teilnehmern & Einzelpunkten
        const compHead = [['Anlass / Schützenfest', 'Gruppe', 'Rang', 'Total Pkt.', 'Doppel', 'Gewinn', 'Überschuss', 'Beteiligte Schützen (Einzelpunkte & Anteil)', 'Status']];
        const compBody = data.comps.map(c => {
            const typ = c.anlass_typ || 'gruppe';
            const isEinzel = typ === 'einzel';
            const isKombiniert = typ === 'kombiniert';
            const doppel = isEinzel ? 0 : Number(c.gruppendoppel || 30);
            const grpGewinn = isEinzel ? 0 : Number(c.gruppengewinn || 0);
            const einzelAmt = Number(c.einzel_total || 0);
            const brutto = grpGewinn + einzelAmt;
            const grpUeb = isEinzel ? 0 : Math.max(0, grpGewinn - doppel);
            const ueb = grpUeb + einzelAmt;
            const members = Array.isArray(c.members) ? [...c.members].sort((a, b) => (Number(b.punkte) || 0) - (Number(a.punkte) || 0)) : [];
            const groupMembers = getEffectiveGroupMembers(members);
            const count = groupMembers.length > 0 ? groupMembers.length : 5;
            const perShooter = (!isEinzel && count > 0) ? (Math.round((grpUeb / count) * 20) / 20) : 0;

            const allDone = members.length > 0 && ueb > 0 && members.every(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt');
            const someDone = members.some(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt' || Boolean(m.contribution_position_id));
            const statusTxt = ueb === 0
                ? 'Kein Überschuss'
                : (allDone
                    ? 'Abgewickelt (JB)'
                    : (someDone
                        ? 'Teilw. verrechnet'
                        : (isEinzel ? 'Offen (Einzel)' : (isKombiniert ? 'Offen (Kombi)' : `Offen (je ${fmtCurr(perShooter)})`))));

            const shootersStr = members.map(m => `${m.schuetze_name} (${m.punkte || '-'} Pkt.)`).join(', ');
            const calcPts = computeGroupPointsTotal(members, typ);

            return [
                c.anlass_name,
                isEinzel ? 'Einzel' : c.gruppe_name,
                (!isEinzel && c.rang) ? `${c.rang}.` : '-',
                c.punkte_total ? `${c.punkte_total}` : (calcPts > 0 ? `${calcPts}` : '-'),
                isEinzel ? '-' : fmtCurr(doppel),
                fmtCurr(brutto),
                fmtCurr(ueb),
                shootersStr || '-',
                statusTxt
            ];
        });

        // Summenzeile anfügen
        compBody.push([
            `TOTAL (${data.comps.length} Schiessen)`,
            '',
            '',
            '',
            fmtCurr(data.totalDoppelGedeckt),
            fmtCurr(data.totalGewinn),
            fmtCurr(data.totalUeberschuss),
            `Davon im Jahresbeitrag verrechnet: ${fmtCurr(data.totalVerrechnet)} · Noch offen: ${fmtCurr(data.totalOffen)}`,
            ''
        ]);

        doc.autoTable({
            head: compHead,
            body: compBody,
            startY: 41,
            margin: { left: 14, right: 14 },
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 8, cellPadding: 2 },
            headStyles: { fillColor: [30, 64, 120], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 48, fontStyle: 'bold' },
                1: { cellWidth: 18 },
                2: { cellWidth: 12, halign: 'center', fontStyle: 'bold' },
                3: { cellWidth: 17, halign: 'right' },
                4: { cellWidth: 20, halign: 'right' },
                5: { cellWidth: 21, halign: 'right', fontStyle: 'bold' },
                6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
                7: { cellWidth: 83, fontSize: 7.5 },
                8: { cellWidth: 28 }
            },
            didParseCell: (hook) => {
                if (hook.section === 'body' && hook.row.index === compBody.length - 1) {
                    hook.cell.styles.fillColor = [232, 238, 248];
                    hook.cell.styles.fontStyle = 'bold';
                }
            }
        });

        // Tabelle 2: Schützen-Statistik & Gewinnanteile über die ganze Saison
        let nextY = doc.lastAutoTable.finalY + 8;
        if (nextY > 155) {
            doc.addPage();
            nextY = 18;
        }

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(11);
        doc.setTextColor(30, 64, 120);
        doc.text(`Schützen-Einsatzstatistik & Gewinnanteile (Saison ${data.year})`, 14, nextY);

        const shooterHead = [['#', 'Schütze', 'Gruppen-Einsätze', 'Ø Punkte (100er)', 'Bestresultat', 'Teilnahmen & Einzelpunkte', 'Gewinnanteil Total', 'Davon verrechnet', 'Offen']];
        const shooterBody = data.shooterStats.map((st, idx) => {
            const avg100 = st.einsatz100Count > 0 ? (st.sum100Pts / st.einsatz100Count).toFixed(2) + ' Pkt.' : '-';
            const bestStr = st.best100Pts > 0 ? `${st.best100Pts} Pkt.` : (st.otherScores[0] || '-');
            const evDetails = st.events.map(e => {
                const shortName = String(e.anlass || '').replace(/\s*\(.*?\)\s*/g, ' ').replace(/\b20\d\d\b/g, '').trim();
                return `${shortName}: ${e.punkte || '-'} Pkt.`;
            }).join(' | ');

            return [
                String(idx + 1),
                st.name,
                `${st.einsaetze}x`,
                avg100,
                bestStr,
                evDetails,
                fmtCurr(st.totalShare),
                fmtCurr(st.verrechnetShare),
                fmtCurr(st.offenShare)
            ];
        });

        doc.autoTable({
            head: shooterHead,
            body: shooterBody,
            startY: nextY + 3,
            margin: { left: 14, right: 14 },
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 7.8, cellPadding: 1.8 },
            headStyles: { fillColor: [70, 80, 95], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 8, halign: 'center' },
                1: { cellWidth: 36, fontStyle: 'bold' },
                2: { cellWidth: 22, halign: 'center' },
                3: { cellWidth: 23, halign: 'right' },
                4: { cellWidth: 20, halign: 'right' },
                5: { cellWidth: 100, fontSize: 7.2 },
                6: { cellWidth: 22, halign: 'right', fontStyle: 'bold' },
                7: { cellWidth: 20, halign: 'right' },
                8: { cellWidth: 18, halign: 'right' }
            }
        });

        doc.save(`Gesamtauswertung_Gruppengewinne_1301_${data.year}.pdf`);
        if (typeof showSuccess === 'function') {
            showSuccess(`📄 PDF-Gesamtauswertung (${data.year}) erfolgreich erstellt!`);
        }
    }

    /**
     * Erzeugt ein direkt in Microsoft Word editierbares Dokument (.doc) mit Textbausteinen
     * und detaillierten Tabellen für den Jahresbericht des Schützenmeisters / Präsidenten.
     */
    async function jmExportGruppengewinneWord(year) {
        const data = await buildGruppengewinneReportData(year);
        if (!data.comps || data.comps.length === 0) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'Keine Daten', message: `Für die Saison ${data.year} sind noch keine Gruppengewinne erfasst.`, type: 'info' });
            }
            return;
        }

        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${Number(v || 0).toFixed(2)}`);
        const todayStr = (window.UIFormatKit && UIFormatKit.formatDate) ? UIFormatKit.formatDate(new Date().toISOString().split('T')[0]) : new Date().toLocaleDateString('de-CH');

        // Formuliere druckreifen Jahresbericht-Fliesstext
        const r1Names = data.rank1List.map(c => `${c.anlass_name} (${c.punkte_total ? c.punkte_total + ' Pkt.' : '1. Rang'})`).join(', ');
        const r2Names = data.rank2List.map(c => `${c.anlass_name} (${c.punkte_total ? c.punkte_total + ' Pkt.' : '2. Rang'})`).join(', ');
        const r3Names = data.rank3List.map(c => `${c.anlass_name} (${c.punkte_total ? c.punkte_total + ' Pkt.' : '3. Rang'})`).join(', ');

        let proseParagraphs = `<p>In der Schiesssaison <strong>${data.year}</strong> nahmen die Sportschützen Muhen mit der Gruppe <strong>«Strohaus»</strong> erfolgreich an <strong>${data.comps.length} auswärtigen Gruppenschiessen</strong> teil. Insgesamt erzielte unsere Gruppe hervorragende Resultate und durfte Brutto-Gruppengaben von insgesamt <strong>${fmtCurr(data.totalGewinn)}</strong> (Netto-Ausschüttung an die Gruppenschützen nach Abzug der Vereinsdoppel: <strong>${fmtCurr(data.totalUeberschuss)}</strong>) entgegennehmen.</p>`;

        const podiumSentences = [];
        if (data.rank1List.length > 0) {
            podiumSentences.push(`<strong>${data.rank1List.length}x den 1. Schlussrang (Gruppensieg)</strong> bei: <em>${escapeHtml(r1Names)}</em>`);
        }
        if (data.rank2List.length > 0) {
            podiumSentences.push(`<strong>${data.rank2List.length}x den 2. Schlussrang</strong> bei: <em>${escapeHtml(r2Names)}</em>`);
        }
        if (data.rank3List.length > 0) {
            podiumSentences.push(`<strong>${data.rank3List.length}x den 3. Schlussrang</strong> bei: <em>${escapeHtml(r3Names)}</em>`);
        }

        if (podiumSentences.length > 0) {
            proseParagraphs += `<p>Besonders hervorzuheben sind die Podestplätze unserer Gruppe:<br>• ${podiumSentences.join('<br>• ')}</p>`;
        }

        const topActiveShooters = data.shooterStats.slice(0, 6).map(s => `${escapeHtml(s.name)} (${s.einsaetze} Einsätze${s.einsatz100Count > 0 ? ', Ø ' + (s.sum100Pts / s.einsatz100Count).toFixed(1) + ' Pkt.' : ''})`).join(', ');
        if (topActiveShooters) {
            proseParagraphs += `<p>Als fleissigste Gruppenschützen standen im Einsatz: ${topActiveShooters}.</p>`;
        }

        // Übersichtstabelle aller Schiessen
        const overviewRowsHtml = data.comps.map(c => {
            const typ = c.anlass_typ || 'gruppe';
            const isEinzel = typ === 'einzel';
            const doppel = isEinzel ? 0 : Number(c.gruppendoppel || 30);
            const grpGewinn = isEinzel ? 0 : Number(c.gruppengewinn || 0);
            const einzelAmt = Number(c.einzel_total || 0);
            const brutto = grpGewinn + einzelAmt;
            const ueb = (isEinzel ? 0 : Math.max(0, grpGewinn - doppel)) + einzelAmt;
            const members = Array.isArray(c.members) ? [...c.members].sort((a, b) => (Number(b.punkte) || 0) - (Number(a.punkte) || 0)) : [];
            const shooterText = members.map(m => `${escapeHtml(m.schuetze_name)} (${m.punkte || '-'})`).join(', ');
            const calcPts = computeGroupPointsTotal(members, typ);

            return `
                <tr>
                    <td><strong>${escapeHtml(c.anlass_name)}</strong></td>
                    <td>${escapeHtml(isEinzel ? 'Einzel' : c.gruppe_name)}</td>
                    <td style="text-align:center;"><strong>${(!isEinzel && c.rang) ? c.rang + '. Rang' : '-'}</strong></td>
                    <td style="text-align:right;"><strong>${c.punkte_total || calcPts || '-'}</strong></td>
                    <td style="text-align:right;">${fmtCurr(brutto)}</td>
                    <td style="text-align:right;">${fmtCurr(ueb)}</td>
                    <td>${shooterText}</td>
                </tr>
            `;
        }).join('');

        // Detailblöcke je Schützenfest (für Jahresbericht-Anreicherung)
        const eventDetailBlocksHtml = data.comps.map(c => {
            const typ = c.anlass_typ || 'gruppe';
            const isEinzel = typ === 'einzel';
            const doppel = isEinzel ? 0 : Number(c.gruppendoppel || 30);
            const grpGewinn = isEinzel ? 0 : Number(c.gruppengewinn || 0);
            const einzelAmt = Number(c.einzel_total || 0);
            const grpUeb = isEinzel ? 0 : Math.max(0, grpGewinn - doppel);
            const ueb = grpUeb + einzelAmt;
            const members = Array.isArray(c.members) ? [...c.members].sort((a, b) => (Number(b.punkte) || 0) - (Number(a.punkte) || 0)) : [];
            const groupMembers = getEffectiveGroupMembers(members);
            const count = groupMembers.length > 0 ? groupMembers.length : 5;
            const perShooter = (!isEinzel && count > 0) ? (Math.round((grpUeb / count) * 20) / 20) : 0;
            const calcPts = computeGroupPointsTotal(members, typ);

            const mRows = members.map((m, idx) => {
                const split = getMemberSplitAmounts(m, c, perShooter);
                return `
                <tr>
                    <td style="text-align:center;">${idx + 1}.</td>
                    <td><strong>${escapeHtml(m.schuetze_name)}</strong></td>
                    <td style="text-align:right;"><strong>${m.punkte || '-'} Pkt.</strong></td>
                    <td style="text-align:right;">${fmtCurr(split.totalAmt)}</td>
                </tr>
            `;
            }).join('');

            const finanzInfo = isEinzel
                ? `Einzelgewinne Brutto / Netto-Ausschüttung: <strong>${fmtCurr(einzelAmt)}</strong>`
                : `Gruppengabe Brutto: <strong>${fmtCurr(grpGewinn)}</strong> | Gruppendoppel Verein: ${fmtCurr(doppel)} | Gruppen-Überschuss: <strong>${fmtCurr(grpUeb)}</strong> (je ${fmtCurr(perShooter)})${einzelAmt > 0 ? ` | Einzelgewinne: <strong>${fmtCurr(einzelAmt)}</strong> | Total: <strong>${fmtCurr(ueb)}</strong>` : ''}`;

            return `
                <div style="margin-bottom: 14pt; page-break-inside: avoid;">
                    <h3 style="margin: 8pt 0 4pt 0; color: #1e4078; font-size: 11.5pt;">
                        ${escapeHtml(c.anlass_name)} – ${isEinzel ? 'Einzelgewinne' : `Gruppe «${escapeHtml(c.gruppe_name)}»`}
                        ${(!isEinzel && c.rang) ? `(${c.rang}. Rang)` : ''} · Total: ${c.punkte_total || calcPts || '-'} Punkte
                    </h3>
                    <div style="font-size: 9.5pt; color: #444; margin-bottom: 4pt;">
                        ${finanzInfo}
                    </div>
                    <table border="1" cellspacing="0" cellpadding="4" style="border-collapse: collapse; width: 100%; font-size: 9.5pt; border-color: #cbd5e1;">
                        <thead>
                            <tr style="background-color: #f1f5f9;">
                                <th style="width: 10%; text-align:center;">Nr.</th>
                                <th style="width: 50%; text-align:left;">Schütze</th>
                                <th style="width: 20%; text-align:right;">Einzelpunkte</th>
                                <th style="width: 20%; text-align:right;">Gewinnanteil</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${mRows}
                        </tbody>
                    </table>
                </div>
            `;
        }).join('');

        // Schützen-Einsatzstatistik Tabelle
        const shooterStatRowsHtml = data.shooterStats.map((st, idx) => {
            const avg100 = st.einsatz100Count > 0 ? (st.sum100Pts / st.einsatz100Count).toFixed(2) + ' Pkt.' : '-';
            const bestStr = st.best100Pts > 0 ? `${st.best100Pts} Pkt.` : (st.otherScores[0] || '-');
            const evList = st.events.map(e => `${escapeHtml(e.anlass)}: <strong>${e.punkte || '-'}</strong>`).join(', ');
            return `
                <tr>
                    <td style="text-align:center;">${idx + 1}.</td>
                    <td><strong>${escapeHtml(st.name)}</strong></td>
                    <td style="text-align:center;">${st.einsaetze}</td>
                    <td style="text-align:right;">${avg100}</td>
                    <td style="text-align:right;">${bestStr}</td>
                    <td>${evList}</td>
                    <td style="text-align:right;"><strong>${fmtCurr(st.totalShare)}</strong></td>
                </tr>
            `;
        }).join('');

        const wordHtml = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office"
                  xmlns:w="urn:schemas-microsoft-com:office:word"
                  xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <title>Jahresbericht Auswärtige Gruppenschiessen ${data.year}</title>
                <style>
                    body { font-family: Calibri, Arial, sans-serif; font-size: 10.5pt; color: #1e293b; line-height: 1.4; }
                    h1 { font-size: 16pt; color: #1e4078; margin-bottom: 2pt; }
                    h2 { font-size: 13pt; color: #1e4078; border-bottom: 1px solid #cbd5e1; padding-bottom: 3pt; margin-top: 16pt; margin-bottom: 8pt; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; }
                    th, td { border: 1px solid #cbd5e1; padding: 5pt 6pt; vertical-align: top; }
                    th { background-color: #1e4078; color: #ffffff; font-weight: bold; }
                    .box { background-color: #f8fafc; border: 1px solid #cbd5e1; padding: 10pt; margin-bottom: 12pt; }
                </style>
            </head>
            <body>
                <h1>SPORTSCHÜTZEN MUHEN – Auswärtige Gruppenschiessen ${data.year}</h1>
                <div style="color: #64748b; font-size: 9.5pt; margin-bottom: 12pt;">
                    Auswertung für Jahresbericht &amp; Generalversammlung · Stand: ${todayStr}
                </div>

                <h2>1. Textvorlage für den Jahresbericht (Schützenmeister / Präsident)</h2>
                <div class="box">
                    ${proseParagraphs}
                </div>

                <h2>2. Gesamtübersicht der besuchten Gruppenschiessen (${data.year})</h2>
                <table>
                    <thead>
                        <tr>
                            <th style="width:24%; text-align:left;">Anlass / Schützenfest</th>
                            <th style="width:10%; text-align:left;">Gruppe</th>
                            <th style="width:9%; text-align:center;">Rang</th>
                            <th style="width:9%; text-align:right;">Total Pkt.</th>
                            <th style="width:10%; text-align:right;">Gewinn</th>
                            <th style="width:10%; text-align:right;">Überschuss</th>
                            <th style="width:28%; text-align:left;">Gruppenschützen (Einzelpunkte)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${overviewRowsHtml}
                        <tr style="background-color: #e2e8f0; font-weight: bold;">
                            <td colspan="4">TOTAL SAISON ${data.year} (${data.comps.length} Gruppenschiessen)</td>
                            <td style="text-align:right;">${fmtCurr(data.totalGewinn)}</td>
                            <td style="text-align:right;">${fmtCurr(data.totalUeberschuss)}</td>
                            <td>Vereinsanteil Doppel (4410): ${fmtCurr(data.totalDoppelGedeckt)}</td>
                        </tr>
                    </tbody>
                </table>

                <h2>3. Einsatz- &amp; Erfolgsstatistik der Gruppenschützen (${data.year})</h2>
                <table>
                    <thead>
                        <tr>
                            <th style="width:5%; text-align:center;">#</th>
                            <th style="width:20%; text-align:left;">Schütze</th>
                            <th style="width:8%; text-align:center;">Einsätze</th>
                            <th style="width:11%; text-align:right;">Ø (100er)</th>
                            <th style="width:11%; text-align:right;">Bestwert</th>
                            <th style="width:33%; text-align:left;">Einzelresultate</th>
                            <th style="width:12%; text-align:right;">Gewinnanteil</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${shooterStatRowsHtml}
                    </tbody>
                </table>

                <h2>4. Detailresultate je Schützenfest (zum Einfügen in den Jahresbericht)</h2>
                ${eventDetailBlocksHtml}
            </body>
            </html>
        `;

        const blob = new Blob(['\ufeff', wordHtml], { type: 'application/msword;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `Jahresbericht_Gruppenschiessen_${data.year}.doc`;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 200);

        if (typeof showSuccess === 'function') {
            showSuccess(`📘 Word-Dokument für den Jahresbericht (${data.year}) erfolgreich heruntergeladen!`);
        }
    }

    // ==========================================================================
    // AUTO-ERKENNUNG BEIM RANGLLISTEN-IMPORT (jahresmeisterschaft-import.js)
    // ==========================================================================

    /**
     * Analysiert Textzeilen auf Gruppen und allfällige Gruppenauszahlungen.
     * Wird von jahresmeisterschaft-import.js aufgerufen.
     */
    function jmDetectGroupCompetitionFromImportLines(lines, fullText, fileName) {
        if (!lines || lines.length === 0) return null;

        const escapeReg = str => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const isGroupDoc = /(?:gruppenstich|gruppenrangliste|gruppe|gruppen|mannschaft)/i.test(fullText);
        
        // =====================================================================
        // FORMAT 1: WinFire Standard-Gruppenrangliste (z. B. Bärenmoosschiessen)
        // =====================================================================
        let groupMatch = null;
        let groupLineIdx = -1;

        for (let i = 0; i < lines.length; i++) {
            const t = (lines[i].text || lines[i] || '').trim();
            const m = t.match(/(?:^|\b)(\d+)\s+(\d+)\s+([A-Za-z0-9äöüÄÖÜß\-\s]+?)\s+Muhen/i);
            if (m) {
                let cleanName = m[3].trim();
                // Bereinige vorangestellte Schützenpunkte oder PDF-Sortierzahlen (z. B. "97 97 97 97 488 537 0 Strohhaus 1")
                cleanName = cleanName.replace(/^(?:\d+[\s,.\-_]*)+/, '').trim();
                if (!cleanName) cleanName = 'Strohhaus 1';

                groupMatch = {
                    rang: parseInt(m[1], 10),
                    punkte: parseFloat(m[2]),
                    name: cleanName
                };
                groupLineIdx = i;
                break;
            } else if (/(?:muhen.*?stroh?haus|stroh?haus.*?muhen)/i.test(t)) {
                const rangM = t.match(/\b(\d+)\b/);
                let cleanName = 'Strohhaus 1';
                const nameM = t.match(/(stroh?haus\s*\d*)/i);
                if (nameM) cleanName = nameM[1].trim();

                groupMatch = {
                    rang: rangM ? parseInt(rangM[1], 10) : 1,
                    punkte: null,
                    name: cleanName
                };
                groupLineIdx = i;
                break;
            }
        }

        if (groupMatch) {
            // Schützen unterhalb der Gruppe aufsammeln (nächste 3–6 Zeilen)
            const detectedShooters = [];
            if (groupLineIdx >= 0) {
                for (let i = groupLineIdx + 1; i < Math.min(lines.length, groupLineIdx + 10); i++) {
                    const lineText = lines[i].text || lines[i];
                    // Schützenzeile: Punkte Name Vorname Jahrgang
                    const sMatch = lineText.match(/(?:^|\s)(\d{2,3})\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+(\d{4}|\d{2})\b/);
                    if (sMatch) {
                        detectedShooters.push({
                            punkte: parseFloat(sMatch[1]),
                            schuetze_name: `${sMatch[2]} ${sMatch[3]}`,
                            jahrgang: parseInt(sMatch[4], 10)
                        });
                    } else if (/^\d+\s+\d+\s+/.test(lineText.trim())) {
                        break;
                    }
                }
            }

            // Korrektur Gruppenpunkte, falls m[2] ein Einzelschützen-Wert war oder Shooters vorliegen
            const shooterSum = detectedShooters.reduce((a, b) => a + (b.punkte || 0), 0);
            if (shooterSum > 0 && (!groupMatch.punkte || groupMatch.punkte < 300 || groupMatch.punkte !== shooterSum)) {
                groupMatch.punkte = shooterSum;
            }

            // Auszahlung suchen: Primär direkt in den Zeilen des Gruppenblocks
            let detectedAuszahlung = 0;
            if (groupLineIdx >= 0) {
                const startL = Math.max(0, groupLineIdx - 1);
                const endL = Math.min(lines.length, groupLineIdx + 8);
                const surrounding = lines.slice(startL, endL).map(l => (l.text || l || '')).join('\n');
                const mP = surrounding.match(/(?:chf\s*|chf\.\s*)?(\d{2,4})(?:\.--|\.-|\s*chf)/i);
                if (mP) {
                    detectedAuszahlung = parseFloat(mP[1]);
                }
            }

            // Fallback: Gesamtdokument durchsuchen (aber reine Auszahlungsstich-Einzelranglisten ignorieren)
            if (!detectedAuszahlung) {
                const cleanDoc = fullText.replace(/einzelrangliste\s+auszahlungsstich[\s\S]*/i, '');
                const auszMatch = cleanDoc.match(/(?:auszahlung|gewinn|gabe)[\s\S]{0,100}?(?:150\.-[\s\n]+)?(\d{2,3})\.-/i);
                if (auszMatch) {
                    detectedAuszahlung = parseFloat(auszMatch[1]);
                } else {
                    const r2Match = cleanDoc.match(/\b120\.-\b/);
                    if (r2Match) detectedAuszahlung = 120.00;
                }
            }

            return {
                gruppe_name: groupMatch.name || 'Strohhaus 1',
                rang: groupMatch.rang || null,
                punkte_total: groupMatch.punkte || null,
                gruppendoppel: 30.00,
                gruppengewinn: detectedAuszahlung,
                shooters: detectedShooters
            };
        }

        // =====================================================================
        // FORMAT 2: SIUS / Meyton / BLM Gruppenrangliste (z. B. Balsthaler Liegendmatch)
        // Zeilenstruktur: Platz \n Muhen - Muhen 1 \n SNr \n Serien \n Total \n Schützen
        // =====================================================================
        const blmMatch = fullText.match(/(?:^|\n)(\d+)\.\s*\n\s*Muhen\s*[-–\t ]+\s*([A-Za-z0-9äöüÄÖÜß\-\t ]+)/i);
        if (blmMatch) {
            const blmRang = parseInt(blmMatch[1], 10);
            const rawGrpName = blmMatch[2].replace(/\t+/g, ' ').trim();
            const grpName = rawGrpName.replace(/^Muhen\s*/i, 'Muhen ') || 'Muhen 1';

            // Schützen nach der Gruppe extrahieren (Name, Vorname, Total)
            const blmShooters = [];
            // Suche nach "Muhen - ..." im Volltext
            const startIdx = fullText.indexOf(blmMatch[0]);
            if (startIdx >= 0) {
                const afterGroup = fullText.substring(startIdx);
                // Regex für Schützenzeilen: SNr \n NACHNAME, \t VORNAME \n PassNr ... Total
                const shooterRegex = /\n\d+\s*\n\s*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+),\s*([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)[\s\S]*?\n\s*(\d{3}(?:\.\d)?)\s*(?=\n\d+|\n\d+\.|$)/g;
                let sMatch;
                while ((sMatch = shooterRegex.exec(afterGroup)) !== null) {
                    blmShooters.push({
                        schuetze_name: `${sMatch[2]} ${sMatch[1]}`, // Vorname Nachname
                        punkte: parseFloat(sMatch[3]),
                        jahrgang: null
                    });
                    if (blmShooters.length >= 3) break; // Balsthal = 3er Gruppe
                }
            }

            // Gesamtpunktzahl ermitteln
            let blmTotal = null;
            const totMatch = fullText.match(new RegExp(escapeReg(blmMatch[0]) + '[\\s\\S]*?(\\d{4}(?:\\.\\d)?)\\b'));
            if (totMatch) blmTotal = parseFloat(totMatch[1]);

            return {
                gruppe_name: grpName,
                rang: blmRang,
                punkte_total: blmTotal,
                gruppendoppel: 30.00,
                gruppengewinn: 0.00, // Wird in SIUS/Meyton nicht abgedruckt -> per Bank überwiesen
                shooters: blmShooters,
                notice: 'Gruppenpreisgeld nicht auf der Rangliste abgedruckt (wird per Bank überwiesen). Bitte Betrag eintragen.'
            };
        }

        // =====================================================================
        // FORMAT 3: Sektionsliste mit Gruppenvermerk (z. B. 58. Siggenbergschiessen)
        // Zeilen wie: Strohaus 186Fischer Marco ... / Strohaus 265Augsburger Beat ...
        // =====================================================================
        if (fullText.includes('Muhen') && /(?:Strohaus\s*[12]|Strohaus)/i.test(fullText)) {
            const siggShooters1 = [];
            const siggShooters2 = [];

            lines.forEach(l => {
                const t = (l.text || l || '').trim();
                const m = t.match(/Strohaus\s*([12])\s*(\d{2})([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+([A-ZÄÖÜ][a-zA-ZäöüÄÖÜß\-]+)\s+(\d{2,3})/);
                if (m) {
                    const grpNum = m[1];
                    const jg = parseInt(m[2], 10) > 30 ? (1900 + parseInt(m[2], 10)) : (2000 + parseInt(m[2], 10));
                    const sName = `${m[4]} ${m[3]}`; // Vorname Nachname
                    const pts = parseFloat(m[5]);

                    const item = { schuetze_name: sName, punkte: pts, jahrgang: jg };
                    if (grpNum === '1') siggShooters1.push(item);
                    else if (grpNum === '2') siggShooters2.push(item);
                }
            });

            if (siggShooters1.length > 0) {
                return {
                    gruppe_name: 'Strohaus 1',
                    rang: null,
                    punkte_total: siggShooters1.reduce((a, b) => a + (b.punkte || 0), 0),
                    gruppendoppel: 30.00,
                    gruppengewinn: 0.00,
                    shooters: siggShooters1,
                    notice: 'Gruppe Strohaus 1 aus Sektionsliste extrahiert. Bitte Gewinnbetrag eintragen.'
                };
            }
        }

        // =====================================================================
        // FORMAT 4: Reine Einzelrangliste für Muhen (z. B. Deisigrabenschiessen)
        // =====================================================================
        if (/Einzelrangliste\s+f[üu]r\s+Muhen/i.test(fullText) || (fullText.includes('Muhen') && !isGroupDoc)) {
            return {
                gruppe_name: 'Strohaus',
                rang: null,
                punkte_total: null,
                gruppendoppel: 30.00,
                gruppengewinn: 0.00,
                shooters: [],
                isSingleRankingOnly: true,
                notice: 'Reine Einzelrangliste (keine Gruppenrangliste im Dokument). Gruppenpreise können manuell für die Top-5 Schützen erfasst werden.'
            };
        }

        return null;
    }

    // Hilfsfunktion: Escape HTML
    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ==========================================================================
    // RANGLISTEN-STORAGE, VOLLSTÄNDIGE PDF-OPTIMIERUNG, EINZELBERECHNUNG & 180-TAGE-LINKS
    // ==========================================================================

    const RANGLISTEN_BUCKET = 'jm-ranglisten';
    const SIGNED_URL_EXPIRES_SECONDS = 180 * 24 * 60 * 60; // 180 Tage = 15'552'000 Sekunden

    /**
     * Erzeugt einen sauberen, standardisierten Dateinamen je Rangliste analog zur Jahresmeisterschaft.
     * Beispiel: "Rangliste_Baerenmoos-Schiessen_Villmergen_2026.pdf" oder "Gruppenrangliste_58_Siggenbergschiessen_2026.pdf"
     */
    function jmBuildCleanRanglisteFilename(anlassTitle, year, isGroupRanking = false) {
        const yr = year || getActiveYear();
        let formattedTitle = String(anlassTitle || 'Auswaertsschiessen').trim();
        if (typeof window.jmFormatCompetitionTitle === 'function') {
            formattedTitle = window.jmFormatCompetitionTitle(formattedTitle);
        }
        const safeSlug = formattedTitle
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
            .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
            .replace(/ß/g, 'ss')
            .replace(/[^a-zA-Z0-9\-_.]+/g, '_')
            .replace(/_+/g, '_')
            .replace(/^_|_$/g, '');

        const prefix = isGroupRanking ? 'Gruppenrangliste' : 'Rangliste';
        const hasYear = safeSlug.includes(String(yr));
        return `${prefix}_${safeSlug}${hasYear ? '' : '_' + yr}.pdf`;
    }

    /**
     * Optimiert eine hochgeladene Rangliste (PDF oder Bild/Snip):
     * - Bilder / Screenshots (Strg+V): Werden auf max. 1600px skaliert, als JPEG (0.78) komprimiert
     *   und in ein sauberes 1-seitiges A4-PDF mit Titelkopf eingebettet.
     * - PDFs: Die Rangliste bleibt IMMER zu 100% komplett erhalten (alle Seiten!).
     *   Nur wenn das PDF gross ist (> 350 KB) und eine verlustarme Re-Komprimierung aller Seiten
     *   tatsächlich eine kleinere Datei ergibt, wird die verkleinerte Version verwendet –
     *   andernfalls bleibt das Original-PDF 1:1 unverändert erhalten.
     */
    async function jmOptimizeAndConvertToPdfBlob(file, cleanTitle) {
        if (!file) return null;

        // 1. Bild / Screenshot (Strg+V oder Foto) -> Komprimiertes 1-Seiten A4-PDF erzeugen
        if (file.type && file.type.startsWith('image/')) {
            try {
                if (window.jspdf && window.jspdf.jsPDF) {
                    const imgData = await new Promise((resolve, reject) => {
                        const img = new Image();
                        const url = URL.createObjectURL(file);
                        img.onload = () => {
                            URL.revokeObjectURL(url);
                            const maxDim = 1600;
                            let w = img.width;
                            let h = img.height;
                            if (w > maxDim || h > maxDim) {
                                if (w > h) {
                                    h = Math.round(h * (maxDim / w));
                                    w = maxDim;
                                } else {
                                    w = Math.round(w * (maxDim / h));
                                    h = maxDim;
                                }
                            }
                            const canvas = document.createElement('canvas');
                            canvas.width = w;
                            canvas.height = h;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, w, h);
                            ctx.drawImage(img, 0, 0, w, h);
                            resolve({
                                dataUrl: canvas.toDataURL('image/jpeg', 0.78),
                                width: w,
                                height: h
                            });
                        };
                        img.onerror = reject;
                        img.src = url;
                    });

                    const isLandscape = imgData.width > imgData.height * 1.15;
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF({
                        orientation: isLandscape ? 'landscape' : 'portrait',
                        unit: 'mm',
                        format: 'a4',
                        compress: true
                    });

                    const pageW = doc.internal.pageSize.getWidth();
                    const pageH = doc.internal.pageSize.getHeight();

                    doc.setFont('helvetica', 'bold');
                    doc.setFontSize(11);
                    doc.setTextColor(30, 41, 59);
                    doc.text(`Ranglisten-Beleg: ${cleanTitle || 'Auswärtsschiessen'}`, 12, 12);
                    doc.setFont('helvetica', 'normal');
                    doc.setFontSize(8.5);
                    doc.setTextColor(100, 116, 139);
                    const dateStr = window.UIFormatKit ? UIFormatKit.formatDate(new Date().toISOString()) : new Date().toLocaleDateString('de-CH');
                    doc.text(`Sportschützen Muhen · Erfasst am ${dateStr}`, 12, 17);

                    const availW = pageW - 24;
                    const availH = pageH - 30;
                    const ratio = Math.min(availW / imgData.width, availH / imgData.height);
                    const drawW = imgData.width * ratio;
                    const drawH = imgData.height * ratio;

                    doc.addImage(imgData.dataUrl, 'JPEG', 12, 21, drawW, drawH, undefined, 'FAST');
                    return doc.output('blob');
                }
            } catch (imgErr) {
                console.warn('[Ranglisten-Storage] Bild-zu-PDF Konvertierung fehlgeschlagen, speichere Originaldatei:', imgErr);
            }
            return file;
        }

        // 2. PDF-Dokument -> Alle Seiten bleiben 100% komplett erhalten!
        // Nur wenn die Datei > 350 KB ist, prüfen wir, ob eine Re-Komprimierung aller Seiten kleiner ausfällt.
        if ((file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) && file.size > 350 * 1024) {
            if (window.pdfjsLib && window.jspdf && window.jspdf.jsPDF) {
                try {
                    const arrayBuf = await file.arrayBuffer();
                    const pdfDoc = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
                    const numPages = pdfDoc.numPages;

                    // Nur bei überschaubarer Seitenzahl (<= 25 Seiten) im Browser neu komprimieren,
                    // alle Seiten bleiben dabei 1:1 vollständig erhalten!
                    if (numPages >= 1 && numPages <= 25) {
                        const { jsPDF } = window.jspdf;
                        let outPdf = null;

                        for (let p = 1; p <= numPages; p++) {
                            const page = await pdfDoc.getPage(p);
                            const vp1 = page.getViewport({ scale: 1.0 });
                            const isLandscape = vp1.width > vp1.height;
                            const scale = 1.35; // Gute Lesbarkeit bei kompakter Dateigrösse
                            const viewport = page.getViewport({ scale });

                            const canvas = document.createElement('canvas');
                            canvas.width = viewport.width;
                            canvas.height = viewport.height;
                            const ctx = canvas.getContext('2d');
                            ctx.fillStyle = '#ffffff';
                            ctx.fillRect(0, 0, canvas.width, canvas.height);

                            await page.render({ canvasContext: ctx, viewport }).promise;
                            const jpgData = canvas.toDataURL('image/jpeg', 0.74);

                            if (!outPdf) {
                                outPdf = new jsPDF({
                                    orientation: isLandscape ? 'landscape' : 'portrait',
                                    unit: 'pt',
                                    format: [vp1.width, vp1.height],
                                    compress: true
                                });
                            } else {
                                outPdf.addPage([vp1.width, vp1.height], isLandscape ? 'landscape' : 'portrait');
                            }

                            outPdf.addImage(jpgData, 'JPEG', 0, 0, vp1.width, vp1.height, undefined, 'FAST');
                        }

                        if (outPdf) {
                            const compressedBlob = outPdf.output('blob');
                            // Nur übernehmen, wenn die komprimierte komplette Rangliste mindestens 10% kleiner ist als das Original!
                            if (compressedBlob && compressedBlob.size < file.size * 0.90) {
                                console.log(`[Ranglisten-Storage] Vollständige PDF-Rangliste (${numPages} S.) verkleinert: ${Math.round(file.size / 1024)} KB -> ${Math.round(compressedBlob.size / 1024)} KB`);
                                return compressedBlob;
                            }
                        }
                    }
                } catch (pdfCompErr) {
                    console.warn('[Ranglisten-Storage] PDF-Komprimierung übersprungen, verwende Original-PDF 1:1:', pdfCompErr);
                }
            }
        }

        // Standard: Original-PDF 1:1 unverändert beibehalten
        return file;
    }

    /**
     * Lädt eine Rangliste (PDF oder Snip) mit sauberem Titel in den privaten Bucket `jm-ranglisten` hoch
     * und verknüpft sie sowohl in `public.jm_competition_files` als auch (falls vorhanden) in `public.group_competitions`.
     */
    async function jmUploadRanglisteToStorage(file, options = {}) {
        const supa = getSupa();
        if (!supa || !file) return null;

        const yr = Number(options.jahr || getActiveYear());
        let rawAnlass = String(options.anlassName || _jmCurrentEditingComp?.anlass_name || 'Auswaertsschiessen').trim();
        const cleanTitle = (typeof window.jmFormatCompetitionTitle === 'function')
            ? window.jmFormatCompetitionTitle(rawAnlass)
            : rawAnlass;

        const isGroupRanking = Boolean(
            options.isGroupRanking ||
            /gruppenrangliste|gruppe/i.test(file.name || '')
        );

        const cleanFilename = jmBuildCleanRanglisteFilename(cleanTitle, yr, isGroupRanking);
        const storagePath = `${yr}/${cleanFilename}`;

        try {
            const finalBlob = await jmOptimizeAndConvertToPdfBlob(file, cleanTitle);
            if (!finalBlob) return null;

            const { error: upErr } = await supa.storage
                .from(RANGLISTEN_BUCKET)
                .upload(storagePath, finalBlob, {
                    contentType: 'application/pdf',
                    upsert: true
                });

            if (upErr) throw upErr;

            const fileMeta = {
                title: isGroupRanking ? `Gruppenrangliste – ${cleanTitle}` : `Rangliste – ${cleanTitle}`,
                filename: cleanFilename,
                storage_bucket: RANGLISTEN_BUCKET,
                storage_path: storagePath,
                size_kb: Math.max(1, Math.round(finalBlob.size / 1024)),
                is_group_ranking: isGroupRanking,
                uploaded_at: new Date().toISOString()
            };

            // 1. In public.jm_competition_files persistieren
            const normKey = normalizeAnlassKey(cleanTitle);
            await jmLoadCompetitionFiles(yr);
            const existingFiles = Array.isArray(window._jmCompetitionFilesMap[normKey])
                ? window._jmCompetitionFilesMap[normKey]
                : [];
            const updatedCatalogFiles = [
                ...existingFiles.filter(f => f.storage_path !== storagePath),
                fileMeta
            ];
            window._jmCompetitionFilesMap[normKey] = updatedCatalogFiles;

            await supa
                .from('jm_competition_files')
                .upsert({
                    jahr: yr,
                    anlass_name: cleanTitle,
                    files: updatedCatalogFiles,
                    updated_at: new Date().toISOString()
                }, { onConflict: 'jahr,anlass_name' });

            // 2. Falls passende group_competitions existieren (oder compId übergeben wurde), dort ebenfalls eintragen
            const matchingComps = (window._jmGroupCompetitions || []).filter(c =>
                (options.compId && String(c.id) === String(options.compId)) ||
                normalizeAnlassKey(c.anlass_name) === normKey
            );

            for (const comp of matchingComps) {
                const merged = [
                    ...(Array.isArray(comp.ranglisten_files) ? comp.ranglisten_files.filter(f => f.storage_path !== storagePath) : []),
                    fileMeta
                ];
                comp.ranglisten_files = merged;
                if (comp.id) {
                    await supa
                        .from('group_competitions')
                        .update({ ranglisten_files: merged })
                        .eq('id', comp.id);
                }
            }

            if (_jmCurrentEditingComp && normalizeAnlassKey(_jmCurrentEditingComp.anlass_name) === normKey) {
                _jmCurrentEditingComp.ranglisten_files = getMergedRanglistenForComp(_jmCurrentEditingComp);
                renderEditorRanglistenFiles(_jmCurrentEditingComp);
            }

            return fileMeta;
        } catch (err) {
            console.error('[Ranglisten-Storage] Fehler beim Hochladen der Rangliste:', err);
            return null;
        }
    }

    /**
     * Erzeugt einen kryptografisch signierten Direktlink (Standard: 180 Tage gültig = 15'552'000 Sekunden).
     */
    async function jmGetSignedRanglisteUrl(fileObj, expiresInSeconds = SIGNED_URL_EXPIRES_SECONDS) {
        const supa = getSupa();
        if (!supa || !fileObj || !fileObj.storage_path) return null;
        const bucket = fileObj.storage_bucket || RANGLISTEN_BUCKET;
        try {
            const { data, error } = await supa.storage
                .from(bucket)
                .createSignedUrl(fileObj.storage_path, expiresInSeconds);
            if (error) throw error;
            return data?.signedUrl || null;
        } catch (err) {
            console.warn('[Ranglisten-Storage] Konnte Signed URL nicht erstellen:', err);
            return null;
        }
    }

    /**
     * Öffnet eine gespeicherte Rangliste in einem neuen Browser-Tab.
     */
    async function jmOpenRanglisteFile(bucket, storagePath) {
        const url = await jmGetSignedRanglisteUrl({
            storage_bucket: bucket || RANGLISTEN_BUCKET,
            storage_path: storagePath
        }, SIGNED_URL_EXPIRES_SECONDS);

        if (url) {
            window.open(url, '_blank', 'noopener');
        } else if (window.UIConfirmKit) {
            await UIConfirmKit.alert({
                title: 'Rangliste nicht abrufbar',
                message: 'Der Link zur Rangliste konnte nicht generiert werden. Bitte prüfe deine Verbindung.',
                type: 'warning'
            });
        }
    }

    /**
     * Rendert die verknüpften Ranglisten im Gruppengewinn-Editor (#jme-ranglisten-list).
     */
    function renderEditorRanglistenFiles(comp) {
        const container = document.getElementById('jme-ranglisten-list');
        if (!container) return;

        const files = getMergedRanglistenForComp(comp);
        if (!files || files.length === 0) {
            container.innerHTML = `<span class="text-muted small fst-italic">Noch keine Rangliste für diesen Anlass hinterlegt. Du kannst oben eine PDF-Rangliste oder einen Screenshot hochladen.</span>`;
            return;
        }

        container.innerHTML = files.map(rf => `
            <div class="badge bg-light text-dark border px-2.5 py-1.5 d-inline-flex align-items-center gap-2" style="font-size: 11.5px;">
                <i class="fas fa-file-pdf text-danger fa-lg"></i>
                <div class="text-start">
                    <div class="fw-semibold">${escapeHtml(rf.filename || rf.title || 'Rangliste.pdf')}</div>
                    <div class="text-muted" style="font-size: 9.5px;">${rf.size_kb || '?'} KB · Vollständige Rangliste (180-Tage-Link bereit)</div>
                </div>
                <button type="button" class="btn btn-xs btn-outline-primary ms-1 py-0 px-1.5" onclick="window.jmOpenRanglisteFile('${escapeHtml(rf.storage_bucket || RANGLISTEN_BUCKET)}', '${escapeHtml(rf.storage_path)}')" title="Rangliste im neuen Tab öffnen">
                    <i class="fas fa-external-link-alt"></i> Öffnen
                </button>
            </div>
        `).join('');
    }

    /**
     * Datei-Upload aus dem Gruppengewinn-Editor (#jme-rangliste-file-input).
     */
    async function jmHandleEditorRanglisteUpload(fileList) {
        if (!fileList || fileList.length === 0) return;
        const file = fileList[0];
        const anlass = (document.getElementById('jme-anlass')?.value || _jmCurrentEditingComp?.anlass_name || '').trim();
        if (!anlass) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Anlass wählen',
                    message: 'Bitte wähle zuerst oben den Anlass / das Schiessen aus, damit die Rangliste einen sauberen Titel erhält.',
                    type: 'warning'
                });
            }
            return;
        }

        const meta = await jmUploadRanglisteToStorage(file, {
            jahr: _jmCurrentEditingComp?.jahr || getActiveYear(),
            anlassName: anlass,
            compId: _jmCurrentEditingComp?.id || null
        });

        const inputEl = document.getElementById('jme-rangliste-file-input');
        if (inputEl) inputEl.value = '';

        if (meta) {
            renderEditorRanglistenFiles(_jmCurrentEditingComp);
            if (typeof showSuccess === 'function') {
                showSuccess(`Rangliste «${meta.filename}» (${meta.size_kb} KB) gespeichert!`);
            }
        }
    }

    /**
     * Direkt-Upload einer Rangliste aus der Haupttabelle (#jm-gg-main-table).
     */
    function jmTriggerQuickRanglisteUpload(compId) {
        const comp = (window._jmGroupCompetitions || []).find(c => String(c.id) === String(compId));
        if (!comp) return;

        let tempInput = document.getElementById('jm-gg-quick-rangliste-input');
        if (!tempInput) {
            tempInput = document.createElement('input');
            tempInput.type = 'file';
            tempInput.id = 'jm-gg-quick-rangliste-input';
            tempInput.className = 'd-none';
            tempInput.accept = '.pdf,image/*';
            document.body.appendChild(tempInput);
        }

        tempInput.onchange = async function () {
            if (!this.files || this.files.length === 0) return;
            const file = this.files[0];
            const meta = await jmUploadRanglisteToStorage(file, {
                jahr: comp.jahr || getActiveYear(),
                anlassName: comp.anlass_name,
                compId: comp.id
            });
            this.value = '';
            if (meta) {
                if (typeof showSuccess === 'function') {
                    showSuccess(`Rangliste «${meta.filename}» (${meta.size_kb} KB) erfolgreich hinterlegt!`);
                }
                await jmRenderGruppengewinneList(comp.jahr || getActiveYear());
            }
        };
        tempInput.click();
    }

    /**
     * Erzeugt das persönliche Übersichts-PDF «Zusammensetzung_Gruppengewinne_<Jahr>.pdf»
     * für einen einzelnen Schützen inkl. anklickbaren 180-Tage-Direktlinks auf die Ranglisten.
     */
    function jmGenerateShooterGruppengewinnePdfAttachment(supp) {
        if (!supp || !supp.hasCredits || !Array.isArray(supp.items) || supp.items.length === 0) {
            return null;
        }
        if (!window.jspdf || !window.jspdf.jsPDF) {
            console.warn('[Gruppengewinne-PDF] jsPDF ist nicht verfügbar.');
            return null;
        }

        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
            const yr = supp.year || new Date().getFullYear();
            const fmtCurr = (window.UIFormatKit && typeof UIFormatKit.formatCurrency === 'function')
                ? UIFormatKit.formatCurrency
                : (v => `CHF ${Number(v || 0).toFixed(2)}`);
            const todayStr = (window.UIFormatKit && typeof UIFormatKit.formatDate === 'function')
                ? UIFormatKit.formatDate(new Date().toISOString().slice(0, 10))
                : new Date().toLocaleDateString('de-CH');

            // 1. Kopfbereich Sportschützen Muhen
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(15);
            doc.setTextColor(15, 58, 93);
            doc.text('SPORTSCHÜTZEN MUHEN', 15, 17);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8.5);
            doc.setTextColor(100, 116, 139);
            doc.text('Gegründet 1928 · 5037 Muhen · www.sportschuetzen-muhen.ch', 15, 22);

            // 2. Dokument-Titel & Untertitel
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(13);
            doc.setTextColor(15, 23, 42);
            doc.text(`Zusammensetzung Gruppengewinne ${yr} (Konto 1301)`, 15, 32);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9);
            doc.setTextColor(71, 85, 105);
            doc.text(
                `Beiblatt zur Jahresbeitrags-Rechnung ${yr} · Schütze: ${supp.shooterName || supp.personNumber || ''} · Stand: ${todayStr}`,
                15,
                37.5
            );

            // 3. Info-Box oben
            doc.setDrawColor(203, 213, 225);
            doc.setFillColor(248, 250, 252);
            doc.roundedRect(15, 41, 180, 16, 2, 2, 'FD');

            doc.setFont('helvetica', 'bold');
            doc.setFontSize(9);
            doc.setTextColor(30, 41, 59);
            doc.text(`Schütze:`, 19, 47);
            doc.setFont('helvetica', 'normal');
            doc.text(`${supp.shooterName || '-'} (Mitglied-Nr. ${supp.personNumber || '-'})`, 42, 47);

            doc.setFont('helvetica', 'bold');
            doc.text(`Anzahl Gruppenschiessen:`, 19, 53);
            doc.setFont('helvetica', 'normal');
            doc.text(`${supp.items.length} Anlass/Anlässe mit Gewinnanteil`, 62, 53);

            doc.setFont('helvetica', 'bold');
            doc.setTextColor(21, 128, 61);
            doc.text(`Total Gutschrift ${yr}:`, 120, 47);
            doc.text(`- ${fmtCurr(supp.totalShare)}`, 162, 47);

            doc.setFont('helvetica', 'normal');
            doc.setFontSize(8);
            doc.setTextColor(71, 85, 105);
            doc.text(`Ranglisten-Links gültig bis: ${supp.validUntilStr}`, 120, 53);

            // 4. Tabelle der einzelnen Gruppenschiessen
            const tableRows = supp.items.map((it, idx) => {
                const rangStr = it.rang ? ` · ${it.rang}. Rang` : '';
                const grpPtsStr = it.gruppeTotalPunkte ? `${it.gruppeTotalPunkte} Pkt.` : '-';
                const anlassHeader = it.isEinzelOnly || (it.grpAmt === 0 && it.einzelAmt > 0)
                    ? `${it.anlassName}\nEinzelwertung${it.stichName ? ` (${it.stichName})` : ''}`
                    : `${it.anlassName}\nGruppe «${it.gruppeName}»${rangStr} · Total: ${grpPtsStr}\nTeam: ${it.teamPlain}`;
                const myPtsStr = it.schuetzePunkte ? `${it.schuetzePunkte} Pkt.` : '-';
                const calcBlock = (it.isEinzelOnly || (it.grpAmt === 0 && it.einzelAmt > 0))
                    ? `${it.stichName || 'Einzelgewinn'}: ${fmtCurr(it.einzelAmt || it.schuetzeAnteil)}`
                    : `Brutto: ${fmtCurr(it.gewinnBrutto)}\n./. Doppel: ${fmtCurr(it.abzugDoppel)}\nNetto: ${fmtCurr(it.nettoUeberschuss)}${it.einzelAmt > 0 ? `\n+ ${it.stichName || 'Einzel'}: ${fmtCurr(it.einzelAmt)}` : ''}`;
                const shareSub = it.shareSubLabelPlain || `(1/${it.anzahlSchuetzen} Anteil)`;
                const shareBlock = `- ${fmtCurr(it.schuetzeAnteil)}\n${shareSub}`;
                const linkLabels = (it.links && it.links.length > 0)
                    ? it.links.map(lk => `> ${lk.label} öffnen`).join('\n')
                    : '-';

                return [
                    String(idx + 1),
                    anlassHeader,
                    myPtsStr,
                    calcBlock,
                    shareBlock,
                    linkLabels
                ];
            });

            if (typeof doc.autoTable === 'function') {
                doc.autoTable({
                    startY: 61,
                    margin: { left: 15, right: 15 },
                    head: [['#', 'Anlass / Gruppe & Team', 'Deine Pkt.', 'Gruppenabrechnung', 'Deine Gutschrift', 'Rangliste (Link)']],
                    body: tableRows,
                    foot: [[
                        '',
                        `Total Gutschrift Gruppengewinne ${yr} (auf Jahresbeitrags-Rechnung abgezogen):`,
                        '',
                        '',
                        `- ${fmtCurr(supp.totalShare)}`,
                        ''
                    ]],
                    theme: 'grid',
                    styles: {
                        font: 'helvetica',
                        fontSize: 8.2,
                        cellPadding: 2.5,
                        textColor: [30, 41, 59],
                        lineColor: [203, 213, 225],
                        lineWidth: 0.2,
                        valign: 'top'
                    },
                    headStyles: {
                        fillColor: [15, 58, 93],
                        textColor: [255, 255, 255],
                        fontStyle: 'bold',
                        fontSize: 8.2
                    },
                    footStyles: {
                        fillColor: [240, 253, 244],
                        textColor: [20, 83, 45],
                        fontStyle: 'bold',
                        fontSize: 9
                    },
                    columnStyles: {
                        0: { cellWidth: 8, halign: 'center' },
                        1: { cellWidth: 68 },
                        2: { cellWidth: 18, halign: 'center', fontStyle: 'bold' },
                        3: { cellWidth: 34, halign: 'right' },
                        4: { cellWidth: 25, halign: 'right', fontStyle: 'bold', textColor: [21, 128, 61] },
                        5: { cellWidth: 27, halign: 'left', textColor: [29, 78, 216], fontStyle: 'bold' }
                    },
                    didDrawCell: function (data) {
                        // Klickbare 180-Tage-Links direkt in der PDF-Zelle hinterlegen
                        if (data.section === 'body' && data.column.index === 5) {
                            const item = supp.items[data.row.index];
                            if (item && Array.isArray(item.links) && item.links.length > 0) {
                                const slotH = data.cell.height / item.links.length;
                                item.links.forEach((lk, lIdx) => {
                                    if (lk && lk.url) {
                                        doc.link(
                                            data.cell.x,
                                            data.cell.y + (lIdx * slotH),
                                            data.cell.width,
                                            slotH,
                                            { url: lk.url }
                                        );
                                    }
                                });
                            }
                        }
                    }
                });
            }

            const finalY = (doc.lastAutoTable && doc.lastAutoTable.finalY) ? doc.lastAutoTable.finalY + 6 : 160;
            if (finalY < 268) {
                doc.setDrawColor(191, 219, 254);
                doc.setFillColor(239, 246, 255);
                doc.roundedRect(15, finalY, 180, 16, 2, 2, 'FD');

                doc.setFont('helvetica', 'bold');
                doc.setFontSize(8.2);
                doc.setTextColor(30, 58, 138);
                doc.text('Hinweis zu den Ranglisten-Links (180 Tage gültig):', 18, finalY + 5.5);

                doc.setFont('helvetica', 'normal');
                doc.setFontSize(7.8);
                doc.text(
                    `Die vollständigen PDF-Ranglisten sind über die blauen Links in der rechten Spalte (sowie direkt im E-Mail-Text) bis am ${supp.validUntilStr} abrufbar.`,
                    18,
                    finalY + 11
                );
            }

            const dataUri = doc.output('datauristring');
            const base64Content = String(dataUri || '').split(',')[1] || '';
            if (!base64Content) return null;

            const filename = `Zusammensetzung_Gruppengewinne_${yr}.pdf`;
            const approxBytes = Math.round((base64Content.length * 3) / 4);
            return {
                name: filename,
                filename: filename,
                content: base64Content,
                contentBase64: base64Content,
                contentType: 'application/pdf',
                size: approxBytes
            };
        } catch (err) {
            console.warn('[Gruppengewinne-PDF] Konnte Zusammensetzung-PDF nicht generieren:', err);
            return null;
        }
    }

    /**
     * Erstellt die persönliche Einzelberechnung je Schütze inkl. 180 Tage gültigen Direktlinks
     * zu allen hinterlegten Ranglisten (Ranglisten als Link, plus PDF «Zusammensetzung_Gruppengewinne_<Jahr>.pdf» als Anhang).
     *
     * @param {number|string} personNumber - Lizenz-/Personennummer des Schützen
     * @param {number|string} year - Beitrags-/Saisonjahr (z. B. 2026)
     * @returns {Promise<{hasCredits: boolean, personNumber: string, shooterName: string, year: number, totalShare: number, items: Array, validUntilStr: string, htmlBlock: string, textBlock: string, pdfAttachment: Object|null}>}
     */
    async function jmBuildShooterGruppengewinneMailSupplement(personNumber, year) {
        const yr = parseInt(year || getActiveYear(), 10) || new Date().getFullYear();
        const pnStr = String(personNumber || '').trim();
        const emptyResult = {
            hasCredits: false,
            personNumber: pnStr,
            shooterName: '',
            year: yr,
            totalShare: 0,
            items: [],
            validUntilStr: '',
            htmlBlock: '',
            textBlock: '',
            pdfAttachment: null
        };
        if (!pnStr) return emptyResult;

        // Immer frisch aus Supabase nachladen, damit soeben hochgeladene Ranglisten oder Mutationen sofort enthalten sind
        await jmLoadGroupCompetitions(yr);

        const fmtCurr = (window.UIFormatKit && typeof UIFormatKit.formatCurrency === 'function')
            ? UIFormatKit.formatCurrency
            : (v => `CHF ${Number(v || 0).toFixed(2)}`);

        const comps = window._jmGroupCompetitions || [];
        const shooterItems = [];
        let shooterName = '';
        let totalShare = 0;

        for (const comp of comps) {
            if (Number(comp.jahr) !== yr) continue;
            const members = Array.isArray(comp.members) ? comp.members : [];
            const myMember = members.find(m => String(m.person_number || '').trim() === pnStr);
            if (!myMember) continue;

            const typ = comp.anlass_typ || 'gruppe';
            const isEinzelOnly = typ === 'einzel';
            const doppel = isEinzelOnly ? 0 : Number(comp.gruppendoppel || 30);
            const gewinn = isEinzelOnly ? 0 : Number(comp.gruppengewinn || 0);
            const ueberschuss = isEinzelOnly ? 0 : Math.max(0, gewinn - doppel);
            const groupMembers = isEinzelOnly ? members : getEffectiveGroupMembers(members);
            const count = groupMembers.length > 0 ? groupMembers.length : Number(comp.anzahl_schuetzen || 5);
            const defaultPerShooter = (!isEinzelOnly && count > 0 && ueberschuss > 0) ? (Math.round((ueberschuss / count) * 20) / 20) : 0;
            const split = getMemberSplitAmounts(myMember, comp, defaultPerShooter);
            const myShare = split.totalAmt;

            // Nur Schiessen mit effektiver Gutschrift (oder Verrechnung auf Jahresbeitrag) aufführen
            if (myShare <= 0) continue;
            if (myMember.payout_method && myMember.payout_method !== 'jahresbeitrag') continue;

            if (!shooterName && myMember.schuetze_name) {
                shooterName = myMember.schuetze_name;
            }

            // Alle Teamkollegen der Gruppe mit Punktzahl formatieren
            const sortedTeam = [...groupMembers].sort((a, b) => (Number(b.punkte) || 0) - (Number(a.punkte) || 0));
            const teamSummary = sortedTeam.map(tm => {
                const isMe = String(tm.person_number || '').trim() === pnStr;
                const pStr = tm.punkte ? ` (${tm.punkte})` : '';
                return isMe ? `<strong>${escapeHtml(tm.schuetze_name)}${pStr}</strong>` : `${escapeHtml(tm.schuetze_name)}${pStr}`;
            }).join(', ');
            const teamSummaryPlain = sortedTeam.map(tm => `${tm.schuetze_name}${tm.punkte ? ' (' + tm.punkte + ')' : ''}`).join(', ');

            const calcPtsSum = computeGroupPointsTotal(members, typ);
            const totalPts = comp.punkte_total || (calcPtsSum > 0 ? calcPtsSum : null);

            const stichName = String(myMember.stich_name || '').trim();
            let shareSubLabelPlain = `(1/${count} Anteil)`;
            if (split.grpAmt > 0 && split.einzelAmt > 0) {
                shareSubLabelPlain = `Gruppe (1/${count}): ${fmtCurr(split.grpAmt)}\n+ ${stichName || 'Einzel'}: ${fmtCurr(split.einzelAmt)}`;
            } else if (split.einzelAmt > 0 && split.grpAmt === 0) {
                shareSubLabelPlain = `Einzelgewinn${stichName ? ` (${stichName})` : ''}`;
            }

            // Für alle hinterlegten Ranglisten dieses Schiessens 180-Tage-Links generieren (keine Ranglisten-PDF-Anhänge)
            const rangFiles = getMergedRanglistenForComp(comp);
            const signedLinks = [];
            for (const rf of rangFiles) {
                const signedUrl = await jmGetSignedRanglisteUrl(rf, SIGNED_URL_EXPIRES_SECONDS);
                if (signedUrl) {
                    signedLinks.push({
                        label: rf.is_group_ranking ? 'Gruppenrangliste (PDF)' : 'Rangliste (PDF)',
                        filename: rf.filename || rf.title || 'Rangliste.pdf',
                        sizeKb: rf.size_kb || null,
                        url: signedUrl
                    });
                }
            }

            totalShare += myShare;
            shooterItems.push({
                compId: comp.id,
                anlassName: comp.anlass_name,
                gruppeName: comp.gruppe_name || 'Strohaus',
                isEinzelOnly,
                stichName,
                grpAmt: split.grpAmt,
                einzelAmt: split.einzelAmt,
                shareSubLabelPlain,
                rang: comp.rang || null,
                gruppeTotalPunkte: totalPts,
                schuetzePunkte: myMember.punkte || null,
                gewinnBrutto: gewinn,
                abzugDoppel: doppel,
                nettoUeberschuss: ueberschuss,
                anzahlSchuetzen: count,
                schuetzeAnteil: myShare,
                teamHtml: teamSummary,
                teamPlain: teamSummaryPlain,
                links: signedLinks
            });
        }

        if (shooterItems.length === 0 || totalShare <= 0) {
            return emptyResult;
        }

        totalShare = Math.round(totalShare * 20) / 20;

        // Ablaufdatum (+180 Tage) im Schweizer Format DD.MM.YYYY berechnen
        const expiryDate = new Date(Date.now() + SIGNED_URL_EXPIRES_SECONDS * 1000);
        const expiryIso = expiryDate.toISOString().slice(0, 10);
        const validUntilStr = (window.UIFormatKit && typeof UIFormatKit.formatDate === 'function')
            ? UIFormatKit.formatDate(expiryIso)
            : expiryDate.toLocaleDateString('de-CH');

        // HTML-Einzelberechnung + 180-Tage-Links (Ranglisten als Links)
        const rowsHtml = shooterItems.map(it => {
            const rangStr = it.rang ? ` · ${it.rang}. Rang` : '';
            const grpPtsStr = it.gruppeTotalPunkte ? `${it.gruppeTotalPunkte} Pkt.` : '–';
            const myPtsStr = it.schuetzePunkte ? `<strong>${it.schuetzePunkte} Pkt.</strong>` : '–';
            const linksHtml = it.links.length > 0
                ? it.links.map(lk => `<a href="${escapeHtml(lk.url)}" target="_blank" rel="noopener noreferrer" style="display:inline-block; padding:3px 8px; margin:2px 0; background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:4px; text-decoration:none; font-weight:600; font-size:11.5px;">📄 ${escapeHtml(lk.label)} öffnen</a>`).join('<br>')
                : `<span style="color:#94a3b8; font-size:11px;">–</span>`;

            const isPureEinzelForMe = it.isEinzelOnly || (it.grpAmt === 0 && it.einzelAmt > 0);
            const anlassDetailHtml = isPureEinzelForMe
                ? `<div style="font-size:11.5px; color:#475569; margin-top:2px;">Einzelwertung${it.stichName ? ` (${escapeHtml(it.stichName)})` : ''}</div>`
                : `<div style="font-size:11.5px; color:#475569; margin-top:2px;">Gruppe «${escapeHtml(it.gruppeName)}»${escapeHtml(rangStr)} · Total: ${escapeHtml(grpPtsStr)}</div>
                   <div style="font-size:11px; color:#64748b; margin-top:3px;">Gruppe: ${it.teamHtml}</div>`;

            const calcHtml = isPureEinzelForMe
                ? `<div style="font-weight:600; color:#0f172a;">${escapeHtml(it.stichName || 'Einzelgewinn')}: ${escapeHtml(fmtCurr(it.einzelAmt || it.schuetzeAnteil))}</div>`
                : `<div>Brutto: ${escapeHtml(fmtCurr(it.gewinnBrutto))}</div>
                   <div style="color:#64748b; font-size:11px;">./. Doppel: ${escapeHtml(fmtCurr(it.abzugDoppel))}</div>
                   <div style="font-weight:600; color:#0f172a; margin-top:2px;">Netto: ${escapeHtml(fmtCurr(it.nettoUeberschuss))}</div>
                   ${it.einzelAmt > 0 ? `<div style="color:#15803d; font-size:11px; margin-top:2px;">+ ${escapeHtml(it.stichName || 'Einzel')}: ${escapeHtml(fmtCurr(it.einzelAmt))}</div>` : ''}`;

            const shareSubHtml = escapeHtml(it.shareSubLabelPlain).replace(/\n/g, '<br>');

            return `
                <tr>
                    <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0; vertical-align:top;">
                        <div style="font-weight:700; color:#0f172a;">${escapeHtml(it.anlassName)}</div>
                        ${anlassDetailHtml}
                    </td>
                    <td style="padding:8px 8px; border-bottom:1px solid #e2e8f0; text-align:center; vertical-align:top; white-space:nowrap;">${myPtsStr}</td>
                    <td style="padding:8px 8px; border-bottom:1px solid #e2e8f0; text-align:right; vertical-align:top; white-space:nowrap; font-size:12px; color:#334155;">
                        ${calcHtml}
                    </td>
                    <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0; text-align:right; vertical-align:top; white-space:nowrap; font-weight:700; color:#15803d; font-size:13px;">
                        - ${escapeHtml(fmtCurr(it.schuetzeAnteil))}
                        <div style="font-size:10.5px; font-weight:400; color:#64748b;">${shareSubHtml}</div>
                    </td>
                    <td style="padding:8px 10px; border-bottom:1px solid #e2e8f0; text-align:center; vertical-align:top;">
                        ${linksHtml}
                    </td>
                </tr>
            `;
        }).join('');

        const htmlBlock = `
            <div style="margin:22px 0 18px 0; border:1px solid #cbd5e1; border-radius:8px; overflow:hidden; background:#ffffff; font-family:Arial, sans-serif;">
                <div style="background:#f8fafc; padding:10px 14px; border-bottom:1px solid #cbd5e1;">
                    <div style="font-weight:700; font-size:14px; color:#0f172a;">🏆 Deine persönliche Einzelberechnung Gruppengewinne ${yr} (Konto 1301)</div>
                    <div style="font-size:12px; color:#475569; margin-top:2px;">Aufstellung deiner gutgeschriebenen Gewinnanteile aus auswärtigen Gruppenschiessen inkl. direktem Zugriff auf die kompletten Ranglisten (auch als PDF «Zusammensetzung_Gruppengewinne_${yr}.pdf» im Anhang):</div>
                </div>
                <table style="width:100%; border-collapse:collapse; font-size:12.5px;">
                    <thead>
                        <tr style="background:#f1f5f9; color:#334155; font-size:11.5px; text-transform:uppercase;">
                            <th style="padding:7px 10px; text-align:left; border-bottom:1px solid #cbd5e1;">Anlass / Gruppe & Team</th>
                            <th style="padding:7px 8px; text-align:center; border-bottom:1px solid #cbd5e1;">Deine Pkt.</th>
                            <th style="padding:7px 8px; text-align:right; border-bottom:1px solid #cbd5e1;">Gruppenabrechnung</th>
                            <th style="padding:7px 10px; text-align:right; border-bottom:1px solid #cbd5e1;">Deine Gutschrift</th>
                            <th style="padding:7px 10px; text-align:center; border-bottom:1px solid #cbd5e1;">Rangliste (Link)</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                    <tfoot>
                        <tr style="background:#f0fdf4; font-weight:700; color:#14532d;">
                            <td colspan="3" style="padding:9px 10px; text-align:right; border-top:2px solid #bbf7d0;">Total Gutschrift Gruppengewinne ${yr} (auf deiner Rechnung abgezogen):</td>
                            <td style="padding:9px 10px; text-align:right; border-top:2px solid #bbf7d0; font-size:13.5px; white-space:nowrap;">- ${escapeHtml(fmtCurr(totalShare))}</td>
                            <td style="padding:9px 10px; border-top:2px solid #bbf7d0;"></td>
                        </tr>
                    </tfoot>
                </table>
                <div style="background:#eff6ff; padding:9px 14px; border-top:1px solid #bfdbfe; font-size:11.5px; color:#1e3a8a; line-height:1.45;">
                    🔒 <strong>Hinweis zu den Ranglisten-Links:</strong> Um dein E-Mail-Postfach zu schonen, werden die vollständigen Ranglisten über geschützte Direktlinks bereitgestellt. Die Links sind ab Versand während <strong>180 Tagen (bis am ${escapeHtml(validUntilStr)})</strong> gültig. Die Übersicht findest du zusätzlich als PDF <strong>Zusammensetzung_Gruppengewinne_${yr}.pdf</strong> im Anhang.
                </div>
            </div>
        `;

        // Plain-Text-Block für E-Mail-Text-Fallback und Vorschau-Textarea
        const textLines = [
            `------------------------------------------------------------------------`,
            `DEINE EINZELBERECHNUNG GRUPPENGEWINNE ${yr} (KONTO 1301)`,
            `------------------------------------------------------------------------`
        ];
        shooterItems.forEach((it, idx) => {
            const rangTxt = it.rang ? `, ${it.rang}. Rang` : '';
            const totTxt = it.gruppeTotalPunkte ? `, Total ${it.gruppeTotalPunkte} Pkt.` : '';
            const myPtsTxt = it.schuetzePunkte ? `${it.schuetzePunkte} Pkt.` : '-';
            const isPureEinzelForMe = it.isEinzelOnly || (it.grpAmt === 0 && it.einzelAmt > 0);
            const shareSubTxt = it.shareSubLabelPlain.replace(/\n/g, ' ');

            if (isPureEinzelForMe) {
                textLines.push(
                    `${idx + 1}. ${it.anlassName} – Einzelwertung (${myPtsTxt} von dir)`,
                    `   -> Dein gutgeschriebener ${shareSubTxt}: -${fmtCurr(it.schuetzeAnteil)}`
                );
            } else {
                textLines.push(
                    `${idx + 1}. ${it.anlassName} – Gruppe «${it.gruppeName}» (${myPtsTxt} von dir${rangTxt}${totTxt})`,
                    `   Gruppengewinn Brutto: ${fmtCurr(it.gewinnBrutto)} | Abzug Doppel Verein: -${fmtCurr(it.abzugDoppel)} | Überschuss: ${fmtCurr(it.nettoUeberschuss)}`,
                    `   -> Dein gutgeschriebener Anteil (${shareSubTxt}): -${fmtCurr(it.schuetzeAnteil)}`,
                    `   -> Gruppe: ${it.teamPlain}`
                );
            }
            if (it.links && it.links.length > 0) {
                it.links.forEach(lk => {
                    textLines.push(`   -> ${lk.label} (Link 180 Tage gültig bis ${validUntilStr}): ${lk.url}`);
                });
            }
            textLines.push('');
        });
        textLines.push(
            `TOTAL GUTSCHRIFT GRUPPENGEWINNE ${yr}: -${fmtCurr(totalShare)}`,
            `Hinweis: Die Direktlinks auf die kompletten Ranglisten sind während 180 Tagen (bis ${validUntilStr}) gültig.`,
            `Die Übersicht liegt dieser E-Mail zudem als PDF «Zusammensetzung_Gruppengewinne_${yr}.pdf» bei.`,
            `------------------------------------------------------------------------`
        );

        const resultObj = {
            hasCredits: true,
            personNumber: pnStr,
            shooterName: shooterName,
            year: yr,
            totalShare: totalShare,
            items: shooterItems,
            validUntilStr: validUntilStr,
            htmlBlock: htmlBlock,
            textBlock: textLines.join('\n'),
            pdfAttachment: null
        };

        resultObj.pdfAttachment = jmGenerateShooterGruppengewinnePdfAttachment(resultObj);
        return resultObj;
    }

    /**
     * Lädt das PDF «Zusammensetzung_Gruppengewinne_<Jahr>.pdf» für einen Schützen direkt im Browser herunter.
     */
    async function jmDownloadShooterGruppengewinnePdf(personNumber, year) {
        const supp = await jmBuildShooterGruppengewinneMailSupplement(personNumber, year);
        if (!supp || !supp.hasCredits || !supp.pdfAttachment) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Kein Übersichts-PDF verfügbar',
                    message: 'Für dieses Mitglied konnten keine Gruppengewinn-Gutschriften gefunden werden.',
                    type: 'warning'
                });
            }
            return;
        }
        const linkSource = `data:application/pdf;base64,${supp.pdfAttachment.content}`;
        const downloadLink = document.createElement('a');
        downloadLink.href = linkSource;
        downloadLink.download = supp.pdfAttachment.filename;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        downloadLink.remove();
    }

    /**
     * Öffnet ein übersichtliches Vorschau-Modal mit der persönlichen Einzelberechnung je Schütze
     * und den 180-Tage-Links auf die Ranglisten (z. B. aus dem Jahresbeitrags-Inspektor).
     */
    async function jmOpenShooterGruppengewinnePreviewModal(personNumber, year) {
        const supp = await jmBuildShooterGruppengewinneMailSupplement(personNumber, year);
        if (!supp.hasCredits) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Keine Gruppengewinne gefunden',
                    message: `Für dieses Mitglied sind im Jahr ${year || getActiveYear()} keine Gruppengewinn-Gutschriften (Konto 1301) hinterlegt.`,
                    type: 'info'
                });
            }
            return;
        }

        let modalEl = document.getElementById('jmShooterGgSupplementModal');
        if (modalEl) modalEl.remove();

        modalEl = document.createElement('div');
        modalEl.id = 'jmShooterGgSupplementModal';
        modalEl.className = 'modal fade';
        modalEl.tabIndex = -1;
        modalEl.innerHTML = `
            <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content shadow-lg border-0">
                    <div class="modal-header bg-dark text-white py-2.5 px-3">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-warning text-dark"><i class="fas fa-trophy"></i></span>
                            <div>
                                <h6 class="modal-title fw-bold mb-0">Einzelberechnung & 180-Tage Ranglisten-Links · ${escapeHtml(supp.shooterName || String(personNumber))}</h6>
                                <div class="small text-white-50">Wird beim E-Mail-Versand des Jahresbeitrags ${supp.year} im Mail eingeblendet & als PDF «Zusammensetzung_Gruppengewinne_${supp.year}.pdf» angehängt</div>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <div class="modal-body p-3 bg-light">
                        ${supp.htmlBlock}
                    </div>
                    <div class="modal-footer py-2 px-3 bg-white d-flex justify-content-between">
                        <button type="button" class="btn btn-sm btn-outline-primary fw-semibold" onclick="window.jmDownloadShooterGruppengewinnePdf('${escapeHtml(String(personNumber))}', ${supp.year})">
                            <i class="fas fa-file-pdf text-danger me-1"></i>Zusammensetzung_Gruppengewinne_${supp.year}.pdf herunterladen
                        </button>
                        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Schliessen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modalEl);
        const bsModal = bootstrap.Modal.getOrCreateInstance(modalEl);
        bsModal.show();
    }

    // Globale Exports am window-Objekt
    window.jmBuildCleanRanglisteFilename = jmBuildCleanRanglisteFilename;
    window.jmOptimizeAndConvertToPdfBlob = jmOptimizeAndConvertToPdfBlob;
    window.jmUploadRanglisteToStorage = jmUploadRanglisteToStorage;
    window.jmGetSignedRanglisteUrl = jmGetSignedRanglisteUrl;
    window.jmOpenRanglisteFile = jmOpenRanglisteFile;
    window.jmHandleEditorRanglisteUpload = jmHandleEditorRanglisteUpload;
    window.jmTriggerQuickRanglisteUpload = jmTriggerQuickRanglisteUpload;
    window.jmGenerateShooterGruppengewinnePdfAttachment = jmGenerateShooterGruppengewinnePdfAttachment;
    window.jmBuildShooterGruppengewinneMailSupplement = jmBuildShooterGruppengewinneMailSupplement;
    window.jmDownloadShooterGruppengewinnePdf = jmDownloadShooterGruppengewinnePdf;
    window.jmOpenShooterGruppengewinnePreviewModal = jmOpenShooterGruppengewinnePreviewModal;
    window.jmOnAnlassSelectChange = jmOnAnlassSelectChange;
    window.jmOnAnlassInputChange = jmOnAnlassInputChange;
    window.jmClearAnlassInput = jmClearAnlassInput;
    window.jmToggleCustomAnlassInput = jmToggleCustomAnlassInput;
    window.jmToggleGridShooterInEditor = jmToggleGridShooterInEditor;
    window.jmPopulateShootersFromJMRawGrid = jmPopulateShootersFromJMRawGrid;
    window.jmOpenGruppengewinneModal = jmOpenGruppengewinneModal;
    window.jmRenderGruppengewinneTabPane = jmRenderGruppengewinneTabPane;
    window.jmRefreshGruppengewinneBadge = jmRefreshGruppengewinneBadge;
    window.jmCreateCompFromFibuEntry = jmCreateCompFromFibuEntry;
    window.jmRenderGruppengewinneList = jmRenderGruppengewinneList;
    window.jmReloadGruppengewinneList = jmReloadGruppengewinneList;
    window.jmOnGruppengewinneYearChange = jmOnGruppengewinneYearChange;
    window.jmFilterGruppengewinneTable = jmFilterGruppengewinneTable;
    window.jmSetTypeFilter = jmSetTypeFilter;
    window.jmOnAnlassTypChange = jmOnAnlassTypChange;
    window.jmDeleteGroupCompetition = jmDeleteGroupCompetition;
    window.jmOpenGroupCompetitionEditor = jmOpenGroupCompetitionEditor;
    window.jmAddShooterRowToEditor = jmAddShooterRowToEditor;
    window.jmRemoveShooterRow = jmRemoveShooterRow;
    window.jmRecalculateCurrentComp = jmRecalculateCurrentComp;
    window.jmOnShooterNameChange = jmOnShooterNameChange;
    window.jmOnShooterPointsChange = jmOnShooterPointsChange;
    window.jmOnShooterStichChange = jmOnShooterStichChange;
    window.jmOnShooterGruppeChange = jmOnShooterGruppeChange;
    window.jmOnShooterEinzelChange = jmOnShooterEinzelChange;
    window.jmOnShooterAmountChange = jmOnShooterAmountChange;
    window.jmOnShooterMethodChange = jmOnShooterMethodChange;
    window.jmOnShooterIbanChange = jmOnShooterIbanChange;
    window.jmSaveCurrentComp = jmSaveCurrentComp;
    window.jmTransferCurrentCompToJahresbeitrag = jmTransferCurrentCompToJahresbeitrag;
    window.jmTransferSingleCompToJahresbeitrag = jmTransferSingleCompToJahresbeitrag;
    window.jmTransferAllOpenToJahresbeitrag = jmTransferAllOpenToJahresbeitrag;
    window.jmTransferCurrentCompToPaymentOrder = jmTransferCurrentCompToPaymentOrder;
    window.jmGenerateGruppengewinnPdf = jmGenerateGruppengewinnPdf;
    window.jmGenerateGruppengewinnPdfFromEditor = jmGenerateGruppengewinnPdfFromEditor;
    window.jmExportGruppengewinneSummaryPdf = jmExportGruppengewinneSummaryPdf;
    window.jmExportGruppengewinneWord = jmExportGruppengewinneWord;
    window.jmDetectGroupCompetitionFromImportLines = jmDetectGroupCompetitionFromImportLines;

})(window);

