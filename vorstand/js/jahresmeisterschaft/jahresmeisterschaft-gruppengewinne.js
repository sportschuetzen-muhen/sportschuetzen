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
            const { data, error } = await supa
                .from('group_competitions')
                .select(`
                    *,
                    members:group_competition_members(*)
                `)
                .eq('jahr', yr)
                .order('created_at', { ascending: false });

            if (error) throw error;
            window._jmGroupCompetitions = data || [];
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

    /**
     * Öffnet das zentrale Übersichts-Modal für Gruppengewinne.
     */
    async function jmOpenGruppengewinneModal(year) {
        const yr = year || getActiveYear();
        _jmActiveCompYear = yr;

        let modalEl = document.getElementById('jmGruppengewinneModal');
        if (!modalEl) {
            createGruppengewinneModalDOM();
            modalEl = document.getElementById('jmGruppengewinneModal');
        }

        const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
        modal.show();

        await jmRenderGruppengewinneList(yr);
    }

    /**
     * Erstellt das DOM für das Hauptmodal.
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
                        <!-- Info-Banner in Du-Form -->
                        <div class="alert alert-info py-2 px-3 small d-flex align-items-start gap-2 mb-3 shadow-sm border-0">
                            <i class="fas fa-info-circle fa-lg mt-1 text-primary"></i>
                            <div>
                                <strong>Vereinsregel für auswärtige Schiessen:</strong>
                                Der Verein übernimmt das Gruppendoppel (standardmässig <strong>CHF 30.00</strong>, frei übersteuerbar).
                                Gruppengewinne darüber hinaus stehen vollumfänglich den beteiligten Schützen zu und werden zu gleichen Teilen aufgeteilt.
                                Die Verrechnung erfolgt primär über einen Abzug bei der <strong>Jahresbeitragsrechnung</strong> oder per <strong>Banküberweisung (pain.001)</strong> über das Transitkonto <strong>1301</strong>.
                            </div>
                        </div>

                        <!-- Filter- & Aktionsleiste -->
                        <div class="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 bg-white p-2.5 rounded shadow-sm border">
                            <div class="d-flex align-items-center gap-2">
                                <label class="small fw-bold text-muted mb-0">Saison:</label>
                                <select id="jm-gg-year-select" class="form-select form-select-sm" style="width: 110px;" onchange="window.jmOnGruppengewinneYearChange(this.value)">
                                    <option value="2026">2026</option>
                                    <option value="2025">2025</option>
                                    <option value="2024">2024</option>
                                </select>
                                <div class="input-group input-group-sm" style="width: 250px;">
                                    <span class="input-group-text bg-white text-muted border-end-0"><i class="fas fa-search"></i></span>
                                    <input type="text" id="jm-gg-search" class="form-control form-control-sm border-start-0" placeholder="Anlass / Gruppe suchen..." oninput="window.jmFilterGruppengewinneTable()">
                                    <button type="button" class="btn btn-outline-secondary d-none" id="jm-gg-search-clear" onclick="document.getElementById('jm-gg-search').value=''; window.jmFilterGruppengewinneTable();" title="Suche leeren">
                                        <i class="fas fa-times"></i>
                                    </button>
                                </div>
                            </div>
                            <div class="d-flex align-items-center gap-2">
                                <button type="button" class="btn btn-sm btn-outline-secondary" onclick="window.jmReloadGruppengewinneList()" title="Liste neu laden">
                                    <i class="fas fa-sync-alt"></i>
                                </button>
                                <button type="button" class="btn btn-sm btn-warning fw-bold shadow-sm" onclick="window.jmOpenGroupCompetitionEditor(null)">
                                    <i class="fas fa-plus me-1"></i> Neuer Gruppengewinn erfassen
                                </button>
                            </div>
                        </div>

                        <!-- Tabelle der Gruppenwettkämpfe -->
                        <div class="card shadow-sm border-0">
                            <div class="card-body p-0">
                                <div class="table-responsive" style="max-height: 520px;">
                                    <table class="table table-hover align-middle mb-0" id="jm-gg-main-table">
                                        <thead class="table-light sticky-top small text-muted border-bottom">
                                            <tr>
                                                <th class="ps-3" style="width: 22%;">Anlass / Schiessen</th>
                                                <th style="width: 14%;">Gruppe</th>
                                                <th class="text-center" style="width: 7%;">Rang</th>
                                                <th class="text-end" style="width: 10%;">Doppel</th>
                                                <th class="text-end" style="width: 11%;">Gewinn</th>
                                                <th class="text-end" style="width: 12%;">Überschuss</th>
                                                <th class="text-center" style="width: 10%;">Schützen</th>
                                                <th class="text-center" style="width: 14%;">Aktionen</th>
                                            </tr>
                                        </thead>
                                        <tbody id="jm-gg-table-body" class="small">
                                            <tr>
                                                <td colspan="8" class="text-center py-4 text-muted">
                                                    <div class="spinner-border spinner-border-sm text-primary me-2"></div> Gruppengewinne werden geladen...
                                                </td>
                                            </tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer py-2 px-3 bg-light d-flex justify-content-between">
                        <div class="small text-muted" id="jm-gg-summary-text">
                            Gesamt-Überschuss Schützen (Konto 1301): <span class="fw-bold text-dark">CHF 0.00</span>
                        </div>
                        <button type="button" class="btn btn-sm btn-secondary" data-bs-dismiss="modal">Schliessen</button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    /**
     * Re-rendert die Liste der Gruppengewinne.
     */
    async function jmRenderGruppengewinneList(year) {
        const yr = year || getActiveYear();
        const yearSelect = document.getElementById('jm-gg-year-select');
        if (yearSelect) yearSelect.value = yr;

        const tbody = document.getElementById('jm-gg-table-body');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="8" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div> Gruppengewinne werden geladen...</td></tr>`;

        const list = await jmLoadGroupCompetitions(yr);

        if (!list || list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="8" class="text-center py-5 text-muted">
                        <i class="fas fa-trophy fa-2x mb-2 text-black-50 opacity-50 d-block"></i>
                        Noch keine Gruppengewinne für die Saison ${yr} erfasst.<br>
                        <span class="small">Klicke oben auf <strong>«Neuer Gruppengewinn erfassen»</strong> oder importiere eine Rangliste im Auswärts-Import.</span>
                    </td>
                </tr>
            `;
            updateSummaryText(0, 0);
            return;
        }

        let totalUeberschuss = 0;
        let totalGewinn = 0;

        tbody.innerHTML = list.map(comp => {
            const doppel = Number(comp.gruppendoppel || 30);
            const gewinn = Number(comp.gruppengewinn || 0);
            const ueberschuss = Math.max(0, gewinn - doppel);
            const members = Array.isArray(comp.members) ? comp.members : [];
            const count = members.length > 0 ? members.length : Number(comp.anzahl_schuetzen || 5);
            const perShooter = count > 0 ? (ueberschuss / count) : 0;

            totalGewinn += gewinn;
            totalUeberschuss += ueberschuss;

            const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${v.toFixed(2)}`);

            // Auszahlungsstatus der Schützen
            const allVerrechnet = members.length > 0 && members.every(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt');
            const hasPendent = members.some(m => m.status === 'offen' || m.status === 'in_zahlung');
            let statusBadge = `<span class="badge bg-secondary">Offen</span>`;
            if (allVerrechnet) {
                statusBadge = `<span class="badge bg-success"><i class="fas fa-check-circle me-1"></i>Abgewickelt</span>`;
            } else if (hasPendent && members.some(m => m.status === 'verrechnet' || m.status === 'ausgefuehrt')) {
                statusBadge = `<span class="badge bg-info text-dark">Teilweise verrechnet</span>`;
            } else if (ueberschuss === 0) {
                statusBadge = `<span class="badge bg-light text-muted border">Kein Überschuss</span>`;
            }

            return `
                <tr data-id="${comp.id}">
                    <td class="ps-3 fw-semibold">
                        <div class="text-dark">${escapeHtml(comp.anlass_name)}</div>
                        <div class="text-muted" style="font-size: 11px;">
                            ${comp.punkte_total ? `Total: ${comp.punkte_total} Pkt.` : ''} 
                            ${statusBadge}
                        </div>
                    </td>
                    <td>
                        <span class="badge bg-light text-dark border px-2 py-1 fw-bold">${escapeHtml(comp.gruppe_name)}</span>
                    </td>
                    <td class="text-center fw-bold">
                        ${comp.rang ? `<span class="badge bg-primary">${comp.rang}.</span>` : '-'}
                    </td>
                    <td class="text-end text-muted">
                        ${fmtCurr(doppel)}
                    </td>
                    <td class="text-end fw-bold ${gewinn > 0 ? 'text-success' : 'text-muted'}">
                        ${fmtCurr(gewinn)}
                    </td>
                    <td class="text-end fw-bold ${ueberschuss > 0 ? 'text-primary' : 'text-muted'}">
                        ${fmtCurr(ueberschuss)}
                    </td>
                    <td class="text-center">
                        <span class="badge bg-secondary-subtle text-dark border" title="${members.map(m => m.schuetze_name).join(', ')}">
                            <i class="fas fa-users me-1 text-muted"></i>${count} Schützen
                        </span>
                        <div class="text-muted" style="font-size: 10px;">je ${fmtCurr(perShooter)}</div>
                    </td>
                    <td class="text-center pe-3">
                        <div class="btn-group btn-group-sm">
                            <button type="button" class="btn btn-outline-primary" onclick="window.jmOpenGroupCompetitionEditor('${comp.id}')" title="Gruppe & Schützen bearbeiten">
                                <i class="fas fa-pen"></i>
                            </button>
                            <button type="button" class="btn btn-outline-secondary" onclick="window.jmGenerateGruppengewinnPdf('${comp.id}')" title="Abrechnungs- & Quittungs-PDF drucken">
                                <i class="fas fa-file-pdf text-danger"></i>
                            </button>
                            <button type="button" class="btn btn-outline-danger" onclick="window.jmDeleteGroupCompetition('${comp.id}')" title="Gruppe löschen">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        updateSummaryText(totalGewinn, totalUeberschuss);
    }

    function updateSummaryText(totalGewinn, totalUeberschuss) {
        const sumEl = document.getElementById('jm-gg-summary-text');
        if (!sumEl) return;
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${v.toFixed(2)}`);
        sumEl.innerHTML = `
            Erfasster Gruppengewinn: <strong class="text-success">${fmtCurr(totalGewinn)}</strong> | 
            Netto-Überschuss für Schützen (Konto 1301): <strong class="text-primary">${fmtCurr(totalUeberschuss)}</strong>
        `;
    }

    /**
     * Filtert die Tabelle der Gruppengewinne anhand des Suchbegriffs.
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
            r.style.display = (!query || txt.includes(query)) ? '' : 'none';
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
                anlass_name: '',
                gruppe_name: 'Strohaus',
                rang: null,
                punkte_total: null,
                gruppendoppel: 30.00,
                gruppengewinn: 0.00,
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
                    ? 'btn-success text-white'
                    : 'btn-outline-secondary bg-white text-dark';
                const icon = isSelected ? 'fa-check' : 'fa-plus';
                const titleHint = isSelected
                    ? 'Ist aktuell in der Gruppe eingeteilt (Klick zum Entfernen)'
                    : 'Klicken, um diesen Schützen in die Gruppe aufzunehmen';
                return `
                    <button type="button" class="btn btn-xs ${btnCls} py-0 px-2" style="font-size: 11px;" onclick="window.jmToggleGridShooterInEditor(${idx})" title="${titleHint}">
                        <i class="fas ${icon} me-1"></i>${escapeHtml(s.name)} <strong>(${s.punkte})</strong>
                    </button>
                `;
            }).join('');

            extraHtml = `
                <div class="mt-2 pt-1.5 border-top border-success-subtle d-flex flex-wrap align-items-center gap-1">
                    <span class="text-muted me-1" style="font-size: 11px;">
                        <i class="fas fa-exchange-alt me-1"></i>Alle ${_jmLastDetectedGridShooters.length} Schützen dieses Schiessens (Klick zum Ein-/Austeilen):
                    </span>
                    ${pills}
                </div>
            `;
        }

        banner.className = 'alert alert-success py-2 px-3 small mb-3 shadow-xs border';
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
                betrag: 0,
                payout_method: 'jahresbeitrag',
                iban: iban,
                status: 'offen'
            });
        }

        const sumPts = _jmCurrentEditingComp.members.reduce((a, b) => a + (Number(b.punkte) || 0), 0);
        _jmCurrentEditingComp.punkte_total = Math.round(sumPts * 10) / 10;
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
                banner.className = 'alert alert-primary py-2 px-3 small d-flex align-items-center justify-content-between mb-3 shadow-xs border';
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

    function createGruppengewinnEditModalDOM() {
        const div = document.createElement('div');
        div.id = 'jmGruppengewinnEditModal';
        div.className = 'modal fade';
        div.tabIndex = -1;
        div.setAttribute('aria-hidden', 'true');
        div.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-centered modal-dialog-scrollable">
                <div class="modal-content shadow-lg border-0">
                    <div class="modal-header bg-dark text-white py-2.5 px-3">
                        <div class="d-flex align-items-center gap-2">
                            <span class="badge bg-warning text-dark"><i class="fas fa-edit"></i></span>
                            <div>
                                <h5 class="modal-title fw-bold mb-0" id="jm-edit-modal-title">Gruppengewinn erfassen & aufteilen</h5>
                                <div class="small text-white-50">Konto 1301 · Doppel abziehen & Gewinnanteil je Schütze festlegen</div>
                            </div>
                        </div>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                    </div>
                    <div class="modal-body p-3 bg-light">
                        <!-- Stammdaten Gruppe & Finanzen -->
                        <div class="card shadow-sm border-0 mb-3">
                            <div class="card-header bg-white py-2 fw-bold text-dark border-bottom small">
                                <i class="fas fa-bullseye me-1 text-primary"></i> 1. Anlass, Gruppe & Abrechnungswerte
                            </div>
                            <div class="card-body p-3">
                                <div class="row g-2">
                                    <div class="col-md-5">
                                        <div class="d-flex justify-content-between align-items-center mb-1">
                                            <label class="form-label small fw-bold mb-0">Anlass / Schiessen *</label>
                                            <span class="badge bg-secondary-subtle text-muted border" style="font-size: 10px;">Offene & abgerechnete Schiessen</span>
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
                                    <div class="col-md-3">
                                        <label class="form-label small fw-bold mb-1">Gruppenname *</label>
                                        <input type="text" class="form-control form-control-sm" id="jme-gruppe" placeholder="z. B. Strohaus" required>
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small fw-bold mb-1">Rang</label>
                                        <input type="number" class="form-control form-control-sm text-center" id="jme-rang" placeholder="z. B. 2">
                                    </div>
                                    <div class="col-md-2">
                                        <label class="form-label small fw-bold mb-1">Total Punkte</label>
                                        <input type="number" step="0.1" class="form-control form-control-sm text-center" id="jme-punkte" placeholder="z. B. 487">
                                    </div>

                                    <!-- Finanz-Berechnung (4-Spalten Grid ohne Umbruch-Probleme) -->
                                    <div class="col-12 mt-2">
                                        <div class="p-2.5 rounded bg-light border">
                                            <div class="row g-2 align-items-center">
                                                <div class="col-sm-6 col-md-3">
                                                    <label class="small fw-bold text-muted d-block mb-1">Gruppendoppel (Verein)</label>
                                                    <div class="input-group input-group-sm">
                                                        <span class="input-group-text">CHF</span>
                                                        <input type="number" step="0.5" class="form-control fw-bold text-end" id="jme-doppel" value="30.00" oninput="window.jmRecalculateCurrentComp()">
                                                    </div>
                                                </div>
                                                <div class="col-sm-6 col-md-3">
                                                    <label class="small fw-bold text-success d-block mb-1">Gruppengewinn (Brutto) *</label>
                                                    <div class="input-group input-group-sm">
                                                        <span class="input-group-text bg-success text-white fw-bold border-success">CHF</span>
                                                        <input type="number" step="0.5" class="form-control fw-bold text-end text-success border-success bg-white" id="jme-gewinn" value="0.00" oninput="window.jmRecalculateCurrentComp()">
                                                    </div>
                                                </div>
                                                <div class="col-sm-6 col-md-3 text-sm-center">
                                                    <label class="small fw-bold text-primary d-block mb-1">Netto-Überschuss Schützen</label>
                                                    <span class="badge bg-primary fs-6 px-3 py-1.5 d-inline-block" id="jme-ueberschuss-badge">CHF 0.00</span>
                                                </div>
                                                <div class="col-sm-6 col-md-3 text-sm-center">
                                                    <label class="small fw-bold text-dark d-block mb-1">Anteil je Schütze</label>
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
                                <i class="fas fa-users me-1"></i> 5 Schützen & Punkte übernehmen
                            </button>
                        </div>

                        <!-- 2. Beteiligte Schützen & Gewinnaufteilung -->
                        <div class="card shadow-sm border-0">
                            <div class="card-header bg-white py-2 d-flex align-items-center justify-content-between border-bottom small">
                                <span class="fw-bold text-dark">
                                    <i class="fas fa-users me-1 text-primary"></i> 2. Beteiligte Schützen & Zuweisung (<span id="jme-shooter-count">0</span>)
                                </span>
                                <div class="d-flex align-items-center gap-2">
                                    <button type="button" class="btn btn-xs btn-outline-secondary" id="jme-quick-import-jm-btn" onclick="window.jmPopulateShootersFromJMRawGrid()" style="display:none;" title="Übernimmt die 5 besten Muhen-Schützen dieses Schiessens aus der Jahresmeisterschaft">
                                        <i class="fas fa-file-import me-1 text-primary"></i> Aus Jahresmeisterschaft laden
                                    </button>
                                    <button type="button" class="btn btn-xs btn-outline-primary fw-semibold" onclick="window.jmAddShooterRowToEditor()">
                                        <i class="fas fa-user-plus me-1"></i> Schütze hinzufügen
                                    </button>
                                </div>
                            </div>
                            <div class="card-body p-0">
                                <datalist id="jme-members-datalist"></datalist>
                                <div class="table-responsive" style="max-height: 380px;">
                                    <table class="table table-sm table-hover align-middle mb-0" id="jme-shooters-table">
                                        <thead class="table-light small text-muted border-bottom">
                                            <tr>
                                                <th class="ps-3" style="width: 26%;">Schütze (Name / Status)</th>
                                                <th class="text-center" style="width: 9%;">Punkte</th>
                                                <th class="text-end" style="width: 14%;">Gewinnanteil</th>
                                                <th style="width: 20%;">Auszahlungsweg</th>
                                                <th style="width: 24%;">IBAN (für Überweisung)</th>
                                                <th class="text-center" style="width: 7%;"></th>
                                            </tr>
                                        </thead>
                                        <tbody id="jme-shooters-body" class="small">
                                            <!-- Dynamische Schützenzeilen -->
                                        </tbody>
                                    </table>
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
                                <i class="fas fa-save me-1"></i> Gruppengewinn speichern
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(div);
    }

    /**
     * Befüllt die Felder des Detail-Editors
     */
    function populateEditorFields(comp) {
        document.getElementById('jme-anlass').value = comp.anlass_name || '';
        document.getElementById('jme-gruppe').value = comp.gruppe_name || 'Strohaus';
        document.getElementById('jme-rang').value = comp.rang || '';
        document.getElementById('jme-punkte').value = comp.punkte_total || '';
        document.getElementById('jme-doppel').value = Number(comp.gruppendoppel !== undefined ? comp.gruppendoppel : 30).toFixed(2);
        document.getElementById('jme-gewinn').value = Number(comp.gruppengewinn || 0).toFixed(2);

        const modalTitle = document.getElementById('jm-edit-modal-title');
        if (modalTitle) {
            modalTitle.innerText = comp.id ? `Gruppengewinn bearbeiten: ${comp.gruppe_name}` : 'Neuer Gruppengewinn erfassen';
        }

        renderShooterRows(comp.members || []);
        jmRecalculateCurrentComp();
        checkAnlassJMSyncBanner(comp.anlass_name);
    }

    /**
     * Rendert die Schützen-Zeilen im Detail-Editor
     */
    function renderShooterRows(members) {
        const tbody = document.getElementById('jme-shooters-body');
        if (!tbody) return;

        if (!members || members.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted">Noch keine Schützen zugewiesen. Wähle oben ein Schiessen aus oder klicke auf «Schütze hinzufügen».</td></tr>`;
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
            const isLocked = status === 'verrechnet' || status === 'in_zahlung' || status === 'ausgefuehrt';

            let statusBadge = `<span class="badge bg-secondary-subtle text-secondary border" style="font-size: 9.5px;">Offen</span>`;
            if (status === 'verrechnet') {
                statusBadge = `<span class="badge bg-success-subtle text-success border border-success-subtle" style="font-size: 9.5px;"><i class="fas fa-check-circle me-1"></i>Verrechnet (JB)</span>`;
            } else if (status === 'in_zahlung') {
                statusBadge = `<span class="badge bg-info-subtle text-info-emphasis border border-info-subtle" style="font-size: 9.5px;"><i class="fas fa-university me-1"></i>In Zahlung</span>`;
            } else if (status === 'ausgefuehrt') {
                statusBadge = `<span class="badge bg-success" style="font-size: 9.5px;"><i class="fas fa-check-double me-1"></i>Ausbezahlt</span>`;
            }

            return `
                <tr data-idx="${idx}" class="${isLocked ? 'table-light' : ''}">
                    <td class="ps-3">
                        <input type="text" class="form-control form-control-sm fw-semibold jme-shooter-name" list="jme-members-datalist" value="${escapeHtml(m.schuetze_name || '')}" placeholder="Vorname Nachname (tippen zum Suchen)" ${isLocked ? 'disabled' : ''} onchange="window.jmOnShooterNameChange(${idx}, this.value)">
                        <input type="hidden" class="jme-shooter-pn" value="${m.person_number || memberObj?.person_number || ''}">
                        <div class="d-flex align-items-center justify-content-between mt-1" style="font-size: 10px;">
                            <span class="text-muted">
                                ${m.person_number || memberObj?.person_number ? `PN: ${m.person_number || memberObj.person_number}` : '<span class="text-warning">Nicht im Mitgliederstamm verknüpft</span>'}
                            </span>
                            ${statusBadge}
                        </div>
                    </td>
                    <td class="text-center">
                        <input type="number" step="0.1" class="form-control form-control-sm text-center jme-shooter-pts" value="${m.punkte || ''}" placeholder="Punkte" ${isLocked ? 'disabled' : ''} onchange="window.jmOnShooterPointsChange(${idx}, this.value)">
                    </td>
                    <td class="text-end">
                        <div class="input-group input-group-sm">
                            <span class="input-group-text">CHF</span>
                            <input type="number" step="0.05" class="form-control form-control-sm fw-bold text-end jme-shooter-betrag" value="${Number(m.betrag || 0).toFixed(2)}" ${isLocked ? 'disabled' : ''} onchange="window.jmOnShooterAmountChange(${idx}, this.value)">
                        </div>
                    </td>
                    <td>
                        <select class="form-select form-select-sm jme-shooter-method" ${isLocked ? 'disabled' : ''} onchange="window.jmOnShooterMethodChange(${idx}, this.value)">
                            <option value="jahresbeitrag" ${payoutMethod === 'jahresbeitrag' ? 'selected' : ''}>Verrechnung Jahresbeitrag</option>
                            <option value="bank" ${payoutMethod === 'bank' ? 'selected' : ''}>Banküberweisung (pain.001)</option>
                            <option value="kasse" ${payoutMethod === 'kasse' ? 'selected' : ''}>Barauszahlung (Kasse 1000)</option>
                            <option value="pendent" ${payoutMethod === 'pendent' ? 'selected' : ''}>Pendent / Unklar</option>
                        </select>
                    </td>
                    <td>
                        <div class="d-flex align-items-center gap-1">
                            <input type="text" class="form-control form-control-sm jme-shooter-iban ${hasIban ? 'border-success' : 'border-warning'}" value="${escapeHtml(currentIban)}" placeholder="CH..." ${isLocked ? 'disabled' : ''} onchange="window.jmOnShooterIbanChange(${idx}, this.value)">
                            ${hasIban ? '<i class="fas fa-check-circle text-success" title="IBAN vorhanden"></i>' : '<i class="fas fa-exclamation-triangle text-warning" title="Keine IBAN im System"></i>'}
                        </div>
                        ${!memberObj?.iban && hasIban && !isLocked ? `
                            <div class="form-check mt-1" style="font-size: 10px;">
                                <input class="form-check-input jme-save-iban-check" type="checkbox" id="save-iban-${idx}" checked>
                                <label class="form-check-label text-muted" for="save-iban-${idx}">Im Mitgliederstamm sichern</label>
                            </div>
                        ` : ''}
                    </td>
                    <td class="text-center pe-3">
                        <button type="button" class="btn btn-xs btn-outline-danger" ${isLocked ? 'disabled title="Bereits abgerechneter Schütze kann nicht entfernt werden"' : 'title="Schütze entfernen"'} onclick="window.jmRemoveShooterRow(${idx})">
                            <i class="fas fa-times"></i>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        updateTransferActionButtons();
    }

    /**
     * Aktualisiert die Zähler und Zustände der Footer-Aktionsbuttons (Jahresbeitrag / pain.001).
     */
    function updateTransferActionButtons() {
        const jbBtn = document.getElementById('jme-transfer-jb-btn');
        const poBtn = document.getElementById('jme-transfer-po-btn');
        const members = _jmCurrentEditingComp?.members || [];

        const jbOpen = members.filter(m => (m.payout_method || 'jahresbeitrag') === 'jahresbeitrag' && Number(m.betrag || 0) > 0 && m.status !== 'verrechnet');
        const poOpen = members.filter(m => m.payout_method === 'bank' && Number(m.betrag || 0) > 0 && m.status !== 'in_zahlung' && m.status !== 'ausgefuehrt');

        if (jbBtn) {
            jbBtn.innerHTML = `<i class="fas fa-file-invoice-dollar me-1 text-primary"></i> In Jahresbeitrag übertragen${jbOpen.length > 0 ? ` <span class="badge bg-primary ms-1">${jbOpen.length}</span>` : ''}`;
            jbBtn.disabled = jbOpen.length === 0;
            jbBtn.title = jbOpen.length > 0
                ? `${jbOpen.length} Schütze(n) direkt speichern & im Jahresbeitrag gutschreiben`
                : 'Zuerst einen Gruppengewinn (> Doppel) eintragen oder offene Schützen mit «Verrechnung Jahresbeitrag» zuweisen.';
        }
        if (poBtn) {
            poBtn.innerHTML = `<i class="fas fa-file-export me-1"></i> Bank-Überweisung (pain.001)${poOpen.length > 0 ? ` <span class="badge bg-primary ms-1">${poOpen.length}</span>` : ''}`;
            poBtn.disabled = poOpen.length === 0;
            poBtn.title = poOpen.length > 0
                ? `Für ${poOpen.length} Schütze(n) direkt speichern & Zahlungsauftrag (pain.001) erstellen`
                : 'Keine offenen Schützen mit Auszahlungsweg «Banküberweisung» und Betrag > CHF 0.00.';
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
        _jmCurrentEditingComp.members.push({
            person_number: null,
            schuetze_name: '',
            jahrgang: null,
            punkte: null,
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
        const doppel = parseFloat(document.getElementById('jme-doppel')?.value || 30) || 0;
        const gewinn = parseFloat(document.getElementById('jme-gewinn')?.value || 0) || 0;
        const ueberschuss = Math.max(0, gewinn - doppel);

        const badgeUeberschuss = document.getElementById('jme-ueberschuss-badge');
        const badgePerShooter = document.getElementById('jme-pershooter-badge');

        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${v.toFixed(2)}`);
        if (badgeUeberschuss) badgeUeberschuss.innerText = fmtCurr(ueberschuss);

        const count = (_jmCurrentEditingComp?.members?.length) || parseInt(document.getElementById('jme-shooter-count')?.innerText || '5', 10) || 5;
        let perShooter = 0;
        if (count > 0 && ueberschuss > 0) {
            // Rappen-Rundung (5 Rappen)
            perShooter = Math.round((ueberschuss / count) * 20) / 20;
        }

        if (badgePerShooter) badgePerShooter.innerText = fmtCurr(perShooter);

        // Zeilen-Beträge aktualisieren, sofern nicht bereits abgerechnet oder manuell abweichend editiert
        const rows = document.querySelectorAll('#jme-shooters-body tr');
        rows.forEach((r, idx) => {
            const betragInput = r.querySelector('.jme-shooter-betrag');
            const m = _jmCurrentEditingComp?.members?.[idx];
            if (betragInput && m) {
                const isLocked = m.status === 'verrechnet' || m.status === 'in_zahlung' || m.status === 'ausgefuehrt';
                if (!isLocked && (m.betrag === 0 || !m._manualAmount)) {
                    betragInput.value = perShooter.toFixed(2);
                    m.betrag = perShooter;
                }
            }
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
    }

    function jmOnShooterPointsChange(idx, val) {
        if (!_jmCurrentEditingComp?.members?.[idx]) return;
        _jmCurrentEditingComp.members[idx].punkte = val ? parseFloat(val) : null;
        const sumPts = (_jmCurrentEditingComp.members || []).reduce((a, b) => a + (Number(b.punkte) || 0), 0);
        _jmCurrentEditingComp.punkte_total = Math.round(sumPts * 10) / 10;
        const punkteInput = document.getElementById('jme-punkte');
        if (punkteInput) punkteInput.value = _jmCurrentEditingComp.punkte_total || '';
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
        const gruppe = (document.getElementById('jme-gruppe')?.value || '').trim();
        if (!anlass || anlass === '__custom__' || !gruppe) {
            if (window.UIConfirmKit) {
                await UIConfirmKit.alert({ title: 'Pflichtfelder fehlen', message: 'Bitte wähle einen Anlass aus und trage den Gruppennamen ein.', type: 'warning' });
            } else {
                alert('Bitte Anlass und Gruppenname eintragen.');
            }
            return false;
        }

        const rang = parseInt(document.getElementById('jme-rang')?.value, 10) || null;
        const punkte = parseFloat(document.getElementById('jme-punkte')?.value) || null;
        const doppel = parseFloat(document.getElementById('jme-doppel')?.value) || 30.00;
        const gewinn = parseFloat(document.getElementById('jme-gewinn')?.value) || 0.00;
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
            String(c.gruppe_name || '').trim().toLowerCase() === gruppe.toLowerCase()
        );

        if (existingDup) {
            let proceed = false;
            if (window.UIConfirmKit) {
                proceed = await UIConfirmKit.confirm({
                    title: 'Mögliches Duplikat erkannt',
                    message: `Für «${anlass}» (Saison ${compYrCheck}) existiert bereits ein Gruppengewinn für die Gruppe «${gruppe}».<br><br>Möchtest du diese zusätzliche Gruppe wirklich speichern?`,
                    type: 'warning',
                    confirmText: 'Ja, trotzdem speichern',
                    cancelText: 'Abbrechen'
                });
            } else {
                proceed = confirm(`Für «${anlass}» existiert bereits ein Eintrag für «${gruppe}». Trotzdem speichern?`);
            }
            if (!proceed) return false;
        }

        const payloadComp = {
            jahr: _jmCurrentEditingComp?.jahr || getActiveYear(),
            anlass_name: anlass,
            gruppe_name: gruppe,
            rang: rang,
            punkte_total: punkte,
            gruppendoppel: doppel,
            gruppengewinn: gewinn,
            anzahl_schuetzen: members.length,
            betrag_pro_schuetze: members.length > 0 ? (Math.max(0, gewinn - doppel) / members.length) : 0,
            status: 'offen'
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
            _jmCurrentEditingComp.rang = rang;
            _jmCurrentEditingComp.punkte_total = punkte;
            _jmCurrentEditingComp.gruppendoppel = doppel;
            _jmCurrentEditingComp.gruppengewinn = gewinn;

            // Schützen speichern / synchronisieren
            await supa.from('group_competition_members').delete().eq('competition_id', compId);

            if (members.length > 0) {
                const memberInserts = members.map(m => ({
                    competition_id: compId,
                    person_number: m.person_number ? parseInt(m.person_number, 10) : null,
                    schuetze_name: m.schuetze_name || 'Unbekannt',
                    jahrgang: m.jahrgang || null,
                    punkte: m.punkte || null,
                    betrag: m.betrag || 0,
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
                    _jmCurrentEditingComp.members = insertedMembers;
                }

                // Allfällige neue IBANs im Mitgliederstamm speichern
                const rows = document.querySelectorAll('#jme-shooters-body tr');
                for (let i = 0; i < rows.length; i++) {
                    const saveCheck = rows[i].querySelector('.jme-save-iban-check');
                    if (saveCheck && saveCheck.checked && members[i] && members[i].person_number && members[i].iban) {
                        try {
                            await supa.from('members').update({ iban: members[i].iban }).eq('person_number', parseInt(members[i].person_number, 10));
                            console.log(`[Gruppengewinne] IBAN für Mitglied ${members[i].person_number} im Profil gespeichert.`);
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
                showSuccess(`Gruppengewinn für ${gruppe} (${anlass}) erfolgreich gespeichert!`);
            }
            return true;
        } catch (err) {
            console.error("[Gruppengewinne] Speicherfehler:", err);
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
     * Überträgt die offenen Beträge der aktuellen Gruppe als Gutschrift in den Jahresbeitrag.
     * Speichert den Gruppengewinn automatisch vorab, falls noch ungespeichert.
     */
    async function jmTransferCurrentCompToJahresbeitrag() {
        const btn = document.getElementById('jme-transfer-jb-btn');
        const runTransfer = async () => {
            if (!_jmCurrentEditingComp) return;

            // Automatisch vorab in Supabase sichern, damit IDs & aktuelle Beträge garantiert konsistent sind
            const saved = await _jmSaveCurrentCompInternal({ closeModal: false, silent: true });
            if (!saved || !_jmCurrentEditingComp.id) return;

            const members = (_jmCurrentEditingComp.members || []).filter(m => m.payout_method === 'jahresbeitrag' && m.betrag > 0 && m.status !== 'verrechnet');
            if (members.length === 0) {
                if (window.UIConfirmKit) {
                    await UIConfirmKit.alert({ title: 'Keine offenen Positionen', message: 'Es gibt keine Schützen mit Methode «Verrechnung Jahresbeitrag» und offenem Betrag.', type: 'info' });
                }
                return;
            }

            let confirmed = false;
            if (window.UIConfirmKit) {
                confirmed = await UIConfirmKit.confirm({
                    title: 'In Jahresbeitrag verrechnen?',
                    message: `Möchtest du für ${members.length} Schütze(n) die Gutschrift (total CHF ${members.reduce((a, b) => a + Number(b.betrag), 0).toFixed(2)}) direkt als Abzug im Jahresbeitrag ${getActiveYear()} verbuchen?`,
                    type: 'primary',
                    confirmText: 'Ja, übertragen',
                    cancelText: 'Abbrechen'
                });
            } else {
                confirmed = confirm(`Gutschrift für ${members.length} Schützen in Jahresbeitrag übertragen?`);
            }

            if (!confirmed) return;

            const supa = getSupa();
            if (!supa) return;

            let successCount = 0;
            const yr = getActiveYear();
            const failedShooters = [];

            for (const m of members) {
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
                    console.warn(`[Gruppengewinne] Schütze ${m.schuetze_name} hat keine Personennummer und wird übersprungen.`);
                    failedShooters.push(m.schuetze_name);
                    continue;
                }

                const pnStr = String(pn);
                const headId = `CH-${yr}-${pnStr}`;

                try {
                    // Prüfen ob Header existiert
                    let { data: head } = await supa.from('contributions_header').select('*').eq('id', headId).maybeSingle();
                    if (!head) {
                        // Header anlegen
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

                    // Höchste Positions-Nummer ermitteln
                    const { data: posList } = await supa.from('contributions_positions').select('position_nr').eq('header_id', headId).order('position_nr', { ascending: false }).limit(1);
                    const nextPosNr = (posList && posList.length > 0) ? (posList[0].position_nr + 1) : 1;
                    const posId = `${headId}-${nextPosNr}`;

                    const creditAmount = -Math.abs(Number(m.betrag));
                    const posDesc = `Gutschrift Gruppengewinn: ${_jmCurrentEditingComp.gruppe_name} (${_jmCurrentEditingComp.anlass_name})`;

                    // Gutschrift einfügen
                    const { error: insPosErr } = await supa.from('contributions_positions').insert({
                        id: posId,
                        header_id: headId,
                        person_number: pnStr,
                        year: yr,
                        position_nr: nextPosNr,
                        beschreibung: posDesc,
                        betrag: creditAmount,
                        typ: 'Credit',
                        source_field: '1301',
                        konto: '1301'
                    });
                    if (insPosErr) throw insPosErr;

                    // Header Gesamtbetrag neu berechnen
                    const { data: allPos } = await supa.from('contributions_positions').select('betrag').eq('header_id', headId);
                    const newGesamt = (allPos || []).reduce((acc, p) => acc + Number(p.betrag || 0), 0);
                    await supa.from('contributions_header').update({ gesamt: Math.max(0, newGesamt) }).eq('id', headId);

                    // Falls bereits ein Rechnungsentwurf im RechnungsCore existiert (und noch unversendet/unbezahlt ist):
                    // Diesen direkt mit der neuen Gutschrift synchronisieren!
                    if (head && head.invoice_id) {
                        const { data: inv } = await supa.from('invoices').select('id, mail_status, total_paid').eq('id', head.invoice_id).maybeSingle();
                        if (inv && (!inv.mail_status || inv.mail_status === 'entwurf') && (!inv.total_paid || Number(inv.total_paid) === 0)) {
                            await supa.from('invoice_positions').insert({
                                invoice_id: inv.id,
                                position_nr: nextPosNr,
                                description: posDesc,
                                quantity: 1,
                                unit_price: creditAmount,
                                amount: creditAmount,
                                konto: '1301'
                            });
                            await supa.from('invoices').update({
                                total_amount: Math.max(0, newGesamt),
                                open_amount: Math.max(0, newGesamt),
                                pdf_url: null,
                                pdf_storage_path: null,
                                updated_at: new Date().toISOString()
                            }).eq('id', inv.id);
                            console.log(`[Gruppengewinne] Rechnungsentwurf ${inv.id} automatisch aktualisiert.`);
                        }
                    }

                    // Status in group_competition_members auf verrechnet setzen
                    if (m.id) {
                        await supa.from('group_competition_members').update({
                            status: 'verrechnet',
                            contribution_position_id: posId
                        }).eq('id', m.id);
                    }
                    m.status = 'verrechnet';
                    m.contribution_position_id = posId;
                    successCount++;
                } catch (pErr) {
                    console.error(`Fehler bei Übertragung für Schütze ${m.schuetze_name}:`, pErr);
                }
            }

            if (failedShooters.length > 0 && window.UIConfirmKit) {
                await UIConfirmKit.alert({
                    title: 'Schützen ohne Mitgliedsnummer',
                    message: `Folgende Schützen konnten nicht im Mitgliederstamm gefunden werden und wurden nicht übertragen: ${failedShooters.join(', ')}. Bitte verknüpfe sie im Editor.`,
                    type: 'warning'
                });
            }

            renderShooterRows(_jmCurrentEditingComp.members);
            await jmRenderGruppengewinneList(yr);
            await populateCompetitionOptions(_jmCurrentEditingComp.anlass_name);
            if (typeof showSuccess === 'function') {
                showSuccess(`🎉 ${successCount} Schütze(n) erfolgreich im Jahresbeitrag ${yr} gutgeschrieben!`);
            }
        };

        if (window.UIButtonKit && btn) {
            await UIButtonKit.withLoading(btn, runTransfer);
        } else {
            await runTransfer();
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

            const members = (_jmCurrentEditingComp.members || []).filter(m => m.payout_method === 'bank' && m.betrag > 0 && m.status !== 'in_zahlung' && m.status !== 'ausgefuehrt');
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

            let confirmed = false;
            if (window.UIConfirmKit) {
                confirmed = await UIConfirmKit.confirm({
                    title: 'Zahlungsaufträge erstellen?',
                    message: `Möchtest du für ${members.length} Schütze(n) Zahlungsaufträge (Konto 1301 an Bank 1020) im Gesamtbetrag von CHF ${members.reduce((a, b) => a + Number(b.betrag), 0).toFixed(2)} erstellen? Diese können anschliessend im Menü Finanzbuchhaltung als ISO 20022 pain.001 XML heruntergeladen werden.`,
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

                    const orderPayload = {
                        order_nr: nextNr,
                        jahr: yr,
                        datum: todayStr,
                        execution_date: todayStr,
                        member_pn: m.person_number ? String(m.person_number) : null,
                        recipient_name: m.schuetze_name,
                        recipient_iban: m.iban.replace(/\s+/g, ''),
                        betrag: Number(m.betrag),
                        konto_soll: '1301',
                        konto_haben: '1020',
                        beschreibung: `Gruppengewinn ${_jmCurrentEditingComp.gruppe_name} (${_jmCurrentEditingComp.anlass_name})`,
                        positions: [{
                            text: `Anteil Gruppengewinn ${_jmCurrentEditingComp.gruppe_name}`,
                            betrag: Number(m.betrag),
                            konto_soll: '1301'
                        }],
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

        const doppel = Number(comp.gruppendoppel || 30);
        const gewinn = Number(comp.gruppengewinn || 0);
        const ueberschuss = Math.max(0, gewinn - doppel);
        const members = Array.isArray(comp.members) ? comp.members : [];
        const count = members.length > 0 ? members.length : 5;
        const perShooter = count > 0 ? (ueberschuss / count) : 0;

        const todayStr = (window.UIFormatKit && UIFormatKit.formatDate) ? UIFormatKit.formatDate(new Date().toISOString().split('T')[0]) : new Date().toLocaleDateString('de-CH');
        const fmtCurr = window.UIFormatKit ? UIFormatKit.formatCurrency : (v => `CHF ${v.toFixed(2)}`);

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
        doc.text('Abrechnungsbeleg: Gruppengewinn Auswärtiges Schiessen', 15, 34);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(80, 80, 80);
        doc.text(`Abrechnungsdatum: ${todayStr} · Buchungskonto: 1301 Transit Gruppengewinne`, 15, 39);

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
        doc.text(`Gruppe:`, 19, 56);
        doc.setFont('helvetica', 'normal');
        doc.text(`${comp.gruppe_name} ${comp.rang ? `(Rang ${comp.rang})` : ''}`, 40, 56);

        doc.setFont('helvetica', 'bold');
        doc.text(`Saison:`, 120, 50);
        doc.setFont('helvetica', 'normal');
        doc.text(`${comp.jahr || new Date().getFullYear()}`, 145, 50);

        doc.setFont('helvetica', 'bold');
        doc.text(`Punkte Total:`, 120, 56);
        doc.setFont('helvetica', 'normal');
        doc.text(`${comp.punkte_total ? `${comp.punkte_total} Pkt.` : '-'}`, 145, 56);

        // Finanz-Tabelle
        const finHead = [['Finanzielle Aufstellung', 'Betrag (CHF)', 'Buchungsziel']];
        const finBody = [
            ['Gruppengewinn Ausrichter (Brutto)', fmtCurr(gewinn), 'Geldeingang Bank 1020'],
            ['Abzug Gruppendoppel (Verein)', `- ${fmtCurr(doppel)}`, 'Rückerstattung Aufwand 4200'],
            ['Netto-Überschuss für Schützen', fmtCurr(ueberschuss), 'Transitkonto 1301'],
            ['Anteil je Schütze (bei ' + count + ' Schützen)', fmtCurr(perShooter), 'Auszahlung / Verrechnung']
        ];

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
                if (hook.section === 'body' && hook.row.index === 2) {
                    hook.cell.styles.fillColor = [226, 240, 233];
                    hook.cell.styles.textColor = [15, 81, 50];
                }
            }
        });

        // Schützen-Verteiler-Tabelle
        const shooterHead = [['Rang', 'Name des Schützen', 'Pkt.', 'Anteil', 'Auszahlungsweg / Details', 'Visum / Quittung']];
        const shooterBody = members.map((m, idx) => {
            const methodLabel = m.payout_method === 'jahresbeitrag'
                ? 'Verrechnung Jahresbeitrag'
                : (m.payout_method === 'bank' ? `Bank (${m.iban || 'IBAN fehlt'})` : 'Barauszahlung Stand');

            return [
                String(idx + 1),
                m.schuetze_name,
                m.punkte ? String(m.punkte) : '-',
                fmtCurr(Number(m.betrag || perShooter)),
                methodLabel,
                ''
            ];
        });

        doc.autoTable({
            head: shooterHead,
            body: shooterBody,
            startY: doc.lastAutoTable.finalY + 8,
            margin: { left: 15, right: 15 },
            theme: 'grid',
            styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 2.2 },
            headStyles: { fillColor: [70, 80, 95], textColor: 255, fontStyle: 'bold' },
            columnStyles: {
                0: { cellWidth: 12, halign: 'center' },
                1: { cellWidth: 55, fontStyle: 'bold' },
                2: { cellWidth: 16, halign: 'center' },
                3: { cellWidth: 26, halign: 'right', fontStyle: 'bold' },
                4: { cellWidth: 46, fontSize: 8 },
                5: { cellWidth: 25 }
            }
        });

        // Revisionsvermerk & Fusszeile
        const finalY = doc.lastAutoTable.finalY + 12;
        doc.setFontSize(8);
        doc.setFont('helvetica', 'italic');
        doc.setTextColor(120, 120, 120);
        doc.text('Revisionssicherer Buchungsvermerk gemäss Vereinsreglement Sportschützen Muhen (OR 957ff).', 15, finalY);
        doc.text('Der Überschuss wird ordnungsgemäss über das Bilanz-Transitkonto 1301 geführt und bei Jahresabschluss auf Null saldiert.', 15, finalY + 4);

        doc.setFont('helvetica', 'normal');
        doc.text('Für die Richtigkeit (Schützenmeister / Kassier): __________________________________', 15, finalY + 15);

        // Download / Anzeige
        const safeName = (comp.gruppe_name || 'Gruppe').replace(/[^a-zA-Z0-9_-]/g, '_');
        doc.save(`Abrechnung_Gruppengewinn_${safeName}_${comp.jahr || '2026'}.pdf`);
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

    // Globale Exports am window-Objekt
    window.jmOnAnlassSelectChange = jmOnAnlassSelectChange;
    window.jmOnAnlassInputChange = jmOnAnlassInputChange;
    window.jmClearAnlassInput = jmClearAnlassInput;
    window.jmToggleCustomAnlassInput = jmToggleCustomAnlassInput;
    window.jmToggleGridShooterInEditor = jmToggleGridShooterInEditor;
    window.jmPopulateShootersFromJMRawGrid = jmPopulateShootersFromJMRawGrid;
    window.jmOpenGruppengewinneModal = jmOpenGruppengewinneModal;
    window.jmRenderGruppengewinneList = jmRenderGruppengewinneList;
    window.jmReloadGruppengewinneList = jmReloadGruppengewinneList;
    window.jmOnGruppengewinneYearChange = jmOnGruppengewinneYearChange;
    window.jmFilterGruppengewinneTable = jmFilterGruppengewinneTable;
    window.jmDeleteGroupCompetition = jmDeleteGroupCompetition;
    window.jmOpenGroupCompetitionEditor = jmOpenGroupCompetitionEditor;
    window.jmAddShooterRowToEditor = jmAddShooterRowToEditor;
    window.jmRemoveShooterRow = jmRemoveShooterRow;
    window.jmRecalculateCurrentComp = jmRecalculateCurrentComp;
    window.jmOnShooterNameChange = jmOnShooterNameChange;
    window.jmOnShooterPointsChange = jmOnShooterPointsChange;
    window.jmOnShooterAmountChange = jmOnShooterAmountChange;
    window.jmOnShooterMethodChange = jmOnShooterMethodChange;
    window.jmOnShooterIbanChange = jmOnShooterIbanChange;
    window.jmSaveCurrentComp = jmSaveCurrentComp;
    window.jmTransferCurrentCompToJahresbeitrag = jmTransferCurrentCompToJahresbeitrag;
    window.jmTransferCurrentCompToPaymentOrder = jmTransferCurrentCompToPaymentOrder;
    window.jmGenerateGruppengewinnPdf = jmGenerateGruppengewinnPdf;
    window.jmGenerateGruppengewinnPdfFromEditor = jmGenerateGruppengewinnPdfFromEditor;
    window.jmDetectGroupCompetitionFromImportLines = jmDetectGroupCompetitionFromImportLines;

})(window);

