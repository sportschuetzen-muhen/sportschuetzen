/**
 * member-shifts.js - Aplano-inspirierter Schicht- & Helferplaner für Vereinsmitglieder
 * Sportschützen Muhen
 * Geschützter Bereich (intern.html) mit Selbsteintrag und persönlicher Einsatzübersicht
 */

window.MemberShifts = (function () {
    'use strict';

    const SUPABASE_URL = 'https://supabase-muhen.danfamily.uk';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';

    let state = {
        events: [],
        activeEventId: null,
        shifts: [],
        assignments: [],
        isLoading: false,
        activeShiftForRegister: null
    };

    function getSupabase() {
        if (window.AuthSession && typeof window.AuthSession.getSupabase === 'function') {
            const client = window.AuthSession.getSupabase();
            if (client) return client;
        }
        if (window.supabase && typeof window.supabase.createClient === 'function') {
            return window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        }
        return null;
    }

    function getCurrentUser() {
        if (window.AuthSession && typeof window.AuthSession.getUser === 'function') {
            return window.AuthSession.getUser();
        }
        return null;
    }

    function formatTime(timeStr) {
        if (!timeStr) return '';
        return timeStr.substring(0, 5);
    }

    function formatDate(dateStr) {
        if (!dateStr) return '';
        const parts = dateStr.split('-');
        if (parts.length === 3) return `${parts[2]}.${parts[1]}.${parts[0]}`;
        return dateStr;
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

    function getStationMeta(areaName) {
        const name = (areaName || '').toLowerCase();
        if (name.includes('kasse')) return { icon: '💵', color: '#10b981', label: 'Kasse' };
        if (name.includes('grill') || name.includes('küche') || name.includes('essen')) return { icon: '🥩', color: '#ef4444', label: 'Grill & Küche' };
        if (name.includes('ausschank') || name.includes('bier') || name.includes('getränk')) return { icon: '🍺', color: '#f59e0b', label: 'Ausschank' };
        if (name.includes('bar') || name.includes('drink')) return { icon: '🍸', color: '#8b5cf6', label: 'Fest-Bar' };
        if (name.includes('service') || name.includes('tisch')) return { icon: '🍽️', color: '#3b82f6', label: 'Service' };
        if (name.includes('springer') || name.includes('abwasch') || name.includes('reinigung')) return { icon: '🧹', color: '#64748b', label: 'Springer' };
        if (name.includes('standblatt') || name.includes('schiess') || name.includes('büro')) return { icon: '🎯', color: '#0ea5e9', label: 'Standblattbüro' };
        return { icon: '📍', color: '#0284c7', label: areaName || 'Station' };
    }

    function getInitials(name) {
        if (!name) return '??';
        const parts = name.trim().split(/\s+/);
        if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }

    async function load() {
        const container = document.getElementById('tab-content-schichten');
        if (!container) return;

        state.isLoading = true;
        renderLoading(container);

        const supa = getSupabase();
        if (!supa) {
            container.innerHTML = '<div class="alert alert-danger">Verbindung zu Supabase nicht verfügbar.</div>';
            return;
        }

        try {
            // 1. Alle aktiven/geplanten Events laden
            const { data: events, error: evErr } = await supa
                .from('events')
                .select('id, name, event_date, start_time, end_time, location, description, status')
                .eq('is_template', false)
                .in('status', ['planned', 'in_progress', 'completed'])
                .order('event_date', { ascending: true });

            if (evErr) throw evErr;
            state.events = events || [];

            if (state.events.length === 0) {
                renderEmpty(container);
                return;
            }

            // Standard: Erstes zukünftiges Event (oder erstes in der Liste)
            if (!state.activeEventId || !state.events.some(e => e.id === state.activeEventId)) {
                const today = new Date().toISOString().split('T')[0];
                const upcoming = state.events.find(e => e.event_date >= today) || state.events[0];
                state.activeEventId = upcoming ? upcoming.id : state.events[0].id;
            }

            await loadEventShifts(state.activeEventId);
            renderUI(container);
        } catch (err) {
            console.error('Fehler beim Laden des Schichtplans:', err);
            container.innerHTML = `
                <div class="glass-card" style="padding: 2rem; text-align: center; color: var(--accent-color);">
                    <div style="font-size: 2rem; margin-bottom: 0.5rem;">⚠️</div>
                    <h4>Schichtplan konnte nicht geladen werden</h4>
                    <p class="text-muted">${escapeHtml(err.message || err)}</p>
                    <button class="btn btn-outline" onclick="MemberShifts.load()">Erneut versuchen</button>
                </div>
            `;
        } finally {
            state.isLoading = false;
        }
    }

    async function loadEventShifts(eventId) {
        const supa = getSupabase();
        if (!supa || !eventId) return;

        const { data: shifts, error: shErr } = await supa
            .from('event_shifts')
            .select('*')
            .eq('event_id', eventId)
            .order('start_time', { ascending: true });

        if (shErr) throw shErr;
        state.shifts = shifts || [];

        if (state.shifts.length > 0) {
            const shiftIds = state.shifts.map(s => s.id);
            const { data: assignments, error: asErr } = await supa
                .from('event_shift_assignments')
                .select('*')
                .in('shift_id', shiftIds);

            if (asErr) throw asErr;
            state.assignments = assignments || [];
        } else {
            state.assignments = [];
        }
    }

    function renderLoading(container) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 3rem 2rem; text-align: center;">
                <div class="loading-spinner">Lade Schichten und Helferplan...</div>
            </div>
        `;
    }

    function renderEmpty(container) {
        container.innerHTML = `
            <div class="glass-card" style="padding: 3rem 2rem; text-align: center;">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📅</div>
                <h3 style="color: var(--primary-color); margin-bottom: 0.5rem;">Aktuell keine Helfereinsätze ausgeschrieben</h3>
                <p class="text-muted" style="max-width: 500px; margin: 0 auto;">
                    Sobald das nächste Schützenfest oder ein Vereinsanlass ansteht, kannst du dich hier bequem für Schichten eintragen.
                </p>
            </div>
        `;
    }

    function renderUI(container) {
        const user = getCurrentUser();
        const activeEvent = state.events.find(e => e.id === state.activeEventId);

        // Prüfen, ob der angemeldete Benutzer bereits Schichten hat
        const myAssignments = state.assignments.filter(a => {
            if (!user) return false;
            if (a.user_id && user.id && a.user_id === user.id) return true;
            if (user.email && a.helper_email && a.helper_email.toLowerCase() === user.email.toLowerCase()) return true;
            const uName = (user.name || `${user.vorname || ''} ${user.nachname || ''}`).trim().toLowerCase();
            return (a.helper_name && a.helper_name.trim().toLowerCase() === uName);
        });

        // Alle eindeutigen Bereiche / Stände
        const distinctAreas = Array.from(new Set(state.shifts.map(s => s.area))).filter(Boolean);

        // Gesamtfortschritt
        const totalNeeded = state.shifts.reduce((acc, s) => acc + (parseInt(s.required_helpers) || 1), 0);
        const totalAssigned = state.assignments.length;
        const openCount = Math.max(0, totalNeeded - totalAssigned);

        container.innerHTML = `
            <!-- INTRO & EVENT SELEKTOR -->
            <div class="glass-card mb-4" style="background: rgba(15, 60, 92, 0.02); padding: 1.5rem 2rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1.25rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.35rem;">
                            <span class="badge" style="background: var(--primary-color); color: white; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">
                                📅 APLANO SCHICHTPLANER
                            </span>
                            <span class="badge" style="background: ${openCount > 0 ? '#fef3c7' : '#dcfce7'}; color: ${openCount > 0 ? '#b45309' : '#15803d'}; padding: 4px 10px; border-radius: 20px; font-size: 0.75rem; font-weight: 700;">
                                ${openCount > 0 ? `🔥 Noch ${openCount} freie Helferplätze` : '🎉 Alle Schichten voll besetzt!'}
                            </span>
                        </div>
                        <h3 style="margin-bottom: 0.25rem; font-size: 1.35rem; color: var(--primary-color);">
                            Helfer- &amp; Schichteinteilung
                        </h3>
                        <p style="color: var(--text-muted); font-size: 0.92rem; margin: 0;">
                            Wähle einen Vereinsanlass und trage dich mit 1 Klick für eine offene Schicht ein.
                        </p>
                    </div>

                    <!-- EVENT-AUSWAHL DROPDOWN -->
                    <div style="min-width: 260px;">
                        <label style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); display: block; margin-bottom: 4px;">Anlass auswählen:</label>
                        <select id="member-shift-event-select" class="form-select" style="padding: 0.55rem 1rem; border-radius: 20px; border: 1px solid var(--glass-border); font-size: 0.92rem; font-weight: 600; background: #ffffff; cursor: pointer; width: 100%; box-shadow: 0 2px 8px rgba(0,0,0,0.03);" onchange="MemberShifts.switchEvent(this.value)">
                            ${state.events.map(ev => `
                                <option value="${ev.id}" ${ev.id === state.activeEventId ? 'selected' : ''}>
                                    ${formatDate(ev.event_date)} – ${escapeHtml(ev.name)}
                                </option>
                            `).join('')}
                        </select>
                    </div>
                </div>
            </div>

            <!-- ABSCHNITT: MEINE EINSÄTZE (FALLS VORHANDEN) -->
            ${myAssignments.length > 0 ? `
                <div class="glass-card mb-4" style="border: 2px solid rgba(16, 185, 129, 0.4); background: rgba(16, 185, 129, 0.04); padding: 1.5rem 2rem;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
                        <div style="display: flex; align-items: center; gap: 0.5rem;">
                            <span style="font-size: 1.4rem;">🎯</span>
                            <h4 style="margin: 0; color: #065f46; font-size: 1.15rem;">Meine Helfereinsätze an diesem Anlass (${myAssignments.length})</h4>
                        </div>
                        <span class="badge" style="background: #10b981; color: white; padding: 4px 10px; border-radius: 12px; font-size: 0.78rem;">
                            Vielen Dank für deine Hilfe!
                        </span>
                    </div>

                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
                        ${myAssignments.map(asg => {
                            const shift = state.shifts.find(s => s.id === asg.shift_id);
                            if (!shift) return '';
                            const meta = getStationMeta(shift.area);
                            const otherHelpers = state.assignments.filter(a => a.shift_id === shift.id && a.id !== asg.id);

                            return `
                                <div style="background: white; border-radius: 12px; padding: 1rem 1.25rem; border: 1px solid #bbf7d0; box-shadow: 0 2px 8px rgba(16, 185, 129, 0.08);">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 0.5rem;">
                                        <div style="display: flex; align-items: center; gap: 0.4rem; font-weight: 700; color: var(--primary-color);">
                                            <span>${meta.icon}</span> <span>${escapeHtml(shift.area)}</span>
                                        </div>
                                        <span class="badge" style="background: #dcfce7; color: #15803d; font-size: 0.75rem;">Bestätigt</span>
                                    </div>
                                    <div style="font-size: 1.05rem; font-weight: 800; color: #1e293b; margin-bottom: 0.25rem;">
                                        ${escapeHtml(shift.role_name)}
                                    </div>
                                    <div style="font-size: 0.88rem; color: var(--text-muted); margin-bottom: 0.75rem;">
                                        🕒 <strong>${formatTime(shift.start_time)} – ${formatTime(shift.end_time)} Uhr</strong>
                                    </div>
                                    ${otherHelpers.length > 0 ? `
                                        <div style="font-size: 0.78rem; color: #475569; margin-bottom: 0.75rem; background: #f8fafc; padding: 6px 8px; border-radius: 6px;">
                                            👥 Schicht-Partner: ${otherHelpers.map(h => escapeHtml(h.helper_name)).join(', ')}
                                        </div>
                                    ` : ''}
                                    <button class="btn btn-outline" style="width: 100%; font-size: 0.8rem; padding: 0.4rem; border-color: #fca5a5; color: #dc2626;" onclick="MemberShifts.cancelAssignment('${asg.id}', '${escapeHtml(shift.role_name)}')">
                                        ✕ Verhindert? Einsatz abgeben
                                    </button>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </div>
            ` : ''}

            <!-- APLANO SCHICHT-MATRIX / KARTEN -->
            <div style="margin-top: 1rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem; flex-wrap: wrap; gap: 0.75rem;">
                    <div>
                        <h4 style="margin: 0; color: var(--primary-color); font-size: 1.2rem;">
                            Offene &amp; eingeteilte Schichten
                        </h4>
                        <span style="font-size: 0.85rem; color: var(--text-muted);">
                            ${activeEvent ? `${escapeHtml(activeEvent.name)} (${formatDate(activeEvent.event_date)})` : ''}
                        </span>
                    </div>
                </div>

                ${state.shifts.length === 0 ? `
                    <div class="glass-card" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
                        Für diesen Anlass sind noch keine Schichten hinterlegt.
                    </div>
                ` : `
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        ${distinctAreas.map(area => {
                            const meta = getStationMeta(area);
                            const areaShifts = state.shifts.filter(s => s.area === area).sort((a, b) => a.start_time.localeCompare(b.start_time));

                            return `
                                <div class="glass-card" style="padding: 1.25rem 1.5rem; border-left: 6px solid ${meta.color}; border-radius: 14px;">
                                    <!-- STAND-KOPFZEILE -->
                                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 1rem; border-bottom: 1px solid rgba(15, 60, 92, 0.08); padding-bottom: 0.6rem;">
                                        <div style="display: flex; align-items: center; gap: 0.6rem;">
                                            <span style="font-size: 1.6rem;">${meta.icon}</span>
                                            <div>
                                                <h4 style="margin: 0; font-size: 1.15rem; color: var(--primary-color);">${escapeHtml(area)}</h4>
                                                <span style="font-size: 0.78rem; color: var(--text-muted);">${areaShifts.length} Zeitfenster / Schichten</span>
                                            </div>
                                        </div>
                                    </div>

                                    <!-- SCHICHT-KARTEN DIESES STANDS -->
                                    <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1rem;">
                                        ${areaShifts.map(sh => {
                                            const asgs = state.assignments.filter(a => a.shift_id === sh.id);
                                            const req = sh.required_helpers || 1;
                                            const count = asgs.length;
                                            const isFull = count >= req;
                                            const isUserAssigned = user && asgs.some(a => (a.user_id && a.user_id === user.id) || (user.email && a.helper_email && a.helper_email.toLowerCase() === user.email.toLowerCase()));

                                            let pillBg = '#fee2e2';
                                            let pillColor = '#b91c1c';
                                            let pillText = `● 0/${req} Offen`;
                                            if (isFull) {
                                                pillBg = '#dcfce7';
                                                pillColor = '#15803d';
                                                pillText = `● ${count}/${req} Voll`;
                                            } else if (count > 0) {
                                                pillBg = '#fef3c7';
                                                pillColor = '#b45309';
                                                pillText = `● ${count}/${req} Teilweise (noch ${req - count} gesucht)`;
                                            }

                                            return `
                                                <div style="background: white; border-radius: 12px; padding: 1rem; border: 1px solid var(--glass-border); display: flex; flex-direction: column; justify-content: space-between; gap: 0.75rem; box-shadow: 0 2px 6px rgba(0,0,0,0.03);">
                                                    <div>
                                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.4rem;">
                                                            <span class="badge" style="background: ${pillBg}; color: ${pillColor}; font-size: 0.72rem; font-weight: 700; padding: 3px 8px; border-radius: 12px;">
                                                                ${pillText}
                                                            </span>
                                                            <span style="font-size: 0.85rem; font-weight: 700; color: #1e293b;">
                                                                🕒 ${formatTime(sh.start_time)}–${formatTime(sh.end_time)}
                                                            </span>
                                                        </div>

                                                        <div style="font-size: 1rem; font-weight: 800; color: var(--primary-color); margin-bottom: 0.2rem;">
                                                            ${escapeHtml(sh.role_name)}
                                                        </div>

                                                        ${sh.description ? `
                                                            <div style="font-size: 0.8rem; color: var(--text-muted); margin-bottom: 0.6rem; line-height: 1.4;">
                                                                ${escapeHtml(sh.description)}
                                                            </div>
                                                        ` : ''}

                                                        <!-- HELFER-LISTE -->
                                                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 0.5rem;">
                                                            ${asgs.map(a => `
                                                                <div style="display: flex; align-items: center; gap: 6px; font-size: 0.8rem; background: #f8fafc; padding: 4px 8px; border-radius: 6px;">
                                                                    <div style="width: 20px; height: 20px; border-radius: 50%; background: var(--primary-color); color: white; display: flex; align-items: center; justify-content: center; font-size: 0.65rem; font-weight: bold; flex-shrink: 0;">
                                                                        ${getInitials(a.helper_name)}
                                                                    </div>
                                                                    <span style="font-weight: 600; color: #334155; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                                                                        ${escapeHtml(a.helper_name)}
                                                                    </span>
                                                                </div>
                                                            `).join('')}
                                                        </div>
                                                    </div>

                                                    <!-- AKTION BUTTON -->
                                                    <div style="margin-top: 0.5rem; border-top: 1px solid rgba(0,0,0,0.05); padding-top: 0.6rem;">
                                                        ${isUserAssigned ? `
                                                            <div style="display: flex; align-items: center; justify-content: center; gap: 6px; color: #10b981; font-weight: 700; font-size: 0.82rem; padding: 6px 0;">
                                                                <span>✔</span> <span>Du bist hier eingeteilt</span>
                                                            </div>
                                                        ` : (isFull ? `
                                                            <div style="text-align: center; color: var(--text-muted); font-size: 0.82rem; padding: 6px 0;">
                                                                Schicht voll besetzt
                                                            </div>
                                                        ` : `
                                                            <button class="btn btn-primary" style="width: 100%; font-size: 0.85rem; padding: 0.5rem; border-radius: 20px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px;" onclick="MemberShifts.openRegisterModal('${sh.id}')">
                                                                <span>🙋</span> <span>Ich übernehme diese Schicht</span>
                                                            </button>
                                                        `)}
                                                    </div>
                                                </div>
                                            `;
                                        }).join('')}
                                    </div>
                                </div>
                            `;
                        }).join('')}
                    </div>
                `}
            </div>

            <!-- MODAL: HELFER-EINTRAGUNG -->
            <div id="modal-member-shift-register" class="modal-overlay" style="display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 9999; display: none; align-items: center; justify-content: center; padding: 15px;">
                <div class="glass-card" style="background: white; border-radius: 16px; max-width: 480px; width: 100%; padding: 2rem; box-shadow: 0 20px 40px rgba(0,0,0,0.25); position: relative;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.25rem;">
                        <h3 style="margin: 0; color: var(--primary-color); font-size: 1.25rem;">Für Schicht eintragen</h3>
                        <button style="background: none; border: none; font-size: 1.3rem; cursor: pointer; color: var(--text-muted);" onclick="MemberShifts.closeModal()">✕</button>
                    </div>

                    <div id="shift-register-info-banner" style="background: rgba(15, 60, 92, 0.04); border-radius: 10px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; font-size: 0.9rem;"></div>

                    <form id="form-member-shift-register" onsubmit="MemberShifts.submitRegister(event)">
                        <input type="hidden" id="reg-shift-id">
                        
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">Dein Name (Vorname Nachname) *</label>
                            <input type="text" id="reg-name" required style="width: 100%; padding: 0.65rem 1rem; border-radius: 8px; border: 1px solid var(--glass-border); font-size: 0.92rem; outline: none;">
                        </div>

                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">Mobiltelefon (für Schicht-Koordination)</label>
                            <input type="tel" id="reg-phone" placeholder="z.B. 079 123 45 67" style="width: 100%; padding: 0.65rem 1rem; border-radius: 8px; border: 1px solid var(--glass-border); font-size: 0.92rem; outline: none;">
                        </div>

                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">E-Mail (für Bestätigung)</label>
                            <input type="email" id="reg-email" placeholder="deine@adresse.ch" style="width: 100%; padding: 0.65rem 1rem; border-radius: 8px; border: 1px solid var(--glass-border); font-size: 0.92rem; outline: none;">
                        </div>

                        <div style="margin-bottom: 1.5rem;">
                            <label style="display: block; font-size: 0.82rem; font-weight: 700; color: var(--text-muted); margin-bottom: 4px;">Notiz / Bemerkung (optional)</label>
                            <input type="text" id="reg-notes" placeholder="z.B. Bringt Schürze mit / Erst ab 17:30 vor Ort" style="width: 100%; padding: 0.65rem 1rem; border-radius: 8px; border: 1px solid var(--glass-border); font-size: 0.92rem; outline: none;">
                        </div>

                        <div id="reg-alert-box" style="display: none; padding: 0.75rem; border-radius: 8px; font-size: 0.85rem; margin-bottom: 1rem; text-align: center;"></div>

                        <div style="display: flex; gap: 0.75rem; justify-content: flex-end;">
                            <button type="button" class="btn btn-outline" onclick="MemberShifts.closeModal()">Abbrechen</button>
                            <button type="submit" id="btn-submit-register" class="btn btn-primary" style="font-weight: 700; padding: 0.65rem 1.4rem;">
                                🚀 Jetzt eintragen
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        `;
    }

    function switchEvent(eventId) {
        state.activeEventId = eventId;
        load();
    }

    function openRegisterModal(shiftId) {
        const shift = state.shifts.find(s => s.id === shiftId);
        if (!shift) return;

        state.activeShiftForRegister = shift;
        const user = getCurrentUser();

        const modal = document.getElementById('modal-member-shift-register');
        const infoBanner = document.getElementById('shift-register-info-banner');
        const shiftIdInput = document.getElementById('reg-shift-id');
        const nameInput = document.getElementById('reg-name');
        const phoneInput = document.getElementById('reg-phone');
        const emailInput = document.getElementById('reg-email');
        const notesInput = document.getElementById('reg-notes');
        const alertBox = document.getElementById('reg-alert-box');

        if (alertBox) alertBox.style.display = 'none';

        const meta = getStationMeta(shift.area);
        if (infoBanner) {
            infoBanner.innerHTML = `
                <div style="font-weight: 800; color: var(--primary-color);">${meta.icon} ${escapeHtml(shift.area)}: ${escapeHtml(shift.role_name)}</div>
                <div style="color: var(--text-muted); font-size: 0.82rem; margin-top: 2px;">
                    🕒 Zeit: <strong>${formatTime(shift.start_time)} – ${formatTime(shift.end_time)} Uhr</strong>
                </div>
            `;
        }

        if (shiftIdInput) shiftIdInput.value = shift.id;
        
        // Vorbelegung aus aktuellem Benutzerkonto
        if (nameInput) {
            let defName = '';
            if (user) {
                defName = user.name || `${user.vorname || ''} ${user.nachname || ''}`.trim();
            }
            nameInput.value = defName;
        }

        if (emailInput) {
            emailInput.value = user && user.email ? user.email : '';
        }

        if (phoneInput) {
            phoneInput.value = user && user.phone ? user.phone : '';
        }

        if (notesInput) notesInput.value = '';

        if (modal) {
            modal.style.display = 'flex';
        }
    }

    function closeModal() {
        const modal = document.getElementById('modal-member-shift-register');
        if (modal) modal.style.display = 'none';
        state.activeShiftForRegister = null;
    }

    async function submitRegister(e) {
        e.preventDefault();
        const shiftId = document.getElementById('reg-shift-id').value;
        const name = document.getElementById('reg-name').value.trim();
        const phone = document.getElementById('reg-phone').value.trim();
        const email = document.getElementById('reg-email').value.trim();
        const notes = document.getElementById('reg-notes').value.trim();
        const btnSubmit = document.getElementById('btn-submit-register');
        const alertBox = document.getElementById('reg-alert-box');

        if (!name) {
            alert('Bitte gib deinen Namen ein.');
            return;
        }

        const supa = getSupabase();
        if (!supa) {
            alert('Supabase-Client nicht verfügbar.');
            return;
        }

        if (btnSubmit) {
            btnSubmit.disabled = true;
            btnSubmit.textContent = 'Trage ein...';
        }

        try {
            const { data, error } = await supa.rpc('register_member_for_shift', {
                p_shift_id: shiftId,
                p_name: name,
                p_phone: phone || null,
                p_email: email || null,
                p_notes: notes || null
            });

            if (error) throw error;

            if (data && data.success === false) {
                if (alertBox) {
                    alertBox.style.display = 'block';
                    alertBox.style.background = '#fee2e2';
                    alertBox.style.color = '#b91c1c';
                    alertBox.textContent = data.error || 'Eintragung fehlgeschlagen.';
                }
                return;
            }

            closeModal();
            alert('🎉 Du wurdest erfolgreich für diese Schicht eingeteilt! Herzlichen Dank für deinen Einsatz.');
            await load();
        } catch (err) {
            console.error('Fehler bei Schicht-Eintragung:', err);
            if (alertBox) {
                alertBox.style.display = 'block';
                alertBox.style.background = '#fee2e2';
                alertBox.style.color = '#b91c1c';
                alertBox.textContent = 'Fehler: ' + (err.message || err);
            }
        } finally {
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.textContent = '🚀 Jetzt eintragen';
            }
        }
    }

    async function cancelAssignment(assignmentId, roleName) {
        if (!confirm(`Möchtest du deinen Einsatz für die Schicht «${roleName}» wirklich abgeben?`)) {
            return;
        }

        const supa = getSupabase();
        if (!supa) return;

        try {
            const { data, error } = await supa.rpc('cancel_member_shift_assignment', {
                p_assignment_id: assignmentId
            });

            if (error) throw error;

            if (data && data.success === false) {
                alert(data.error || 'Abmeldung fehlgeschlagen.');
                return;
            }

            alert('Zuteilung wurde erfolgreich aufgehoben.');
            await load();
        } catch (err) {
            console.error('Fehler beim Stornieren des Helfereinsatzes:', err);
            alert('Fehler beim Abmelden: ' + (err.message || err));
        }
    }

    return {
        load,
        switchEvent,
        openRegisterModal,
        closeModal,
        submitRegister,
        cancelAssignment
    };
})();
