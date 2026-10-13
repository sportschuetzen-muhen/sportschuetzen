// === SUB-MODUL: JAHRESMEISTERSCHAFT - STANDBLATT INBOX ===
// Ermöglicht dem Schützenmeister die Prüfung und 1-Klick-Übernahme von via PWA eingereichten Standblättern

let _jmPendingStandblaetter = [];
let _jmInboxActive = false;

/**
 * Lädt alle eingereichten Standblätter aus contest_ocr_logs
 */
async function loadPendingStandblaetter(silent = false) {
    const sb = (typeof getJMSupabaseClient === 'function') ? getJMSupabaseClient() : (window.supabaseClient || null);
    if (!sb) return [];

    try {
        const { data, error } = await sb
            .from('contest_ocr_logs')
            .select('*')
            .eq('contest_type', 'standblatt')
            .order('created_at', { ascending: false });

        if (error) throw error;

        _jmPendingStandblaetter = (Array.isArray(data) ? data : []).filter(item => {
            const resp = item.raw_response || {};
            return resp.status !== 'imported' && resp.status !== 'rejected';
        });

        updateJMInboxBadge(_jmPendingStandblaetter.length);
        return _jmPendingStandblaetter;
    } catch (err) {
        if (!silent) console.warn("Konnte Standblätter-Inbox nicht laden:", err);
        return [];
    }
}
window.loadPendingStandblaetter = loadPendingStandblaetter;

/**
 * Aktualisiert das Benachrichtigungs-Badge im Header
 */
function updateJMInboxBadge(count) {
    const badge = document.getElementById('jm-inbox-badge');
    if (!badge) return;

    if (count > 0) {
        badge.innerText = count;
        badge.classList.remove('d-none');
    } else {
        badge.classList.add('d-none');
    }
}
window.updateJMInboxBadge = updateJMInboxBadge;

/**
 * Öffnet das Standblatt-Inbox Modal
 */
async function openJMStandblattInboxModal() {
    const modalElem = document.getElementById('jm-standblatt-inbox-modal');
    if (!modalElem) return;

    const modal = new bootstrap.Modal(modalElem);
    modal.show();

    renderJMStandblattInboxLoading();
    await loadPendingStandblaetter();
    renderJMStandblattInboxTable();
}
window.openJMStandblattInboxModal = openJMStandblattInboxModal;

function renderJMStandblattInboxLoading() {
    const body = document.getElementById('jm-inbox-table-body');
    if (body) {
        body.innerHTML = `<tr><td colspan="6" class="text-center py-4 text-muted"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade eingereichte Standblätter...</td></tr>`;
    }
}

/**
 * Rendert die Tabelle der ausstehenden Standblätter
 */
function renderJMStandblattInboxTable() {
    const body = document.getElementById('jm-inbox-table-body');
    const emptyAlert = document.getElementById('jm-inbox-empty-alert');
    const tableCard = document.getElementById('jm-inbox-table-card');
    if (!body) return;

    const items = _jmPendingStandblaetter || [];

    if (items.length === 0) {
        if (emptyAlert) emptyAlert.classList.remove('d-none');
        if (tableCard) tableCard.classList.add('d-none');
        return;
    }

    if (emptyAlert) emptyAlert.classList.add('d-none');
    if (tableCard) tableCard.classList.remove('d-none');

    const canWrite = (typeof hasWriteAccess === 'function') ? hasWriteAccess('jahresmeisterschaft') : true;

    body.innerHTML = items.map((item, idx) => {
        const raw = item.raw_response || {};
        const vorname = escapeHtml(raw.vorname || '');
        const nachname = escapeHtml(raw.nachname || '');
        const fullName = `${vorname} ${nachname}`.trim() || 'Unbekannt';
        const lizenz = escapeHtml(raw.lizenz ? String(raw.lizenz).padStart(6, '0') : '-');
        const anlass = escapeHtml(raw.anlass || 'Auswärtiges Schiessen');
        const erzielt = parseFloat(raw.erzielt) || 0;
        const maximal = parseFloat(raw.maximal) || 100;
        const pct = maximal > 0 ? ((erzielt / maximal) * 100).toFixed(2) : '0.00';

        const dateStr = item.created_at ? new Date(item.created_at).toLocaleString('de-CH', {
            day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        }) : '-';

        const fileUrl = raw.fileUrl || '';

        let belegHtml = '<span class="text-muted small">Kein Beleg</span>';
        if (fileUrl) {
            belegHtml = `
                <button type="button" class="btn btn-sm btn-outline-info rounded-pill px-2 py-1" onclick="jmViewStandblattPhoto('${escapeHtml(fileUrl)}', '${escapeHtml(fullName + ' - ' + anlass)}')">
                    <i class="fas fa-image me-1"></i>Beleg ansehen
                </button>
            `;
        }

        return `
            <tr id="inbox-row-${item.id}">
                <td class="small text-muted text-nowrap">${dateStr}</td>
                <td>
                    <div class="fw-bold text-dark">${fullName}</div>
                    <div class="small text-muted">Lizenz: ${lizenz}</div>
                </td>
                <td>
                    <div class="fw-semibold text-primary">${anlass}</div>
                </td>
                <td class="text-center">
                    <span class="badge bg-primary fs-6 px-2 py-1">${erzielt}</span>
                    <span class="text-muted small ms-1">/ ${maximal} Pkt (${pct}%)</span>
                </td>
                <td class="text-center">${belegHtml}</td>
                <td class="text-end text-nowrap">
                    ${canWrite ? `
                        <button type="button" id="btn-import-${item.id}" class="btn btn-sm btn-success rounded-pill px-3 fw-semibold me-1 shadow-xs" onclick="jmImportStandblatt('${item.id}')">
                            <i class="fas fa-check me-1"></i>Übernehmen
                        </button>
                        <button type="button" id="btn-reject-${item.id}" class="btn btn-sm btn-outline-danger rounded-pill px-2" title="Ablehnen" onclick="jmRejectStandblatt('${item.id}')">
                            <i class="fas fa-times"></i>
                        </button>
                    ` : '<span class="badge bg-secondary">Nur Ansicht</span>'}
                </td>
            </tr>
        `;
    }).join('');
}

/**
 * Zeigt das Foto des Standblatts in voller Grösse an
 */
function jmViewStandblattPhoto(url, title) {
    if (!url) return;
    const modalElem = document.getElementById('jm-standblatt-photo-modal');
    const imgElem = document.getElementById('jm-standblatt-photo-img');
    const titleElem = document.getElementById('jm-standblatt-photo-title');

    if (imgElem) imgElem.src = url;
    if (titleElem) titleElem.innerText = title || 'Standblatt Belegfoto';

    if (modalElem) {
        const modal = new bootstrap.Modal(modalElem);
        modal.show();
    }
}
window.jmViewStandblattPhoto = jmViewStandblattPhoto;

/**
 * Übernimmt ein eingereichtes Standblatt direkt in jmRawGrid und Supabase
 */
async function jmImportStandblatt(logId) {
    const item = _jmPendingStandblaetter.find(i => i.id === logId);
    if (!item) {
        showError("Standblatt-Eintrag nicht gefunden.");
        return;
    }

    const raw = item.raw_response || {};
    const vorname = String(raw.vorname || '').trim();
    const nachname = String(raw.nachname || '').trim();
    const lizenz = raw.lizenz ? String(raw.lizenz).padStart(6, '0') : '';
    const anlass = String(raw.anlass || 'Auswärtiges Schiessen').trim();
    const erzielt = parseFloat(raw.erzielt) || 0;
    const maximal = parseFloat(raw.maximal) || 100;

    if (!confirm(`Möchtest du das Standblatt für "${vorname} ${nachname}" (${erzielt} / ${maximal} Pkt beim "${anlass}") in die Jahresmeisterschaft übernehmen?`)) {
        return;
    }

    const grid = jmRawGrid;
    if (!grid || grid.length < 6) {
        showError("Keine Jahresmeisterschafts-Daten geladen. Bitte lade die Seite neu.");
        return;
    }

    const sb = (typeof getJMSupabaseClient === 'function') ? getJMSupabaseClient() : (window.supabaseClient || null);
    if (!sb) {
        showError("Supabase-Client nicht verfügbar.");
        return;
    }

    const importBtn = document.getElementById(`btn-import-${logId}`);
    if (importBtn) {
        importBtn.disabled = true;
        importBtn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Übernehme...`;
    }

    try {
        const headerRow = grid[4] || [];
        const colNachname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'nachname');
        const colVorname = headerRow.findIndex(t => String(t || '').trim().toLowerCase() === 'vorname');
        const colLizenz = headerRow.findIndex(t => String(t || '').trim().toLowerCase().includes('lizenz'));

        // 1. Schützenzeile im Grid suchen
        let targetRowIndex = -1;
        for (let r = 5; r < grid.length; r++) {
            if (!grid[r] || r === 13 || r === 14) continue;
            const rowLiz = String(grid[r][colLizenz] || '').trim().padStart(6, '0');
            const rowNach = String(grid[r][colNachname] || '').trim().toLowerCase();
            const rowVor = String(grid[r][colVorname] || '').trim().toLowerCase();

            if (lizenz && rowLiz === lizenz) {
                targetRowIndex = r;
                break;
            }
            if (rowNach === nachname.toLowerCase() && rowVor === vorname.toLowerCase()) {
                targetRowIndex = r;
                break;
            }
        }

        if (targetRowIndex === -1) {
            throw new Error(`Schütze "${vorname} ${nachname}" (Lizenz: ${lizenz}) wurde in der Jahresmeisterschaft nicht gefunden.`);
        }

        // 2. Passende Spalte suchen oder neue Spalte anlegen (ab Spalte 41 bzw. 42)
        const hasStatusCol = headerRow.some(val => String(val || '').trim().toLowerCase() === 'status');
        const startDynamic = hasStatusCol ? 42 : 41;
        const compRow = grid[2] || [];
        const maxRow = grid[3] || [];

        let targetCol = -1;

        // Prio 1: Gleicher Anlassname
        for (let c = startDynamic; c < compRow.length; c++) {
            const title = String(compRow[c] || '').trim().toLowerCase();
            if (title === anlass.toLowerCase()) {
                targetCol = c;
                break;
            }
        }

        // Prio 2: Neue Spalte anlegen
        if (targetCol === -1) {
            for (let c = startDynamic; c < compRow.length; c++) {
                const t = String(compRow[c] || '').trim().toLowerCase();
                if (!t || t === '' || t.startsWith('spalte')) {
                    targetCol = c;
                    break;
                }
            }
            if (targetCol === -1) {
                targetCol = compRow.length;
            }

            if (!grid[0]) grid[0] = [];
            if (!grid[2]) grid[2] = [];
            if (!grid[3]) grid[3] = [];

            grid[0][targetCol] = 'TRUE';
            grid[2][targetCol] = anlass;
            grid[3][targetCol] = maximal;

            for (let r = 5; r < grid.length; r++) {
                if (grid[r] && grid[r][targetCol] === undefined) {
                    grid[r][targetCol] = '';
                }
            }
        } else {
            // Maximum aktualisieren falls abweichend
            grid[3][targetCol] = maximal;
        }

        // 3. Punktezahl in jmRawGrid eintragen
        grid[targetRowIndex][targetCol] = erzielt;

        // 4. Gesamtes Grid inklusive Top 4 SMM, Top 2 Auswärtige, Rangierung & Totals neu berechnen
        if (typeof recalculateJMRawGrid === 'function') {
            recalculateJMRawGrid(grid);
        }

        // 5. In public.jm_seasons speichern
        const juniorList = (typeof jmJuniorExclusions !== 'undefined')
            ? Object.keys(jmJuniorExclusions).filter(k => jmJuniorExclusions[k] === true)
            : [];

        const { error: errSeason } = await sb
            .from('jm_seasons')
            .upsert({
                jahr: jmCurrentJahr || 'current',
                raw_grid: grid,
                junior_exclusions: juniorList,
                updated_at: new Date().toISOString()
            }, { onConflict: 'jahr' });

        if (errSeason) throw errSeason;

        // 6. Strukturierte Ranglisten synchronisieren (public.jm_shooters)
        if (typeof syncJMShootersToSupabase === 'function') {
            await syncJMShootersToSupabase(sb, jmCurrentJahr || 'current', grid);
        }

        // 7. Status in contest_ocr_logs auf 'imported' setzen
        await sb
            .from('contest_ocr_logs')
            .update({
                raw_response: {
                    ...raw,
                    status: 'imported',
                    imported_at: new Date().toISOString()
                }
            })
            .eq('id', logId);

        // 8. Inbox bereinigen & UI aktualisieren
        _jmPendingStandblaetter = _jmPendingStandblaetter.filter(i => i.id !== logId);
        updateJMInboxBadge(_jmPendingStandblaetter.length);
        renderJMStandblattInboxTable();

        if (typeof renderJahresmeisterschaft === 'function') {
            renderJahresmeisterschaft(grid);
        }

        showSuccess(`✅ Standblatt für ${vorname} ${nachname} (${erzielt} Pkt) erfolgreich in die Jahresmeisterschaft übernommen!`);

    } catch (err) {
        console.error("Fehler beim Übernehmen des Standblatts:", err);
        showError("Fehler beim Übernehmen: " + err.message);
        if (importBtn) {
            importBtn.disabled = false;
            importBtn.innerHTML = `<i class="fas fa-check me-1"></i>Übernehmen`;
        }
    }
}
window.jmImportStandblatt = jmImportStandblatt;

/**
 * Lehnt ein Standblatt ab
 */
async function jmRejectStandblatt(logId) {
    if (!confirm("Möchtest du dieses Standblatt wirklich ablehnen?")) {
        return;
    }

    const sb = (typeof getJMSupabaseClient === 'function') ? getJMSupabaseClient() : (window.supabaseClient || null);
    if (!sb) return;

    try {
        const item = _jmPendingStandblaetter.find(i => i.id === logId);
        const raw = item ? (item.raw_response || {}) : {};

        await sb
            .from('contest_ocr_logs')
            .update({
                raw_response: {
                    ...raw,
                    status: 'rejected',
                    rejected_at: new Date().toISOString()
                }
            })
            .eq('id', logId);

        _jmPendingStandblaetter = _jmPendingStandblaetter.filter(i => i.id !== logId);
        updateJMInboxBadge(_jmPendingStandblaetter.length);
        renderJMStandblattInboxTable();
        showSuccess("Standblatt abgelehnt.");
    } catch (err) {
        showError("Fehler beim Ablehnen: " + err.message);
    }
}
window.jmRejectStandblatt = jmRejectStandblatt;

// Beim Start des Vorstands-Portals Badge initial prüfen
document.addEventListener("DOMContentLoaded", () => {
    setTimeout(() => {
        loadPendingStandblaetter(true);
    }, 1200);
});
