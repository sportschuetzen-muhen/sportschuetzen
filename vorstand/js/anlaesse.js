/**
 * anlaesse.js
 * Modul: ANLÄSSE & Controlling (Native Supabase Integration)
 * Projektauftrag Punkte 12–17:
 * - Mengenrechner & Artikelplanung
 * - Bestellwesen & Lieferanten
 * - Checklisten & Vorbereitung (6 Phasen)
 * - Helfer / Stände & Schichten mit Bestätigung
 * - Vorlagenverwaltung & Duplizierung (create_event_from_template)
 * - Event-Controlling & Marge (v_event_controlling)
 */

window.AnlaesseModule = (function () {
    // ─────────────────────────────────────────────────────────────
    // STATE
    // ─────────────────────────────────────────────────────────────
    const state = {
        events: [],
        activeEventId: null,
        items: [],
        orders: [],
        checklists: [],
        shifts: [],
        shiftAssignments: [],
        controlling: null,
        activeTab: 'events',       // 'events', 'items', 'orders', 'checklists', 'shifts', 'controlling'
        filterCategory: 'all',
        filterStatus: 'all',
        filterPhase: 'all',
        searchQuery: '',
        isLoading: false,
        isRecalculating: false
    };

    function getClient() {
        if (typeof window.getSupabaseClient === 'function') {
            return window.getSupabaseClient();
        }
        return window.supabaseClient || null;
    }

    // ─────────────────────────────────────────────────────────────
    // FORMATIERUNG & UTILS
    // ─────────────────────────────────────────────────────────────
    function formatCHF(num) {
        const val = parseFloat(num) || 0;
        return 'CHF ' + val.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatDate(dateStr) {
        if (!dateStr) return '–';
        const parts = dateStr.split('-');
        if (parts.length === 3) {
            return `${parts[2]}.${parts[1]}.${parts[0]}`;
        }
        return dateStr;
    }

    function formatTime(timeStr) {
        if (!timeStr) return '';
        return timeStr.substring(0, 5);
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function showToast(message, type = 'success') {
        const alertBox = document.createElement('div');
        alertBox.className = `alert alert-${type} alert-dismissible fade show position-fixed shadow-lg`;
        alertBox.style.cssText = 'top: 20px; right: 20px; z-index: 9999; max-width: 400px; border-radius: 12px;';
        alertBox.innerHTML = `
            <div class="d-flex align-items-center">
                <i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2 fs-5"></i>
                <div class="flex-grow-1">${message}</div>
                <button type="button" class="btn-close ms-2" data-bs-dismiss="alert"></button>
            </div>
        `;
        document.body.appendChild(alertBox);
        setTimeout(() => {
            alertBox.classList.remove('show');
            setTimeout(() => alertBox.remove(), 300);
        }, 4000);
    }

    // ─────────────────────────────────────────────────────────────
    // DATA FETCHING (Supabase REST API)
    // ─────────────────────────────────────────────────────────────
    async function loadData() {
        const supa = getClient();
        if (!supa) {
            console.error('Supabase Client nicht bereit.');
            renderError('Supabase Verbindung nicht initialisiert. Bitte Seite neu laden.');
            return;
        }

        state.isLoading = true;
        renderLoadingIndicator(true);

        try {
            // 1. Events laden
            const { data: events, error: errEvents } = await supa
                .from('events')
                .select('*')
                .order('event_date', { ascending: false });

            if (errEvents) throw errEvents;
            state.events = events || [];

            // Standard-Event wählen falls keines gewählt oder altes gelöscht
            if (state.events.length > 0) {
                if (!state.activeEventId || !state.events.some(e => e.id === state.activeEventId)) {
                    // Bevorzuge nicht-Vorlagen, sonst erstes Event
                    const defaultEv = state.events.find(e => !e.is_template) || state.events[0];
                    state.activeEventId = defaultEv ? defaultEv.id : null;
                }
            } else {
                state.activeEventId = null;
            }

            // 2. Details für das aktive Event laden
            if (state.activeEventId) {
                await loadActiveEventDetails(state.activeEventId);
            }

            renderShell();
        } catch (err) {
            console.error('Fehler beim Laden der Anlässe-Daten:', err);
            showToast('Fehler beim Laden der Daten aus Supabase: ' + (err.message || err), 'danger');
            renderShell();
        } finally {
            state.isLoading = false;
            renderLoadingIndicator(false);
        }
    }

    async function loadActiveEventDetails(eventId) {
        const supa = getClient();
        if (!supa || !eventId) return;

        try {
            const [resItems, resOrders, resChecklists, resShifts, resControlling] = await Promise.all([
                supa.from('event_items').select('*').eq('event_id', eventId).order('category'),
                supa.from('event_orders').select('*').eq('event_id', eventId).order('delivery_date'),
                supa.from('event_checklists').select('*').eq('event_id', eventId).order('due_date'),
                supa.from('event_shifts').select('*').eq('event_id', eventId).order('start_time'),
                supa.from('v_event_controlling').select('*').eq('event_id', eventId).maybeSingle()
            ]);

            state.items = resItems.data || [];
            state.orders = resOrders.data || [];
            state.checklists = resChecklists.data || [];
            state.shifts = resShifts.data || [];
            state.controlling = resControlling.data || null;

            // Schicht-Zuweisungen für alle Schichten dieses Events laden
            if (state.shifts.length > 0) {
                const shiftIds = state.shifts.map(s => s.id);
                const { data: assignments } = await supa
                    .from('event_shift_assignments')
                    .select('*')
                    .in('shift_id', shiftIds);
                state.shiftAssignments = assignments || [];
            } else {
                state.shiftAssignments = [];
            }
        } catch (err) {
            console.error('Fehler beim Laden der Event-Details:', err);
            showToast('Fehler beim Laden der Event-Details: ' + err.message, 'danger');
        }
    }

    async function setActiveEvent(eventId, jumpToTab = null) {
        state.activeEventId = eventId;
        if (jumpToTab) {
            state.activeTab = jumpToTab;
        }
        await loadActiveEventDetails(eventId);
        renderShell();
    }

    // ─────────────────────────────────────────────────────────────
    // RENDERING: HAUPT-LAYOUT (SHELL)
    // ─────────────────────────────────────────────────────────────
    function renderShell() {
        const container = document.getElementById('view-anlaesse');
        if (!container) return;

        const activeEvent = state.events.find(e => e.id === state.activeEventId);

        container.innerHTML = `
            <div class="anlaesse-wrapper">
                <!-- TOP HEADER -->
                <div class="d-flex justify-content-between align-items-start mb-4 flex-wrap gap-3 pb-3 border-bottom">
                    <div>
                        <div class="d-flex align-items-center gap-2 mb-1">
                            <h2 class="fw-bold mb-0 text-primary" style="letter-spacing: -0.5px;">
                                <i class="fas fa-calendar-star me-2 text-primary"></i>Anlässe & Controlling
                            </h2>
                            <span class="badge rounded-pill bg-success-subtle text-success border border-success-subtle px-2.5 py-1 small fw-semibold">
                                <i class="fas fa-bolt me-1"></i>Supabase Native
                            </span>
                        </div>
                        <p class="text-muted small mb-0">
                            Event-Management, interaktiver Mengenrechner, Checklisten, Helfer-Disposition & Deckungsbeitrag (Punkte 12–17)
                        </p>
                    </div>

                    <!-- ACTION BUTTONS -->
                    <div class="d-flex align-items-center gap-2 flex-wrap">
                        <button class="btn btn-outline-secondary btn-sm px-3 shadow-sm rounded-pill" onclick="AnlaesseModule.reload()" title="Daten aus Supabase neu laden">
                            <i class="fas fa-arrows-rotate me-1 ${state.isLoading ? 'fa-spin' : ''}"></i>Aktualisieren
                        </button>
                        <button class="btn btn-outline-primary btn-sm px-3 shadow-sm rounded-pill" onclick="AnlaesseModule.openDuplicateModal()">
                            <i class="fas fa-copy me-1"></i>Aus Vorlage erzeugen
                        </button>
                        <button class="btn btn-primary btn-sm px-3 shadow-sm rounded-pill fw-bold" onclick="AnlaesseModule.openCreateModal()" style="background: linear-gradient(135deg, #0f3a5d, #1e4b7a); border: none;">
                            <i class="fas fa-plus me-1"></i>Neuer Anlass
                        </button>
                    </div>
                </div>

                <!-- EVENT CONTEXT BAR & SELECTOR -->
                <div class="card border-0 shadow-sm rounded-4 p-3 mb-4" style="background: linear-gradient(135deg, rgba(255,255,255,0.95), rgba(240,244,248,0.95)); border: 1px solid rgba(15,58,93,0.08);">
                    <div class="row g-3 align-items-center">
                        <div class="col-lg-5 col-md-6">
                            <label class="form-label small fw-bold text-muted mb-1">
                                <i class="fas fa-filter me-1 text-primary"></i>Aktiver Anlass / Vorlage:
                            </label>
                            <div class="input-group">
                                <span class="input-group-text bg-white border-end-0"><i class="fas fa-calendar-day text-primary"></i></span>
                                <select class="form-select border-start-0 fw-semibold" id="anlaesse-event-select" onchange="AnlaesseModule.onSelectEvent(this.value)">
                                    ${state.events.length === 0 ? '<option value="">Keine Anlässe vorhanden</option>' : ''}
                                    <optgroup label="📅 Geplante & Aktive Events">
                                        ${state.events.filter(e => !e.is_template).map(e => `
                                            <option value="${e.id}" ${e.id === state.activeEventId ? 'selected' : ''}>
                                                ${escapeHtml(e.name)} (${formatDate(e.event_date)}) – ${e.expected_visitors} Besucher
                                            </option>
                                        `).join('')}
                                    </optgroup>
                                    <optgroup label="📋 Event-Vorlagen">
                                        ${state.events.filter(e => e.is_template).map(e => `
                                            <option value="${e.id}" ${e.id === state.activeEventId ? 'selected' : ''}>
                                                [Vorlage] ${escapeHtml(e.name)} (Basis: ${e.expected_visitors} Besucher)
                                            </option>
                                        `).join('')}
                                    </optgroup>
                                </select>
                            </div>
                        </div>

                        ${activeEvent ? `
                            <div class="col-lg-7 col-md-6">
                                <div class="d-flex flex-wrap align-items-center justify-content-md-end gap-3 mt-2 mt-md-0">
                                    <div class="text-md-end">
                                        <div class="small text-muted">Datum & Ort</div>
                                        <div class="fw-bold text-dark">
                                            <i class="fas fa-calendar-alt text-muted me-1"></i>${formatDate(activeEvent.event_date)} 
                                            <span class="text-muted fw-normal ms-1">(${formatTime(activeEvent.start_time)} Uhr)</span>
                                        </div>
                                    </div>
                                    <div class="vr d-none d-md-block" style="height: 30px;"></div>
                                    <div class="text-md-end">
                                        <div class="small text-muted">Erwartete Besucher</div>
                                        <div class="fw-bold text-primary fs-6">
                                            <i class="fas fa-users text-primary me-1"></i>${activeEvent.expected_visitors} Pers.
                                        </div>
                                    </div>
                                    <div class="vr d-none d-md-block" style="height: 30px;"></div>
                                    <div class="text-md-end">
                                        <div class="small text-muted">Budget</div>
                                        <div class="fw-bold text-success">
                                            ${formatCHF(activeEvent.budget)}
                                        </div>
                                    </div>
                                    <div>
                                        ${getStatusBadge(activeEvent.status, activeEvent.is_template)}
                                    </div>
                                </div>
                            </div>
                        ` : ''}
                    </div>
                </div>

                <!-- NAVIGATION TABS -->
                <ul class="nav nav-pills custom-tabs mb-4 p-1.5 rounded-pill bg-white shadow-sm border" style="max-width: 100%; overflow-x: auto; flex-wrap: nowrap;">
                    <li class="nav-item">
                        <button class="nav-link text-nowrap fw-bold px-3 py-2 rounded-pill ${state.activeTab === 'events' ? 'active bg-primary text-white' : 'text-secondary'}" onclick="AnlaesseModule.switchTab('events')">
                            <i class="fas fa-th-list me-1.5"></i>Übersicht & Anlässe
                            <span class="badge rounded-pill ${state.activeTab === 'events' ? 'bg-white text-primary' : 'bg-light text-dark'} ms-1">${state.events.length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link text-nowrap fw-bold px-3 py-2 rounded-pill ${state.activeTab === 'items' ? 'active bg-primary text-white' : 'text-secondary'}" onclick="AnlaesseModule.switchTab('items')" ${!state.activeEventId ? 'disabled' : ''}>
                            <i class="fas fa-scale-balanced me-1.5"></i>Mengenrechner
                            <span class="badge rounded-pill ${state.activeTab === 'items' ? 'bg-white text-primary' : 'bg-light text-dark'} ms-1">${state.items.length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link text-nowrap fw-bold px-3 py-2 rounded-pill ${state.activeTab === 'orders' ? 'active bg-primary text-white' : 'text-secondary'}" onclick="AnlaesseModule.switchTab('orders')" ${!state.activeEventId ? 'disabled' : ''}>
                            <i class="fas fa-truck-ramp-box me-1.5"></i>Bestellwesen
                            <span class="badge rounded-pill ${state.activeTab === 'orders' ? 'bg-white text-primary' : 'bg-light text-dark'} ms-1">${state.orders.length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link text-nowrap fw-bold px-3 py-2 rounded-pill ${state.activeTab === 'checklists' ? 'active bg-primary text-white' : 'text-secondary'}" onclick="AnlaesseModule.switchTab('checklists')" ${!state.activeEventId ? 'disabled' : ''}>
                            <i class="fas fa-list-check me-1.5"></i>Checklisten
                            <span class="badge rounded-pill ${state.activeTab === 'checklists' ? 'bg-white text-primary' : 'bg-light text-dark'} ms-1">${state.checklists.length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link text-nowrap fw-bold px-3 py-2 rounded-pill ${state.activeTab === 'shifts' ? 'active bg-primary text-white' : 'text-secondary'}" onclick="AnlaesseModule.switchTab('shifts')" ${!state.activeEventId ? 'disabled' : ''}>
                            <i class="fas fa-users-gear me-1.5"></i>Helfer & Stände
                            <span class="badge rounded-pill ${state.activeTab === 'shifts' ? 'bg-white text-primary' : 'bg-light text-dark'} ms-1">${state.shifts.length}</span>
                        </button>
                    </li>
                    <li class="nav-item">
                        <button class="nav-link text-nowrap fw-bold px-3 py-2 rounded-pill ${state.activeTab === 'controlling' ? 'active bg-primary text-white' : 'text-secondary'}" onclick="AnlaesseModule.switchTab('controlling')" ${!state.activeEventId ? 'disabled' : ''}>
                            <i class="fas fa-chart-line me-1.5"></i>Controlling & Marge
                        </button>
                    </li>
                </ul>

                <!-- TAB CONTENT -->
                <div id="anlaesse-tab-content">
                    ${renderCurrentTab()}
                </div>
            </div>

            <!-- MODAL CONTAINERS -->
            <div id="anlaesse-modal-container"></div>
        `;
    }

    function renderCurrentTab() {
        switch (state.activeTab) {
            case 'events':
                return renderEventsTab();
            case 'items':
                return renderItemsTab();
            case 'orders':
                return renderOrdersTab();
            case 'checklists':
                return renderChecklistsTab();
            case 'shifts':
                return renderShiftsTab();
            case 'controlling':
                return renderControllingTab();
            default:
                return renderEventsTab();
        }
    }

    function renderLoadingIndicator(show) {
        const btn = document.querySelector('button[onclick="AnlaesseModule.reload()"] i');
        if (btn) {
            if (show) btn.classList.add('fa-spin');
            else btn.classList.remove('fa-spin');
        }
    }

    function renderError(msg) {
        const container = document.getElementById('view-anlaesse');
        if (!container) return;
        container.innerHTML = `
            <div class="alert alert-danger shadow-sm rounded-4 p-4 text-center">
                <i class="fas fa-triangle-exclamation fa-3x mb-3 text-danger"></i>
                <h4 class="fw-bold">Verbindungsfehler</h4>
                <p class="mb-3">${escapeHtml(msg)}</p>
                <button class="btn btn-outline-danger px-4 rounded-pill" onclick="AnlaesseModule.reload()">
                    <i class="fas fa-redo me-1"></i>Erneut versuchen
                </button>
            </div>
        `;
    }

    function getStatusBadge(status, isTemplate) {
        if (isTemplate) {
            return `<span class="badge bg-purple-subtle text-purple border border-purple-subtle rounded-pill px-2.5 py-1.5 font-monospace" style="background-color: #f3e8ff; color: #7e22ce;">
                <i class="fas fa-bookmark me-1"></i>Vorlage
            </span>`;
        }
        switch (status) {
            case 'planned':
                return `<span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-2.5 py-1.5">
                    <i class="fas fa-clock me-1"></i>Geplant
                </span>`;
            case 'active':
                return `<span class="badge bg-success-subtle text-success border border-success-subtle rounded-pill px-2.5 py-1.5">
                    <i class="fas fa-play me-1"></i>Aktiv
                </span>`;
            case 'completed':
                return `<span class="badge bg-secondary-subtle text-secondary border border-secondary-subtle rounded-pill px-2.5 py-1.5">
                    <i class="fas fa-check-double me-1"></i>Abgeschlossen
                </span>`;
            case 'cancelled':
                return `<span class="badge bg-danger-subtle text-danger border border-danger-subtle rounded-pill px-2.5 py-1.5">
                    <i class="fas fa-ban me-1"></i>Abgesagt
                </span>`;
            default:
                return `<span class="badge bg-light text-dark border rounded-pill px-2.5 py-1.5">
                    ${escapeHtml(status)}
                </span>`;
        }
    }

    // ─────────────────────────────────────────────────────────────
    // TAB 1: 📅 ÜBERSICHT & ANLÄSSE
    // ─────────────────────────────────────────────────────────────
    function renderEventsTab() {
        let filtered = state.events;

        if (state.filterStatus === 'templates') {
            filtered = filtered.filter(e => e.is_template);
        } else if (state.filterStatus !== 'all') {
            filtered = filtered.filter(e => !e.is_template && e.status === state.filterStatus);
        }

        if (state.searchQuery.trim()) {
            const q = state.searchQuery.toLowerCase().trim();
            filtered = filtered.filter(e =>
                (e.name && e.name.toLowerCase().includes(q)) ||
                (e.location && e.location.toLowerCase().includes(q)) ||
                (e.manager_name && e.manager_name.toLowerCase().includes(q))
            );
        }

        return `
            <div class="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <!-- Filter & Search Toolbar -->
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <!-- Filter Pills -->
                    <div class="btn-group btn-group-sm rounded-pill p-1 bg-light border" role="group">
                        <button type="button" class="btn rounded-pill fw-semibold ${state.filterStatus === 'all' ? 'btn-primary text-white shadow-sm' : 'btn-light text-muted'}" onclick="AnlaesseModule.setEventFilter('all')">
                            Alle Anlässe
                        </button>
                        <button type="button" class="btn rounded-pill fw-semibold ${state.filterStatus === 'planned' ? 'btn-primary text-white shadow-sm' : 'btn-light text-muted'}" onclick="AnlaesseModule.setEventFilter('planned')">
                            Geplant
                        </button>
                        <button type="button" class="btn rounded-pill fw-semibold ${state.filterStatus === 'active' ? 'btn-primary text-white shadow-sm' : 'btn-light text-muted'}" onclick="AnlaesseModule.setEventFilter('active')">
                            Aktiv
                        </button>
                        <button type="button" class="btn rounded-pill fw-semibold ${state.filterStatus === 'completed' ? 'btn-primary text-white shadow-sm' : 'btn-light text-muted'}" onclick="AnlaesseModule.setEventFilter('completed')">
                            Abgeschlossen
                        </button>
                        <button type="button" class="btn rounded-pill fw-semibold ${state.filterStatus === 'templates' ? 'btn-primary text-white shadow-sm' : 'btn-light text-muted'}" onclick="AnlaesseModule.setEventFilter('templates')">
                            <i class="fas fa-bookmark me-1 text-warning"></i>Vorlagen
                        </button>
                    </div>

                    <!-- Search Input -->
                    <div class="input-group input-group-sm" style="max-width: 280px;">
                        <span class="input-group-text bg-light border-end-0"><i class="fas fa-search text-muted"></i></span>
                        <input type="text" class="form-control bg-light border-start-0" placeholder="Anlass suchen..." value="${escapeHtml(state.searchQuery)}" oninput="AnlaesseModule.onSearch(this.value)">
                    </div>
                </div>

                <!-- Event Grid -->
                <div class="row g-3">
                    ${filtered.length === 0 ? `
                        <div class="col-12 text-center py-5 text-muted">
                            <i class="fas fa-calendar-xmark fa-3x mb-3 text-secondary opacity-50"></i>
                            <p class="mb-0">Keine Anlässe für diesen Filter gefunden.</p>
                        </div>
                    ` : filtered.map(ev => `
                        <div class="col-xl-4 col-md-6">
                            <div class="card h-100 border rounded-4 p-3.5 shadow-sm transition-hover ${ev.id === state.activeEventId ? 'border-primary' : 'border-light'}" style="background: ${ev.id === state.activeEventId ? '#f8fafc' : '#ffffff'}; position: relative;">
                                ${ev.id === state.activeEventId ? `
                                    <span class="position-absolute top-0 start-50 translate-middle badge rounded-pill bg-primary px-3 py-1 shadow-sm small">
                                        <i class="fas fa-check-circle me-1"></i>Aktiv ausgewählt
                                    </span>
                                ` : ''}

                                <div class="d-flex justify-content-between align-items-start mb-2">
                                    <h5 class="fw-bold text-dark mb-0 line-clamp-1" title="${escapeHtml(ev.name)}">
                                        ${escapeHtml(ev.name)}
                                    </h5>
                                    <div>${getStatusBadge(ev.status, ev.is_template)}</div>
                                </div>

                                <p class="text-muted small mb-3 line-clamp-2" style="min-height: 38px;">
                                    ${escapeHtml(ev.description || 'Keine Beschreibung hinterlegt.')}
                                </p>

                                <div class="bg-light rounded-3 p-2.5 mb-3 small">
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted"><i class="fas fa-calendar-day me-1 text-primary"></i>Datum:</span>
                                        <span class="fw-semibold">${formatDate(ev.event_date)} (${formatTime(ev.start_time)} - ${formatTime(ev.end_time)})</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted"><i class="fas fa-location-dot me-1 text-danger"></i>Ort:</span>
                                        <span class="fw-semibold">${escapeHtml(ev.location)}</span>
                                    </div>
                                    <div class="d-flex justify-content-between mb-1">
                                        <span class="text-muted"><i class="fas fa-user-tie me-1 text-secondary"></i>Leitung:</span>
                                        <span class="fw-semibold">${escapeHtml(ev.manager_name || '–')}</span>
                                    </div>
                                    <div class="d-flex justify-content-between">
                                        <span class="text-muted"><i class="fas fa-users me-1 text-info"></i>Besucher:</span>
                                        <span class="fw-bold text-primary">${ev.expected_visitors} Pers. (Budget: ${formatCHF(ev.budget)})</span>
                                    </div>
                                </div>

                                <!-- Card Actions -->
                                <div class="d-flex justify-content-between align-items-center mt-auto pt-2 border-top">
                                    <button class="btn btn-sm ${ev.id === state.activeEventId ? 'btn-primary' : 'btn-outline-primary'} rounded-pill px-3 fw-semibold" onclick="AnlaesseModule.setActiveEvent('${ev.id}', 'items')">
                                        <i class="fas fa-arrow-right me-1"></i>Öffnen
                                    </button>
                                    <div class="d-flex gap-1">
                                        ${ev.is_template ? `
                                            <button class="btn btn-sm btn-outline-success rounded-pill px-2.5" onclick="AnlaesseModule.openDuplicateModal('${ev.id}')" title="Aus dieser Vorlage einen Anlass erstellen">
                                                <i class="fas fa-plus me-1"></i>Verwenden
                                            </button>
                                        ` : `
                                            <button class="btn btn-sm btn-outline-secondary rounded-pill px-2" onclick="AnlaesseModule.openEditModal('${ev.id}')" title="Bearbeiten">
                                                <i class="fas fa-pencil"></i>
                                            </button>
                                        `}
                                        <button class="btn btn-sm btn-outline-danger rounded-pill px-2" onclick="AnlaesseModule.deleteEvent('${ev.id}')" title="Löschen">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // TAB 2: ⚖️ MENGENRECHNER & ARTIKELPLANUNG
    // ─────────────────────────────────────────────────────────────
    function renderItemsTab() {
        const activeEvent = state.events.find(e => e.id === state.activeEventId);
        if (!activeEvent) {
            return `<div class="alert alert-warning">Bitte wähle zuerst einen Anlass aus.</div>`;
        }

        const categories = ['Alle', 'Festwirtschaft', 'Grill', 'Getränke', 'Bar', 'Munition', 'Infrastruktur'];

        let filteredItems = state.items;
        if (state.filterCategory !== 'all' && state.filterCategory !== 'Alle') {
            filteredItems = filteredItems.filter(i => i.category === state.filterCategory);
        }

        // Berechnete Gesamtsummen für Mengenplanung
        const totalPlannedCost = filteredItems.reduce((acc, i) => acc + ((parseFloat(i.order_qty) || 0) * (parseFloat(i.cost_price) || 0)), 0);
        const totalPlannedRevenue = filteredItems.reduce((acc, i) => acc + ((parseFloat(i.order_qty) || 0) * (parseFloat(i.sales_price) || 0)), 0);
        const totalActualCost = filteredItems.reduce((acc, i) => acc + ((parseFloat(i.actual_qty) || 0) * (parseFloat(i.cost_price) || 0)), 0);
        const totalActualRevenue = filteredItems.reduce((acc, i) => acc + ((parseFloat(i.sold_qty) || 0) * (parseFloat(i.sales_price) || 0)), 0);

        return `
            <div class="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <!-- FORMEL-BANNER & MENGENRECHNER HEADER -->
                <div class="p-3.5 rounded-4 mb-4" style="background: linear-gradient(135deg, rgba(15,58,93,0.04), rgba(30,75,122,0.08)); border: 1px solid rgba(15,58,93,0.12);">
                    <div class="d-flex justify-content-between align-items-center flex-wrap gap-3">
                        <div>
                            <div class="d-flex align-items-center gap-2 mb-1">
                                <h5 class="fw-bold mb-0 text-primary">
                                    <i class="fas fa-calculator me-2"></i>Interaktiver Mengenrechner
                                </h5>
                                <span class="badge bg-primary rounded-pill px-2.5 py-1">
                                    Formel: Besucher × Faktor × Sicherheit
                                </span>
                            </div>
                            <div class="text-muted small">
                                Basis: <strong class="text-dark">${activeEvent.expected_visitors} Besucher</strong>.
                                Bei Änderung der Besucherzahl werden alle Artikel-Empfehlungen automatisch dynamisch angepasst.
                            </div>
                        </div>

                        <!-- QUICK VISITOR RESCALING -->
                        <div class="d-flex align-items-center gap-2">
                            <div class="input-group input-group-sm" style="max-width: 220px;">
                                <span class="input-group-text bg-white fw-semibold">Besucher:</span>
                                <input type="number" class="form-control text-center fw-bold" id="quick-visitors-input" value="${activeEvent.expected_visitors}" min="1" max="10000">
                                <button class="btn btn-outline-primary fw-semibold" type="button" onclick="AnlaesseModule.recalcWithVisitors()" title="Empfohlene Mengen für neue Besucherzahl berechnen">
                                    <i class="fas fa-sync-alt ${state.isRecalculating ? 'fa-spin' : ''}"></i>
                                </button>
                            </div>
                            <button class="btn btn-success btn-sm rounded-pill px-3 fw-bold shadow-sm" onclick="AnlaesseModule.openAddItemModal()">
                                <i class="fas fa-plus me-1"></i>Artikel hinzufügen
                            </button>
                        </div>
                    </div>

                    <!-- FINANCIAL KPI SUMMARY BAR -->
                    <div class="row g-2 mt-3 pt-3 border-top border-secondary-subtle">
                        <div class="col-sm-3 col-6">
                            <div class="small text-muted">Geplante Kosten (Einkauf):</div>
                            <div class="fw-bold text-dark fs-6">${formatCHF(totalPlannedCost)}</div>
                        </div>
                        <div class="col-sm-3 col-6">
                            <div class="small text-muted">Geplanter Erlös (Verkauf):</div>
                            <div class="fw-bold text-primary fs-6">${formatCHF(totalPlannedRevenue)}</div>
                        </div>
                        <div class="col-sm-3 col-6">
                            <div class="small text-muted">Erwartete Marge:</div>
                            <div class="fw-bold text-success fs-6">${formatCHF(totalPlannedRevenue - totalPlannedCost)}</div>
                        </div>
                        <div class="col-sm-3 col-6">
                            <div class="small text-muted">Effektiver Erlös (Ist):</div>
                            <div class="fw-bold text-info fs-6">${formatCHF(totalActualRevenue)}</div>
                        </div>
                    </div>
                </div>

                <!-- CATEGORY FILTER PILLS -->
                <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <div class="d-flex gap-1 flex-wrap">
                        ${categories.map(cat => `
                            <button type="button" class="btn btn-sm rounded-pill fw-semibold ${state.filterCategory === cat || (state.filterCategory === 'all' && cat === 'Alle') ? 'btn-primary text-white shadow-sm' : 'btn-light text-muted border'}" onclick="AnlaesseModule.setCategoryFilter('${cat}')">
                                ${cat}
                            </button>
                        `).join('')}
                    </div>
                    <div class="text-muted small">
                        ${filteredItems.length} Artikel in dieser Ansicht
                    </div>
                </div>

                <!-- ARTIKEL TABELLE -->
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light text-muted small text-uppercase">
                            <tr>
                                <th>Artikel / Kategorie</th>
                                <th class="text-center">Einheit</th>
                                <th class="text-end">EK (CHF)</th>
                                <th class="text-end">VK (CHF)</th>
                                <th class="text-center" title="Menge pro Besucher">Faktor / Pers.</th>
                                <th class="text-center" title="Sicherheitsaufschlag">Sicherheit</th>
                                <th class="text-end bg-primary-subtle text-primary fw-bold" title="Empfohlene Menge nach Formel">Empfohlen</th>
                                <th class="text-end fw-bold">Bestellt</th>
                                <th class="text-end">Geliefert</th>
                                <th class="text-end">Verkauft</th>
                                <th class="text-end">Rest</th>
                                <th class="text-center" style="width: 100px;">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredItems.length === 0 ? `
                                <tr>
                                    <td colspan="12" class="text-center py-4 text-muted">
                                        Keine Artikel in dieser Kategorie vorhanden. Klicke auf „Artikel hinzufügen“.
                                    </td>
                                </tr>
                            ` : filteredItems.map(item => {
                                const ek = parseFloat(item.cost_price) || 0;
                                const vk = parseFloat(item.sales_price) || 0;
                                const marginPct = vk > 0 ? Math.round(((vk - ek) / vk) * 100) : 0;
                                return `
                                    <tr>
                                        <td>
                                            <div class="fw-bold text-dark">${escapeHtml(item.item_name)}</div>
                                            <span class="badge bg-light text-secondary border small">${escapeHtml(item.category)}</span>
                                        </td>
                                        <td class="text-center">
                                            <span class="badge bg-light text-dark font-monospace">${escapeHtml(item.unit)}</span>
                                        </td>
                                        <td class="text-end font-monospace">${ek.toFixed(2)}</td>
                                        <td class="text-end font-monospace">
                                            ${vk.toFixed(2)}
                                            <div class="small text-success" style="font-size: 0.72rem;">+${marginPct}%</div>
                                        </td>
                                        <td class="text-center font-monospace">${parseFloat(item.qty_per_visitor).toFixed(2)}</td>
                                        <td class="text-center font-monospace">${parseFloat(item.safety_factor).toFixed(2)}</td>
                                        <td class="text-end bg-primary-subtle font-monospace fw-bold text-primary">
                                            ${parseFloat(item.recommended_qty).toFixed(1)}
                                        </td>
                                        <td class="text-end font-monospace fw-bold">
                                            <input type="number" class="form-control form-control-sm text-end d-inline-block font-monospace fw-bold" style="width: 85px;" value="${item.order_qty}" onchange="AnlaesseModule.updateItemQuantity('${item.id}', 'order_qty', this.value)">
                                        </td>
                                        <td class="text-end font-monospace">
                                            <input type="number" class="form-control form-control-sm text-end d-inline-block font-monospace" style="width: 80px;" value="${item.actual_qty}" onchange="AnlaesseModule.updateItemQuantity('${item.id}', 'actual_qty', this.value)">
                                        </td>
                                        <td class="text-end font-monospace">
                                            <input type="number" class="form-control form-control-sm text-end d-inline-block font-monospace" style="width: 80px;" value="${item.sold_qty}" onchange="AnlaesseModule.updateItemQuantity('${item.id}', 'sold_qty', this.value)">
                                        </td>
                                        <td class="text-end font-monospace fw-semibold ${parseFloat(item.remaining_qty) > 0 ? 'text-warning' : 'text-muted'}">
                                            ${(parseFloat(item.actual_qty || item.order_qty) - parseFloat(item.sold_qty)).toFixed(1)}
                                        </td>
                                        <td class="text-center">
                                            <div class="btn-group btn-group-sm">
                                                <button class="btn btn-outline-secondary btn-sm" onclick="AnlaesseModule.openEditItemModal('${item.id}')" title="Artikel bearbeiten">
                                                    <i class="fas fa-pencil"></i>
                                                </button>
                                                <button class="btn btn-outline-danger btn-sm" onclick="AnlaesseModule.deleteItem('${item.id}')" title="Löschen">
                                                    <i class="fas fa-trash"></i>
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // TAB 3: 🛒 BESTELLWESEN & LIEFERANTEN
    // ─────────────────────────────────────────────────────────────
    function renderOrdersTab() {
        const totalOrderSum = state.orders.reduce((acc, o) => acc + (parseFloat(o.total_price) || 0), 0);

        return `
            <div class="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h5 class="fw-bold mb-1 text-primary">
                            <i class="fas fa-truck-ramp-box me-2"></i>Lieferanten-Bestellungen
                        </h5>
                        <p class="text-muted small mb-0">Bestellübersicht, Liefertermine und Status für den Anlass</p>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <div class="text-end">
                            <div class="small text-muted">Bestellvolumen gesamt:</div>
                            <div class="fw-bold text-success fs-5">${formatCHF(totalOrderSum)}</div>
                        </div>
                        <button class="btn btn-primary btn-sm rounded-pill px-3 fw-bold shadow-sm" onclick="AnlaesseModule.openAddOrderModal()">
                            <i class="fas fa-plus me-1"></i>Bestellung erfassen
                        </button>
                    </div>
                </div>

                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light text-muted small text-uppercase">
                            <tr>
                                <th>Lieferant & Kontakt</th>
                                <th>Artikel / Beschreibung</th>
                                <th class="text-center">Menge</th>
                                <th class="text-end">Gesamtpreis</th>
                                <th class="text-center">Liefertermin</th>
                                <th class="text-center">Status</th>
                                <th class="text-center" style="width: 120px;">Aktionen</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${state.orders.length === 0 ? `
                                <tr>
                                    <td colspan="7" class="text-center py-4 text-muted">
                                        Noch keine Lieferanten-Bestellungen für diesen Anlass erfasst.
                                    </td>
                                </tr>
                            ` : state.orders.map(o => `
                                <tr>
                                    <td>
                                        <div class="fw-bold text-dark">${escapeHtml(o.supplier_name)}</div>
                                        <div class="small text-muted">${escapeHtml(o.supplier_contact || '–')}</div>
                                    </td>
                                    <td>
                                        <div class="fw-semibold text-dark">${escapeHtml(o.item_description)}</div>
                                        ${o.notes ? `<div class="small text-muted">${escapeHtml(o.notes)}</div>` : ''}
                                    </td>
                                    <td class="text-center font-monospace fw-bold">
                                        ${parseFloat(o.quantity).toFixed(1)} ${escapeHtml(o.unit)}
                                    </td>
                                    <td class="text-end font-monospace fw-bold text-dark">
                                        ${formatCHF(o.total_price)}
                                    </td>
                                    <td class="text-center small">
                                        <div><i class="fas fa-calendar-day me-1 text-primary"></i>${formatDate(o.delivery_date)}</div>
                                        ${o.delivery_time ? `<div class="text-muted">${formatTime(o.delivery_time)} Uhr</div>` : ''}
                                    </td>
                                    <td class="text-center">
                                        <select class="form-select form-select-sm fw-semibold" style="width: auto; margin: 0 auto;" onchange="AnlaesseModule.updateOrderStatus('${o.id}', this.value)">
                                            <option value="draft" ${o.status === 'draft' ? 'selected' : ''}>📝 Entwurf</option>
                                            <option value="ordered" ${o.status === 'ordered' ? 'selected' : ''}>📤 Bestellt</option>
                                            <option value="confirmed" ${o.status === 'confirmed' ? 'selected' : ''}>✅ Bestätigt</option>
                                            <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>📦 Geliefert</option>
                                            <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>❌ Storniert</option>
                                        </select>
                                    </td>
                                    <td class="text-center">
                                        <button class="btn btn-outline-danger btn-sm rounded-pill px-2.5" onclick="AnlaesseModule.deleteOrder('${o.id}')" title="Löschen">
                                            <i class="fas fa-trash"></i>
                                        </button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // TAB 4: ✅ CHECKLISTEN & VORBEREITUNG (6 PHASEN)
    // ─────────────────────────────────────────────────────────────
    function renderChecklistsTab() {
        const phases = ['Vorbereitung', 'Einkauf', 'Aufbau', 'Durchführung', 'Abbau', 'Nachbereitung'];

        // Statistiken
        const totalTasks = state.checklists.length;
        const doneTasks = state.checklists.filter(c => c.status === 'completed').length;
        const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

        return `
            <div class="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h5 class="fw-bold mb-1 text-primary">
                            <i class="fas fa-list-check me-2"></i>Checklisten & Phasen-Aufgaben
                        </h5>
                        <p class="text-muted small mb-0">Systematische Vorbereitung in 6 Phasen von der Planung bis zur Nachbereitung</p>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <div class="text-end">
                            <div class="small text-muted">Fortschritt: ${doneTasks} von ${totalTasks} Aufgaben</div>
                            <div class="progress" style="width: 140px; height: 8px;">
                                <div class="progress-bar bg-success" role="progressbar" style="width: ${pct}%;"></div>
                            </div>
                        </div>
                        <button class="btn btn-primary btn-sm rounded-pill px-3 fw-bold shadow-sm" onclick="AnlaesseModule.openAddChecklistModal()">
                            <i class="fas fa-plus me-1"></i>Aufgabe anlegen
                        </button>
                    </div>
                </div>

                <!-- PHASEN-ACCORDION ODER GRUPPIERUNG -->
                <div class="row g-3">
                    ${phases.map(phase => {
                        const phaseTasks = state.checklists.filter(c => c.phase === phase);
                        const phaseDone = phaseTasks.filter(c => c.status === 'completed').length;
                        return `
                            <div class="col-lg-6">
                                <div class="card h-100 border rounded-4 p-3.5 shadow-sm" style="background: #ffffff;">
                                    <div class="d-flex justify-content-between align-items-center mb-3 pb-2 border-bottom">
                                        <div class="d-flex align-items-center gap-2">
                                            <span class="badge rounded-pill bg-primary px-2.5 py-1">
                                                ${getPhaseIcon(phase)} ${phase}
                                            </span>
                                            <span class="small text-muted fw-semibold">(${phaseDone}/${phaseTasks.length} erledigt)</span>
                                        </div>
                                        <button class="btn btn-sm btn-outline-primary rounded-pill py-0 px-2" style="font-size: 0.75rem;" onclick="AnlaesseModule.openAddChecklistModal('${phase}')">
                                            <i class="fas fa-plus me-1"></i>Task
                                        </button>
                                    </div>

                                    <div class="d-flex flex-column gap-2">
                                        ${phaseTasks.length === 0 ? `
                                            <div class="text-muted small text-center py-3">Keine Aufgaben in dieser Phase.</div>
                                        ` : phaseTasks.map(t => `
                                            <div class="d-flex align-items-center justify-content-between p-2 rounded-3 border ${t.status === 'completed' ? 'bg-light opacity-75' : 'bg-white'}" style="transition: all 0.2s;">
                                                <div class="d-flex align-items-center gap-2.5 flex-grow-1">
                                                    <input class="form-check-input mt-0 fs-5" type="checkbox" ${t.status === 'completed' ? 'checked' : ''} onchange="AnlaesseModule.toggleChecklist('${t.id}', this.checked)" style="cursor: pointer;">
                                                    <div>
                                                        <div class="fw-semibold text-dark ${t.status === 'completed' ? 'text-decoration-line-through text-muted' : ''}">
                                                            ${escapeHtml(t.task)}
                                                        </div>
                                                        <div class="d-flex align-items-center gap-2 small text-muted">
                                                            ${t.assigned_to ? `<span><i class="fas fa-user text-secondary me-1"></i>${escapeHtml(t.assigned_to)}</span>` : ''}
                                                            ${t.due_date ? `<span><i class="fas fa-clock text-primary me-1"></i>${formatDate(t.due_date)}</span>` : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="d-flex align-items-center gap-1.5 ms-2">
                                                    ${getPriorityBadge(t.priority)}
                                                    <button class="btn btn-sm btn-link text-danger p-0 ms-1" onclick="AnlaesseModule.deleteChecklist('${t.id}')" title="Löschen">
                                                        <i class="fas fa-times"></i>
                                                    </button>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    function getPhaseIcon(phase) {
        switch (phase) {
            case 'Vorbereitung': return '<i class="fas fa-clipboard-list me-1"></i>';
            case 'Einkauf': return '<i class="fas fa-basket-shopping me-1"></i>';
            case 'Aufbau': return '<i class="fas fa-hammer me-1"></i>';
            case 'Durchführung': return '<i class="fas fa-champagne-glasses me-1"></i>';
            case 'Abbau': return '<i class="fas fa-dolly me-1"></i>';
            case 'Nachbereitung': return '<i class="fas fa-receipt me-1"></i>';
            default: return '<i class="fas fa-check me-1"></i>';
        }
    }

    function getPriorityBadge(priority) {
        switch (priority) {
            case 'urgent':
                return '<span class="badge bg-danger rounded-pill px-2 py-0.5" style="font-size: 0.7rem;">Dringend</span>';
            case 'high':
                return '<span class="badge bg-warning text-dark rounded-pill px-2 py-0.5" style="font-size: 0.7rem;">Hoch</span>';
            case 'medium':
                return '<span class="badge bg-primary-subtle text-primary rounded-pill px-2 py-0.5" style="font-size: 0.7rem;">Mittel</span>';
            case 'low':
                return '<span class="badge bg-light text-muted border rounded-pill px-2 py-0.5" style="font-size: 0.7rem;">Tief</span>';
            default:
                return '';
        }
    }

    // ─────────────────────────────────────────────────────────────
    // TAB 5: 👥 HELFER & STÄNDE / SCHICHTEN
    // ─────────────────────────────────────────────────────────────
    function renderShiftsTab() {
        const totalHelpersNeeded = state.shifts.reduce((acc, s) => acc + (parseInt(s.required_helpers) || 1), 0);
        const totalHelpersAssigned = state.shiftAssignments.length;

        return `
            <div class="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h5 class="fw-bold mb-1 text-primary">
                            <i class="fas fa-users-gear me-2"></i>Helfer, Stände & Schichtplan
                        </h5>
                        <p class="text-muted small mb-0">Einsatzplanung für Grill, Ausschank, Kasse, Standblattbüro und Helfer-Bestätigungen</p>
                    </div>
                    <div class="d-flex align-items-center gap-3">
                        <div class="text-end">
                            <div class="small text-muted">Helfer-Besetzung:</div>
                            <div class="fw-bold ${totalHelpersAssigned >= totalHelpersNeeded ? 'text-success' : 'text-warning'} fs-6">
                                ${totalHelpersAssigned} von ${totalHelpersNeeded} Plätzen besetzt
                            </div>
                        </div>
                        <button class="btn btn-primary btn-sm rounded-pill px-3 fw-bold shadow-sm" onclick="AnlaesseModule.openAddShiftModal()">
                            <i class="fas fa-plus me-1"></i>Schicht hinzufügen
                        </button>
                    </div>
                </div>

                <div class="row g-3">
                    ${state.shifts.length === 0 ? `
                        <div class="col-12 text-center py-5 text-muted">
                            <i class="fas fa-person-circle-question fa-3x mb-3 text-secondary opacity-50"></i>
                            <p>Noch keine Schichten oder Stände für diesen Anlass definiert.</p>
                        </div>
                    ` : state.shifts.map(shift => {
                        const assignments = state.shiftAssignments.filter(a => a.shift_id === shift.id);
                        const isFilled = assignments.length >= shift.required_helpers;

                        return `
                            <div class="col-lg-6">
                                <div class="card h-100 border rounded-4 p-3.5 shadow-sm ${isFilled ? 'border-success-subtle' : 'border-warning-subtle'}" style="background: #ffffff;">
                                    <div class="d-flex justify-content-between align-items-start mb-2">
                                        <div>
                                            <span class="badge bg-light text-primary border fw-bold px-2.5 py-1 mb-1">
                                                <i class="fas fa-store me-1"></i>${escapeHtml(shift.area)}
                                            </span>
                                            <h5 class="fw-bold text-dark mb-0">${escapeHtml(shift.role_name)}</h5>
                                        </div>
                                        <div>
                                            <span class="badge ${isFilled ? 'bg-success-subtle text-success border border-success-subtle' : 'bg-warning-subtle text-warning border border-warning-subtle'} rounded-pill px-2.5 py-1">
                                                ${assignments.length} / ${shift.required_helpers} Helfer
                                            </span>
                                        </div>
                                    </div>

                                    <div class="small text-muted mb-3">
                                        <i class="fas fa-clock text-primary me-1"></i>${formatTime(shift.start_time)} – ${formatTime(shift.end_time)} Uhr
                                        ${shift.description ? `<div class="mt-1 text-secondary">${escapeHtml(shift.description)}</div>` : ''}
                                    </div>

                                    <!-- EINGETEILTE HELFER -->
                                    <div class="border-top pt-2.5 mb-3">
                                        <div class="d-flex justify-content-between align-items-center mb-2">
                                            <span class="small fw-bold text-muted text-uppercase">Eingeteilte Helfer:</span>
                                            <button class="btn btn-sm btn-outline-primary rounded-pill py-0 px-2" style="font-size: 0.75rem;" onclick="AnlaesseModule.openAssignHelperModal('${shift.id}')">
                                                <i class="fas fa-user-plus me-1"></i>Helfer zuweisen
                                            </button>
                                        </div>

                                        <div class="d-flex flex-column gap-1.5">
                                            ${assignments.length === 0 ? `
                                                <div class="text-muted small fst-italic py-1">Noch kein Helfer eingeteilt.</div>
                                            ` : assignments.map(a => `
                                                <div class="d-flex justify-content-between align-items-center p-2 rounded-3 bg-light">
                                                    <div>
                                                        <div class="fw-semibold text-dark small">${escapeHtml(a.helper_name)}</div>
                                                        <div class="text-muted" style="font-size: 0.72rem;">${escapeHtml(a.helper_phone || a.helper_email || '')}</div>
                                                    </div>
                                                    <div class="d-flex align-items-center gap-1">
                                                        <button class="btn btn-sm ${a.confirmed_by_helper ? 'btn-success' : 'btn-outline-secondary'} py-0 px-2 rounded-pill" style="font-size: 0.72rem;" onclick="AnlaesseModule.toggleHelperConfirmation('${a.id}', ${!a.confirmed_by_helper})" title="Bestätigungsstatus umschalten">
                                                            <i class="fas ${a.confirmed_by_helper ? 'fa-check-circle' : 'fa-clock'} me-1"></i>${a.confirmed_by_helper ? 'Bestätigt' : 'Offen'}
                                                        </button>
                                                        <button class="btn btn-sm btn-link text-danger p-0 ms-1" onclick="AnlaesseModule.removeHelperAssignment('${a.id}')" title="Helfer entfernen">
                                                            <i class="fas fa-trash"></i>
                                                        </button>
                                                    </div>
                                                </div>
                                            `).join('')}
                                        </div>
                                    </div>

                                    <div class="d-flex justify-content-end mt-auto pt-2 border-top">
                                        <button class="btn btn-sm btn-outline-danger rounded-pill px-2.5 py-0.5" style="font-size: 0.75rem;" onclick="AnlaesseModule.deleteShift('${shift.id}')">
                                            <i class="fas fa-trash me-1"></i>Schicht löschen
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // TAB 6: 📊 EVENT-CONTROLLING & MARGE (v_event_controlling)
    // ─────────────────────────────────────────────────────────────
    function renderControllingTab() {
        const c = state.controlling;
        const activeEvent = state.events.find(e => e.id === state.activeEventId);

        if (!activeEvent) {
            return `<div class="alert alert-warning">Bitte wähle zuerst einen Anlass aus.</div>`;
        }

        const plannedCost = parseFloat(c ? c.planned_cost : 0) || 0;
        const actualCost = parseFloat(c ? c.actual_cost : 0) || 0;
        const plannedRevenue = parseFloat(c ? c.planned_revenue : 0) || 0;
        const actualRevenue = parseFloat(c ? c.actual_revenue : 0) || 0;
        const grossMargin = actualRevenue > 0 ? (actualRevenue - actualCost) : (plannedRevenue - plannedCost);
        const totalHelperHours = parseFloat(c ? c.total_helper_hours : 0) || 0;
        const marginPerHour = totalHelperHours > 0 ? (grossMargin / totalHelperHours) : 0;

        return `
            <div class="card border-0 shadow-sm rounded-4 p-4 bg-white">
                <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
                    <div>
                        <h5 class="fw-bold mb-1 text-primary">
                            <i class="fas fa-chart-pie me-2"></i>Event-Controlling & Marge
                        </h5>
                        <p class="text-muted small mb-0">Echtzeit-Auswertung über PostgreSQL View <code>v_event_controlling</code> (Punkt 16)</p>
                    </div>
                    <span class="badge bg-primary-subtle text-primary border border-primary-subtle rounded-pill px-3 py-1.5 fw-semibold">
                        <i class="fas fa-calendar-check me-1"></i>${escapeHtml(activeEvent.name)}
                    </span>
                </div>

                <!-- 4 KPI KACHELN -->
                <div class="row g-3 mb-4">
                    <!-- Kachel 1: Kosten -->
                    <div class="col-lg-3 col-sm-6">
                        <div class="card p-3.5 border-0 rounded-4 shadow-sm h-100" style="background: linear-gradient(135deg, #fef2f2, #fee2e2);">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="small fw-bold text-danger text-uppercase">Gesamtkosten</span>
                                <i class="fas fa-receipt text-danger fs-5 opacity-75"></i>
                            </div>
                            <h3 class="fw-bold text-dark mb-1">${formatCHF(actualCost > 0 ? actualCost : plannedCost)}</h3>
                            <div class="small text-muted">
                                Soll: ${formatCHF(plannedCost)} | Ist: ${formatCHF(actualCost)}
                            </div>
                        </div>
                    </div>

                    <!-- Kachel 2: Erlös -->
                    <div class="col-lg-3 col-sm-6">
                        <div class="card p-3.5 border-0 rounded-4 shadow-sm h-100" style="background: linear-gradient(135deg, #eff6ff, #dbeafe);">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="small fw-bold text-primary text-uppercase">Einnahmen (Erlös)</span>
                                <i class="fas fa-cash-register text-primary fs-5 opacity-75"></i>
                            </div>
                            <h3 class="fw-bold text-dark mb-1">${formatCHF(actualRevenue > 0 ? actualRevenue : plannedRevenue)}</h3>
                            <div class="small text-muted">
                                Soll: ${formatCHF(plannedRevenue)} | Ist: ${formatCHF(actualRevenue)}
                            </div>
                        </div>
                    </div>

                    <!-- Kachel 3: Bruttomarge -->
                    <div class="col-lg-3 col-sm-6">
                        <div class="card p-3.5 border-0 rounded-4 shadow-sm h-100" style="background: linear-gradient(135deg, #ecfdf5, #d1fae5);">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="small fw-bold text-success text-uppercase">Bruttomarge (Gewinn)</span>
                                <i class="fas fa-sack-dollar text-success fs-5 opacity-75"></i>
                            </div>
                            <h3 class="fw-bold text-success mb-1">${formatCHF(grossMargin)}</h3>
                            <div class="small text-muted">
                                Marge: ${plannedRevenue > 0 ? Math.round((grossMargin / plannedRevenue) * 100) : 0}% vom Umsatz
                            </div>
                        </div>
                    </div>

                    <!-- Kachel 4: Helfer-Effizienz -->
                    <div class="col-lg-3 col-sm-6">
                        <div class="card p-3.5 border-0 rounded-4 shadow-sm h-100" style="background: linear-gradient(135deg, #faf5ff, #f3e8ff);">
                            <div class="d-flex justify-content-between align-items-start mb-2">
                                <span class="small fw-bold text-purple text-uppercase" style="color: #7e22ce;">Helfer-Effizienz</span>
                                <i class="fas fa-stopwatch text-purple fs-5 opacity-75" style="color: #7e22ce;"></i>
                            </div>
                            <h3 class="fw-bold text-dark mb-1">${marginPerHour.toFixed(2)} <span class="fs-6 fw-normal">CHF/Std.</span></h3>
                            <div class="small text-muted">
                                ${totalHelperHours.toFixed(1)} Helfer-Stunden geleistet
                            </div>
                        </div>
                    </div>
                </div>

                <!-- KATEGORIE-FINANZÜBERSICHT -->
                <h6 class="fw-bold text-dark mb-3">
                    <i class="fas fa-table-list me-1 text-primary"></i>Finanzübersicht nach Sparten / Warengruppen
                </h6>
                <div class="table-responsive">
                    <table class="table table-hover align-middle mb-0">
                        <thead class="table-light text-muted small text-uppercase">
                            <tr>
                                <th>Kategorie / Sparte</th>
                                <th class="text-center">Artikelanzahl</th>
                                <th class="text-end">Kosten (Soll)</th>
                                <th class="text-end">Erlös (Soll)</th>
                                <th class="text-end">Bruttomarge</th>
                                <th class="text-end">Marge %</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${['Festwirtschaft', 'Grill', 'Getränke', 'Bar', 'Munition', 'Infrastruktur'].map(cat => {
                                const catItems = state.items.filter(i => i.category === cat);
                                if (catItems.length === 0) return '';
                                const cost = catItems.reduce((acc, i) => acc + ((parseFloat(i.order_qty) || 0) * (parseFloat(i.cost_price) || 0)), 0);
                                const rev = catItems.reduce((acc, i) => acc + ((parseFloat(i.order_qty) || 0) * (parseFloat(i.sales_price) || 0)), 0);
                                const m = rev - cost;
                                const pct = rev > 0 ? Math.round((m / rev) * 100) : 0;
                                return `
                                    <tr>
                                        <td class="fw-bold text-dark"><i class="fas fa-tag me-1 text-secondary"></i>${cat}</td>
                                        <td class="text-center">${catItems.length}</td>
                                        <td class="text-end font-monospace">${formatCHF(cost)}</td>
                                        <td class="text-end font-monospace">${formatCHF(rev)}</td>
                                        <td class="text-end font-monospace fw-bold text-success">${formatCHF(m)}</td>
                                        <td class="text-end font-monospace fw-semibold">${pct}%</td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }

    // ─────────────────────────────────────────────────────────────
    // INTERAKTIONEN & CRUD AKTIONEN
    // ─────────────────────────────────────────────────────────────

    // Tab-Wechsel
    function switchTab(tabKey) {
        state.activeTab = tabKey;
        const content = document.getElementById('anlaesse-tab-content');
        if (content) {
            content.innerHTML = renderCurrentTab();
        }
        // Button styles aktualisieren
        document.querySelectorAll('.custom-tabs .nav-link').forEach(btn => {
            btn.classList.remove('active', 'bg-primary', 'text-white');
            btn.classList.add('text-secondary');
        });
        const activeBtn = document.querySelector(`.custom-tabs button[onclick*="'${tabKey}'"]`);
        if (activeBtn) {
            activeBtn.classList.add('active', 'bg-primary', 'text-white');
            activeBtn.classList.remove('text-secondary');
        }
    }

    function setCategoryFilter(cat) {
        state.filterCategory = cat;
        switchTab('items');
    }

    function setEventFilter(status) {
        state.filterStatus = status;
        switchTab('events');
    }

    function onSearch(query) {
        state.searchQuery = query;
        const content = document.getElementById('anlaesse-tab-content');
        if (content && state.activeTab === 'events') {
            content.innerHTML = renderEventsTab();
        }
    }

    function onSelectEvent(eventId) {
        if (!eventId) return;
        setActiveEvent(eventId);
    }

    // Dynamic Recalculation of Items based on Visitors input
    async function recalcWithVisitors() {
        const input = document.getElementById('quick-visitors-input');
        if (!input) return;
        const newVisitors = parseInt(input.value) || 0;
        if (newVisitors <= 0) {
            showToast('Bitte eine gültige Besucherzahl grösser als 0 eingeben.', 'warning');
            return;
        }

        const supa = getClient();
        if (!supa || !state.activeEventId) return;

        state.isRecalculating = true;
        renderLoadingIndicator(true);

        try {
            // 1. Event visitors in DB aktualisieren
            await supa.from('events').update({ expected_visitors: newVisitors }).eq('id', state.activeEventId);

            // 2. Empfohlene Mengen aller Artikel neu berechnen und speichern
            for (const item of state.items) {
                const qtyPerVis = parseFloat(item.qty_per_visitor) || 0;
                const safety = parseFloat(item.safety_factor) || 1.10;
                const recQty = Math.round((newVisitors * qtyPerVis * safety) * 10) / 10;

                await supa.from('event_items').update({
                    recommended_qty: recQty,
                    order_qty: recQty // Auch Bestellmenge synchronisieren
                }).eq('id', item.id);
            }

            showToast(`Mengenrechner für ${newVisitors} Besucher neu berechnet!`, 'success');
            await loadData();
        } catch (err) {
            console.error('Fehler bei Neuberechnung:', err);
            showToast('Fehler bei Neuberechnung: ' + err.message, 'danger');
        } finally {
            state.isRecalculating = false;
            renderLoadingIndicator(false);
        }
    }

    // Inline Quantity Update for Items
    async function updateItemQuantity(itemId, field, val) {
        const supa = getClient();
        if (!supa) return;
        const numVal = parseFloat(val) || 0;
        try {
            const patch = {};
            patch[field] = numVal;
            const { error } = await supa.from('event_items').update(patch).eq('id', itemId);
            if (error) throw error;
            showToast('Menge gespeichert', 'success');
            // Details im Hintergrund neu laden für Controlling-Aktualisierung
            if (state.activeEventId) {
                await loadActiveEventDetails(state.activeEventId);
            }
        } catch (err) {
            console.error('Fehler beim Aktualisieren der Menge:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // Checklist Toggle
    async function toggleChecklist(taskId, isChecked) {
        const supa = getClient();
        if (!supa) return;
        const newStatus = isChecked ? 'completed' : 'pending';
        try {
            const { error } = await supa.from('event_checklists').update({ status: newStatus }).eq('id', taskId);
            if (error) throw error;
            // Lokalen State aktualisieren
            const task = state.checklists.find(t => t.id === taskId);
            if (task) task.status = newStatus;
            switchTab('checklists');
        } catch (err) {
            console.error('Fehler beim Aktualisieren der Aufgabe:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // Helper Confirmation Toggle
    async function toggleHelperConfirmation(assignmentId, confirmed) {
        const supa = getClient();
        if (!supa) return;
        try {
            const { error } = await supa.from('event_shift_assignments').update({
                confirmed_by_helper: confirmed,
                confirmation_date: confirmed ? new Date().toISOString() : null
            }).eq('id', assignmentId);
            if (error) throw error;
            showToast(confirmed ? 'Einsatz bestätigt' : 'Bestätigung zurückgesetzt', 'success');
            await loadActiveEventDetails(state.activeEventId);
            switchTab('shifts');
        } catch (err) {
            console.error('Fehler bei Bestätigung:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // Order Status Update
    async function updateOrderStatus(orderId, newStatus) {
        const supa = getClient();
        if (!supa) return;
        try {
            const { error } = await supa.from('event_orders').update({ status: newStatus }).eq('id', orderId);
            if (error) throw error;
            showToast('Bestellstatus aktualisiert', 'success');
        } catch (err) {
            console.error('Fehler beim Aktualisieren des Bestellstatus:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // MODALS: ANLASS ERSTELLEN & AUS VORLAGE DUPLIZIEREN
    // ─────────────────────────────────────────────────────────────
    function openCreateModal() {
        const modalContainer = document.getElementById('anlaesse-modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal fade" id="modal-create-event" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered modal-lg">
                    <div class="modal-content border-0 shadow-lg rounded-4">
                        <div class="modal-header bg-primary text-white border-0 py-3">
                            <h5 class="modal-title fw-bold"><i class="fas fa-calendar-plus me-2"></i>Neuen Anlass erfassen</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="form-create-event" onsubmit="AnlaesseModule.submitCreateEvent(event)">
                                <div class="row g-3">
                                    <div class="col-md-8">
                                        <label class="form-label small fw-bold">Name des Anlasses *</label>
                                        <input type="text" class="form-control" id="ev-name" required placeholder="z.B. Cupschiessen 2026">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Status</label>
                                        <select class="form-select" id="ev-status">
                                            <option value="planned" selected>Geplant</option>
                                            <option value="active">Aktiv</option>
                                            <option value="draft">Entwurf</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Datum *</label>
                                        <input type="date" class="form-control" id="ev-date" required value="${new Date().toISOString().split('T')[0]}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Startzeit *</label>
                                        <input type="time" class="form-control" id="ev-start" required value="09:00">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Endzeit</label>
                                        <input type="time" class="form-control" id="ev-end" value="17:00">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">Ort</label>
                                        <input type="text" class="form-control" id="ev-location" value="Schiessanlage Muhen">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">Verantwortlicher / Leitung</label>
                                        <input type="text" class="form-control" id="ev-manager" placeholder="z.B. Wirtschaftschef">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">Erwartete Besucher (für Mengenrechner)</label>
                                        <input type="number" class="form-control" id="ev-visitors" value="100" min="0">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">Budget (CHF)</label>
                                        <input type="number" step="0.01" class="form-control" id="ev-budget" value="1500.00">
                                    </div>
                                    <div class="col-12">
                                        <label class="form-label small fw-bold">Beschreibung / Notizen</label>
                                        <textarea class="form-control" id="ev-desc" rows="2" placeholder="Zusätzliche Infos zum Festbetrieb..."></textarea>
                                    </div>
                                    <div class="col-12">
                                        <div class="form-check form-switch">
                                            <input class="form-check-input" type="checkbox" id="ev-is-template">
                                            <label class="form-check-label fw-semibold" for="ev-is-template">
                                                Als Vorlage speichern (kann für künftige Anlässe dupliziert werden)
                                            </label>
                                        </div>
                                    </div>
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Abbrechen</button>
                                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-bold">Anlass speichern</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('modal-create-event'));
        modal.show();
    }

    async function submitCreateEvent(e) {
        e.preventDefault();
        const supa = getClient();
        if (!supa) return;

        const newEvent = {
            name: document.getElementById('ev-name').value.trim(),
            status: document.getElementById('ev-status').value,
            event_date: document.getElementById('ev-date').value,
            start_time: document.getElementById('ev-start').value,
            end_time: document.getElementById('ev-end').value || null,
            location: document.getElementById('ev-location').value.trim(),
            manager_name: document.getElementById('ev-manager').value.trim(),
            expected_visitors: parseInt(document.getElementById('ev-visitors').value) || 0,
            budget: parseFloat(document.getElementById('ev-budget').value) || 0,
            description: document.getElementById('ev-desc').value.trim(),
            is_template: document.getElementById('ev-is-template').checked
        };

        try {
            const { data, error } = await supa.from('events').insert([newEvent]).select().single();
            if (error) throw error;
            showToast('Anlass erfolgreich erstellt!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modal-create-event')).hide();
            await loadData();
            if (data && data.id) {
                setActiveEvent(data.id, 'items');
            }
        } catch (err) {
            console.error('Fehler beim Erstellen des Anlasses:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // Duplizieren aus Vorlage (RPC)
    function openDuplicateModal(preselectTemplateId = null) {
        const templates = state.events.filter(e => e.is_template);
        if (templates.length === 0) {
            showToast('Keine Vorlagen vorhanden. Markiere einen Anlass als Vorlage, um ihn zu duplizieren.', 'info');
            return;
        }

        const modalContainer = document.getElementById('anlaesse-modal-container');
        if (!modalContainer) return;

        const selTpl = preselectTemplateId || templates[0].id;
        const currentTpl = templates.find(t => t.id === selTpl) || templates[0];

        modalContainer.innerHTML = `
            <div class="modal fade" id="modal-duplicate-event" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg rounded-4">
                        <div class="modal-header bg-primary text-white border-0 py-3">
                            <h5 class="modal-title fw-bold"><i class="fas fa-copy me-2"></i>Anlass aus Vorlage erstellen</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="form-duplicate-event" onsubmit="AnlaesseModule.submitDuplicateTemplate(event)">
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Vorlage auswählen *</label>
                                    <select class="form-select fw-semibold" id="dup-template-id" onchange="AnlaesseModule.onTemplateChange(this.value)">
                                        ${templates.map(t => `
                                            <option value="${t.id}" ${t.id === selTpl ? 'selected' : ''}>
                                                ${escapeHtml(t.name)} (Basis: ${t.expected_visitors} Besucher)
                                            </option>
                                        `).join('')}
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Name des neuen Anlasses *</label>
                                    <input type="text" class="form-control fw-bold" id="dup-name" required value="${escapeHtml(currentTpl.name.replace('Vorlage: ', ''))} 2026">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Datum des neuen Anlasses *</label>
                                    <input type="date" class="form-control" id="dup-date" required value="${new Date().toISOString().split('T')[0]}">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Erwartete Besucher (skaliert alle Mengen automatisch)</label>
                                    <input type="number" class="form-control" id="dup-visitors" value="${currentTpl.expected_visitors}" min="1">
                                    <div class="form-text small text-muted">
                                        Die gespeicherten Faktoren pro Besucher werden automatisch mit dieser Besucherzahl multipliziert.
                                    </div>
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Abbrechen</button>
                                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-bold">
                                        <i class="fas fa-magic me-1"></i>Jetzt duplizieren
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('modal-duplicate-event'));
        modal.show();
    }

    function onTemplateChange(tplId) {
        const tpl = state.events.find(e => e.id === tplId);
        if (tpl) {
            document.getElementById('dup-name').value = tpl.name.replace('Vorlage: ', '') + ' 2026';
            document.getElementById('dup-visitors').value = tpl.expected_visitors;
        }
    }

    async function submitDuplicateTemplate(e) {
        e.preventDefault();
        const supa = getClient();
        if (!supa) return;

        const templateId = document.getElementById('dup-template-id').value;
        const newName = document.getElementById('dup-name').value.trim();
        const newDate = document.getElementById('dup-date').value;
        const newVisitors = parseInt(document.getElementById('dup-visitors').value) || null;

        try {
            // Aufruf der PostgreSQL Stored Procedure create_event_from_template
            const { data: newEventId, error } = await supa.rpc('create_event_from_template', {
                template_id: templateId,
                new_event_name: newName,
                new_event_date: newDate,
                new_expected_visitors: newVisitors
            });

            if (error) throw error;

            showToast(`Anlass „${newName}“ erfolgreich aus Vorlage erzeugt!`, 'success');
            bootstrap.Modal.getInstance(document.getElementById('modal-duplicate-event')).hide();
            await loadData();
            if (newEventId) {
                setActiveEvent(newEventId, 'items');
            }
        } catch (err) {
            console.error('Fehler beim Duplizieren der Vorlage:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // Event löschen
    async function deleteEvent(eventId) {
        const ev = state.events.find(e => e.id === eventId);
        if (!ev) return;
        if (!confirm(`Möchtest du den Anlass „${ev.name}“ wirklich unwiderruflich löschen? Alle zugehörigen Artikel, Checklisten und Schichten werden gelöscht.`)) {
            return;
        }

        const supa = getClient();
        if (!supa) return;

        try {
            const { error } = await supa.from('events').delete().eq('id', eventId);
            if (error) throw error;
            showToast('Anlass gelöscht.', 'success');
            if (state.activeEventId === eventId) {
                state.activeEventId = null;
            }
            await loadData();
        } catch (err) {
            console.error('Fehler beim Löschen des Anlasses:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // MODALS: ARTIKEL HINZUFÜGEN / BEARBEITEN
    // ─────────────────────────────────────────────────────────────
    function openAddItemModal(editItemId = null) {
        if (!state.activeEventId) {
            showToast('Bitte zuerst einen Anlass auswählen.', 'warning');
            return;
        }

        const editItem = editItemId ? state.items.find(i => i.id === editItemId) : null;
        const modalContainer = document.getElementById('anlaesse-modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal fade" id="modal-item" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg rounded-4">
                        <div class="modal-header bg-primary text-white border-0 py-3">
                            <h5 class="modal-title fw-bold">
                                <i class="fas ${editItem ? 'fa-pencil' : 'fa-plus'} me-2"></i>
                                ${editItem ? 'Artikel bearbeiten' : 'Artikel zur Mengenplanung hinzufügen'}
                            </h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="form-item" onsubmit="AnlaesseModule.submitItem(event, '${editItemId || ''}')">
                                <div class="row g-3">
                                    <div class="col-md-8">
                                        <label class="form-label small fw-bold">Artikelname *</label>
                                        <input type="text" class="form-control" id="itm-name" required value="${editItem ? escapeHtml(editItem.item_name) : ''}" placeholder="z.B. Bratwurst mit Bürli">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Kategorie</label>
                                        <select class="form-select" id="itm-category">
                                            <option value="Festwirtschaft" ${editItem && editItem.category === 'Festwirtschaft' ? 'selected' : ''}>Festwirtschaft</option>
                                            <option value="Grill" ${editItem && editItem.category === 'Grill' ? 'selected' : (!editItem ? 'selected' : '')}>Grill</option>
                                            <option value="Getränke" ${editItem && editItem.category === 'Getränke' ? 'selected' : ''}>Getränke</option>
                                            <option value="Bar" ${editItem && editItem.category === 'Bar' ? 'selected' : ''}>Bar</option>
                                            <option value="Munition" ${editItem && editItem.category === 'Munition' ? 'selected' : ''}>Munition</option>
                                            <option value="Infrastruktur" ${editItem && editItem.category === 'Infrastruktur' ? 'selected' : ''}>Infrastruktur</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Einheit</label>
                                        <select class="form-select" id="itm-unit">
                                            <option value="Stk" ${editItem && editItem.unit === 'Stk' ? 'selected' : ''}>Stk</option>
                                            <option value="Flasche" ${editItem && editItem.unit === 'Flasche' ? 'selected' : ''}>Flasche</option>
                                            <option value="Portion" ${editItem && editItem.unit === 'Portion' ? 'selected' : ''}>Portion</option>
                                            <option value="Liter" ${editItem && editItem.unit === 'Liter' ? 'selected' : ''}>Liter</option>
                                            <option value="kg" ${editItem && editItem.unit === 'kg' ? 'selected' : ''}>kg</option>
                                        </select>
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Einkaufspreis (CHF)</label>
                                        <input type="number" step="0.05" class="form-control text-end" id="itm-cost" value="${editItem ? editItem.cost_price : '2.50'}">
                                    </div>
                                    <div class="col-md-4">
                                        <label class="form-label small fw-bold">Verkaufspreis (CHF)</label>
                                        <input type="number" step="0.05" class="form-control text-end" id="itm-sales" value="${editItem ? editItem.sales_price : '6.00'}">
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">Menge pro Besucher (Faktor)</label>
                                        <input type="number" step="0.05" class="form-control text-center" id="itm-qty-vis" value="${editItem ? editItem.qty_per_visitor : '0.80'}">
                                        <div class="form-text small">z.B. 0.8 = 80 Würste auf 100 Gäste</div>
                                    </div>
                                    <div class="col-md-6">
                                        <label class="form-label small fw-bold">Sicherheitsfaktor</label>
                                        <input type="number" step="0.05" class="form-control text-center" id="itm-safety" value="${editItem ? editItem.safety_factor : '1.10'}">
                                        <div class="form-text small">1.10 = +10% Sicherheitsreserve</div>
                                    </div>
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Abbrechen</button>
                                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-bold">Speichern</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('modal-item'));
        modal.show();
    }

    function openEditItemModal(itemId) {
        openAddItemModal(itemId);
    }

    async function submitItem(e, editItemId) {
        e.preventDefault();
        const supa = getClient();
        if (!supa || !state.activeEventId) return;

        const activeEvent = state.events.find(ev => ev.id === state.activeEventId);
        const visitors = activeEvent ? activeEvent.expected_visitors : 100;

        const cost = parseFloat(document.getElementById('itm-cost').value) || 0;
        const sales = parseFloat(document.getElementById('itm-sales').value) || 0;
        const qtyPerVis = parseFloat(document.getElementById('itm-qty-vis').value) || 0;
        const safety = parseFloat(document.getElementById('itm-safety').value) || 1.10;
        const recQty = Math.round((visitors * qtyPerVis * safety) * 10) / 10;

        const payload = {
            event_id: state.activeEventId,
            item_name: document.getElementById('itm-name').value.trim(),
            category: document.getElementById('itm-category').value,
            unit: document.getElementById('itm-unit').value,
            cost_price: cost,
            sales_price: sales,
            qty_per_visitor: qtyPerVis,
            safety_factor: safety,
            recommended_qty: recQty
        };

        try {
            if (editItemId) {
                const { error } = await supa.from('event_items').update(payload).eq('id', editItemId);
                if (error) throw error;
                showToast('Artikel aktualisiert!', 'success');
            } else {
                payload.order_qty = recQty; // Standardmässig Empfehlung übernehmen
                const { error } = await supa.from('event_items').insert([payload]);
                if (error) throw error;
                showToast('Artikel hinzugefügt!', 'success');
            }

            bootstrap.Modal.getInstance(document.getElementById('modal-item')).hide();
            await loadActiveEventDetails(state.activeEventId);
            switchTab('items');
        } catch (err) {
            console.error('Fehler beim Speichern des Artikels:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    async function deleteItem(itemId) {
        if (!confirm('Artikel wirklich aus der Mengenplanung entfernen?')) return;
        const supa = getClient();
        if (!supa) return;
        try {
            const { error } = await supa.from('event_items').delete().eq('id', itemId);
            if (error) throw error;
            showToast('Artikel gelöscht.', 'success');
            await loadActiveEventDetails(state.activeEventId);
            switchTab('items');
        } catch (err) {
            console.error('Fehler beim Löschen des Artikels:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // MODALS: BESTELLUNG / CHECKLISTE / SCHICHT / HELFER
    // ─────────────────────────────────────────────────────────────
    function openAddOrderModal() {
        if (!state.activeEventId) return;
        const modalContainer = document.getElementById('anlaesse-modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal fade" id="modal-order" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg rounded-4">
                        <div class="modal-header bg-primary text-white border-0 py-3">
                            <h5 class="modal-title fw-bold"><i class="fas fa-truck me-2"></i>Bestellung erfassen</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="form-order" onsubmit="AnlaesseModule.submitOrder(event)">
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Lieferant *</label>
                                    <input type="text" class="form-control" id="ord-supplier" required placeholder="z.B. Metzgerei Müller / Getränke AG">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Kontakt / Telefon / Mail</label>
                                    <input type="text" class="form-control" id="ord-contact" placeholder="062 123 45 67">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Artikel / Beschreibung *</label>
                                    <input type="text" class="form-control" id="ord-desc" required placeholder="120x Bratwürste, 60x Cervelats">
                                </div>
                                <div class="row g-2 mb-3">
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Menge & Einheit</label>
                                        <div class="input-group">
                                            <input type="number" step="0.5" class="form-control" id="ord-qty" value="1">
                                            <input type="text" class="form-control" id="ord-unit" value="Stk" style="max-width: 70px;">
                                        </div>
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Gesamtbetrag (CHF)</label>
                                        <input type="number" step="0.05" class="form-control text-end" id="ord-price" value="0.00">
                                    </div>
                                </div>
                                <div class="row g-2 mb-3">
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Lieferdatum</label>
                                        <input type="date" class="form-control" id="ord-date" value="${new Date().toISOString().split('T')[0]}">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Lieferzeit</label>
                                        <input type="time" class="form-control" id="ord-time" value="10:00">
                                    </div>
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Abbrechen</button>
                                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-bold">Bestellung anlegen</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('modal-order'));
        modal.show();
    }

    async function submitOrder(e) {
        e.preventDefault();
        const supa = getClient();
        if (!supa || !state.activeEventId) return;

        const payload = {
            event_id: state.activeEventId,
            supplier_name: document.getElementById('ord-supplier').value.trim(),
            supplier_contact: document.getElementById('ord-contact').value.trim(),
            item_description: document.getElementById('ord-desc').value.trim(),
            quantity: parseFloat(document.getElementById('ord-qty').value) || 1,
            unit: document.getElementById('ord-unit').value.trim() || 'Stk',
            total_price: parseFloat(document.getElementById('ord-price').value) || 0,
            delivery_date: document.getElementById('ord-date').value || null,
            delivery_time: document.getElementById('ord-time').value || null,
            status: 'ordered'
        };

        try {
            const { error } = await supa.from('event_orders').insert([payload]);
            if (error) throw error;
            showToast('Bestellung erfolgreich angelegt!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modal-order')).hide();
            await loadActiveEventDetails(state.activeEventId);
            switchTab('orders');
        } catch (err) {
            console.error('Fehler beim Anlegen der Bestellung:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    async function deleteOrder(orderId) {
        if (!confirm('Bestellung wirklich löschen?')) return;
        const supa = getClient();
        if (!supa) return;
        try {
            const { error } = await supa.from('event_orders').delete().eq('id', orderId);
            if (error) throw error;
            showToast('Bestellung gelöscht.', 'success');
            await loadActiveEventDetails(state.activeEventId);
            switchTab('orders');
        } catch (err) {
            console.error('Fehler:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    function openAddChecklistModal(preselectedPhase = 'Vorbereitung') {
        if (!state.activeEventId) return;
        const modalContainer = document.getElementById('anlaesse-modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal fade" id="modal-checklist" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg rounded-4">
                        <div class="modal-header bg-primary text-white border-0 py-3">
                            <h5 class="modal-title fw-bold"><i class="fas fa-list-check me-2"></i>Aufgabe hinzufügen</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="form-checklist" onsubmit="AnlaesseModule.submitChecklist(event)">
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Phase *</label>
                                    <select class="form-select" id="chk-phase">
                                        <option value="Vorbereitung" ${preselectedPhase === 'Vorbereitung' ? 'selected' : ''}>Vorbereitung</option>
                                        <option value="Einkauf" ${preselectedPhase === 'Einkauf' ? 'selected' : ''}>Einkauf</option>
                                        <option value="Aufbau" ${preselectedPhase === 'Aufbau' ? 'selected' : ''}>Aufbau</option>
                                        <option value="Durchführung" ${preselectedPhase === 'Durchführung' ? 'selected' : ''}>Durchführung</option>
                                        <option value="Abbau" ${preselectedPhase === 'Abbau' ? 'selected' : ''}>Abbau</option>
                                        <option value="Nachbereitung" ${preselectedPhase === 'Nachbereitung' ? 'selected' : ''}>Nachbereitung</option>
                                    </select>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Aufgabe / Task *</label>
                                    <input type="text" class="form-control" id="chk-task" required placeholder="z.B. Festbänke aus Zivilschutzanlage holen">
                                </div>
                                <div class="row g-2 mb-3">
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Verantwortlich</label>
                                        <input type="text" class="form-control" id="chk-assigned" placeholder="z.B. Bauchef">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Priorität</label>
                                        <select class="form-select" id="chk-priority">
                                            <option value="medium" selected>Mittel</option>
                                            <option value="high">Hoch</option>
                                            <option value="urgent">Dringend</option>
                                            <option value="low">Tief</option>
                                        </select>
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Fälligkeit (Due Date)</label>
                                    <input type="date" class="form-control" id="chk-due">
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Abbrechen</button>
                                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-bold">Aufgabe speichern</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('modal-checklist'));
        modal.show();
    }

    async function submitChecklist(e) {
        e.preventDefault();
        const supa = getClient();
        if (!supa || !state.activeEventId) return;

        const payload = {
            event_id: state.activeEventId,
            phase: document.getElementById('chk-phase').value,
            task: document.getElementById('chk-task').value.trim(),
            assigned_to: document.getElementById('chk-assigned').value.trim() || null,
            priority: document.getElementById('chk-priority').value,
            due_date: document.getElementById('chk-due').value || null,
            status: 'pending'
        };

        try {
            const { error } = await supa.from('event_checklists').insert([payload]);
            if (error) throw error;
            showToast('Aufgabe hinzugefügt!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modal-checklist')).hide();
            await loadActiveEventDetails(state.activeEventId);
            switchTab('checklists');
        } catch (err) {
            console.error('Fehler:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    async function deleteChecklist(taskId) {
        const supa = getClient();
        if (!supa) return;
        try {
            const { error } = await supa.from('event_checklists').delete().eq('id', taskId);
            if (error) throw error;
            showToast('Aufgabe gelöscht.', 'success');
            await loadActiveEventDetails(state.activeEventId);
            switchTab('checklists');
        } catch (err) {
            console.error('Fehler:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    function openAddShiftModal() {
        if (!state.activeEventId) return;
        const modalContainer = document.getElementById('anlaesse-modal-container');
        if (!modalContainer) return;

        const activeEvent = state.events.find(e => e.id === state.activeEventId);
        const evDate = activeEvent ? activeEvent.event_date : new Date().toISOString().split('T')[0];

        modalContainer.innerHTML = `
            <div class="modal fade" id="modal-shift" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg rounded-4">
                        <div class="modal-header bg-primary text-white border-0 py-3">
                            <h5 class="modal-title fw-bold"><i class="fas fa-users-gear me-2"></i>Neue Schicht erfassen</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="form-shift" onsubmit="AnlaesseModule.submitShift(event)">
                                <div class="row g-2 mb-3">
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Bereich / Stand *</label>
                                        <input type="text" class="form-control" id="sh-area" required placeholder="z.B. Grill / Kasse">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Funktion / Rolle *</label>
                                        <input type="text" class="form-control" id="sh-role" required placeholder="z.B. Grillmeister">
                                    </div>
                                </div>
                                <div class="row g-2 mb-3">
                                    <div class="col-4">
                                        <label class="form-label small fw-bold">Datum *</label>
                                        <input type="date" class="form-control" id="sh-date" required value="${evDate}">
                                    </div>
                                    <div class="col-4">
                                        <label class="form-label small fw-bold">Startzeit *</label>
                                        <input type="time" class="form-control" id="sh-start" required value="17:00">
                                    </div>
                                    <div class="col-4">
                                        <label class="form-label small fw-bold">Endzeit *</label>
                                        <input type="time" class="form-control" id="sh-end" required value="21:00">
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Benötigte Helfer (Anzahl Personen) *</label>
                                    <input type="number" class="form-control" id="sh-required" value="2" min="1">
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Aufgaben-Kurzbeschreibung</label>
                                    <textarea class="form-control" id="sh-desc" rows="2" placeholder="Was beinhaltet diese Schicht?"></textarea>
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Abbrechen</button>
                                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-bold">Schicht anlegen</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('modal-shift'));
        modal.show();
    }

    async function submitShift(e) {
        e.preventDefault();
        const supa = getClient();
        if (!supa || !state.activeEventId) return;

        const payload = {
            event_id: state.activeEventId,
            area: document.getElementById('sh-area').value.trim(),
            role_name: document.getElementById('sh-role').value.trim(),
            shift_date: document.getElementById('sh-date').value,
            start_time: document.getElementById('sh-start').value,
            end_time: document.getElementById('sh-end').value,
            required_helpers: parseInt(document.getElementById('sh-required').value) || 1,
            description: document.getElementById('sh-desc').value.trim() || null
        };

        try {
            const { error } = await supa.from('event_shifts').insert([payload]);
            if (error) throw error;
            showToast('Schicht erfolgreich angelegt!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modal-shift')).hide();
            await loadActiveEventDetails(state.activeEventId);
            switchTab('shifts');
        } catch (err) {
            console.error('Fehler:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    async function deleteShift(shiftId) {
        if (!confirm('Schicht und alle zugeordneten Helfer wirklich entfernen?')) return;
        const supa = getClient();
        if (!supa) return;
        try {
            const { error } = await supa.from('event_shifts').delete().eq('id', shiftId);
            if (error) throw error;
            showToast('Schicht gelöscht.', 'success');
            await loadActiveEventDetails(state.activeEventId);
            switchTab('shifts');
        } catch (err) {
            console.error('Fehler:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    function openAssignHelperModal(shiftId) {
        const shift = state.shifts.find(s => s.id === shiftId);
        if (!shift) return;

        const modalContainer = document.getElementById('anlaesse-modal-container');
        if (!modalContainer) return;

        modalContainer.innerHTML = `
            <div class="modal fade" id="modal-assign-helper" tabindex="-1" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg rounded-4">
                        <div class="modal-header bg-primary text-white border-0 py-3">
                            <h5 class="modal-title fw-bold"><i class="fas fa-user-plus me-2"></i>Helfer einteilen</h5>
                            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body p-4">
                            <form id="form-assign-helper" onsubmit="AnlaesseModule.submitAssignHelper(event, '${shiftId}')">
                                <div class="bg-light rounded-3 p-2.5 mb-3 small">
                                    <div class="fw-bold text-dark">${escapeHtml(shift.area)}: ${escapeHtml(shift.role_name)}</div>
                                    <div class="text-muted">${formatTime(shift.start_time)} – ${formatTime(shift.end_time)} Uhr</div>
                                </div>
                                <div class="mb-3">
                                    <label class="form-label small fw-bold">Name des Helfers (Mitglied / Gast) *</label>
                                    <input type="text" class="form-control" id="hlp-name" required placeholder="Vorname Nachname">
                                </div>
                                <div class="row g-2 mb-3">
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">Mobiltelefon</label>
                                        <input type="tel" class="form-control" id="hlp-phone" placeholder="079 123 45 67">
                                    </div>
                                    <div class="col-6">
                                        <label class="form-label small fw-bold">E-Mail</label>
                                        <input type="email" class="form-control" id="hlp-email" placeholder="name@beispiel.ch">
                                    </div>
                                </div>
                                <div class="mb-3">
                                    <div class="form-check form-switch">
                                        <input class="form-check-input" type="checkbox" id="hlp-confirmed" checked>
                                        <label class="form-check-label small fw-semibold" for="hlp-confirmed">
                                            Direkt als «Bestätigt» markieren
                                        </label>
                                    </div>
                                </div>
                                <div class="d-flex justify-content-end gap-2 mt-4 pt-3 border-top">
                                    <button type="button" class="btn btn-light rounded-pill px-4" data-bs-dismiss="modal">Abbrechen</button>
                                    <button type="submit" class="btn btn-primary rounded-pill px-4 fw-bold">Helfer zuweisen</button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const modal = new bootstrap.Modal(document.getElementById('modal-assign-helper'));
        modal.show();
    }

    async function submitAssignHelper(e, shiftId) {
        e.preventDefault();
        const supa = getClient();
        if (!supa) return;

        const isConfirmed = document.getElementById('hlp-confirmed').checked;
        const payload = {
            shift_id: shiftId,
            helper_name: document.getElementById('hlp-name').value.trim(),
            helper_phone: document.getElementById('hlp-phone').value.trim() || null,
            helper_email: document.getElementById('hlp-email').value.trim() || null,
            confirmed_by_helper: isConfirmed,
            confirmation_date: isConfirmed ? new Date().toISOString() : null
        };

        try {
            const { error } = await supa.from('event_shift_assignments').insert([payload]);
            if (error) throw error;
            showToast('Helfer erfolgreich eingeteilt!', 'success');
            bootstrap.Modal.getInstance(document.getElementById('modal-assign-helper')).hide();
            await loadActiveEventDetails(state.activeEventId);
            switchTab('shifts');
        } catch (err) {
            console.error('Fehler:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    async function removeHelperAssignment(assignmentId) {
        if (!confirm('Helfer aus dieser Schicht austragen?')) return;
        const supa = getClient();
        if (!supa) return;
        try {
            const { error } = await supa.from('event_shift_assignments').delete().eq('id', assignmentId);
            if (error) throw error;
            showToast('Helfer ausgetragen.', 'success');
            await loadActiveEventDetails(state.activeEventId);
            switchTab('shifts');
        } catch (err) {
            console.error('Fehler:', err);
            showToast('Fehler: ' + err.message, 'danger');
        }
    }

    // ─────────────────────────────────────────────────────────────
    // PUBLIC API DES MODULS
    // ─────────────────────────────────────────────────────────────
    return {
        load: loadData,
        reload: loadData,
        setActiveEvent: setActiveEvent,
        switchTab: switchTab,
        setCategoryFilter: setCategoryFilter,
        setEventFilter: setEventFilter,
        onSearch: onSearch,
        onSelectEvent: onSelectEvent,
        recalcWithVisitors: recalcWithVisitors,
        updateItemQuantity: updateItemQuantity,
        toggleChecklist: toggleChecklist,
        toggleHelperConfirmation: toggleHelperConfirmation,
        updateOrderStatus: updateOrderStatus,
        openCreateModal: openCreateModal,
        submitCreateEvent: submitCreateEvent,
        openDuplicateModal: openDuplicateModal,
        onTemplateChange: onTemplateChange,
        submitDuplicateTemplate: submitDuplicateTemplate,
        deleteEvent: deleteEvent,
        openAddItemModal: openAddItemModal,
        openEditItemModal: openEditItemModal,
        submitItem: submitItem,
        deleteItem: deleteItem,
        openAddOrderModal: openAddOrderModal,
        submitOrder: submitOrder,
        deleteOrder: deleteOrder,
        openAddChecklistModal: openAddChecklistModal,
        submitChecklist: submitChecklist,
        deleteChecklist: deleteChecklist,
        openAddShiftModal: openAddShiftModal,
        submitShift: submitShift,
        deleteShift: deleteShift,
        openAssignHelperModal: openAssignHelperModal,
        submitAssignHelper: submitAssignHelper,
        removeHelperAssignment: removeHelperAssignment
    };
})();

// Global für main.js navTo bereitstellen
window.loadAnlaesseData = function () {
    return window.AnlaesseModule.load();
};
