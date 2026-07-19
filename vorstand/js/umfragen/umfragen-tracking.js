// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - TRACKING & HISTORIE ===

async function loadUmfragenHistorie(force = false) {
    const rsvpBody = document.getElementById('hist-rsvp-body');
    const viewsBody = document.getElementById('hist-views-body');
    if (!rsvpBody || !viewsBody) return;

    const hasLogs = rawResponsesLog.length > 0 && rawViewsLog.length > 0;
    if (force || !hasLogs) {
        rsvpBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade Historie...</td></tr>`;
        viewsBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade Gelesen-Logs...</td></tr>`;
    }

    try {
        await ensureMembersLookup();

        if (force || !hasLogs) {
            // 1. Hole rohe Logs von neuen API-Aktionen
            const [resLog, resViews] = await Promise.all([
                apiFetch('umfragen', 'action=getResponsesLog').then(r => r.json()),
                apiFetch('umfragen', 'action=getViewsLog').then(r => r.json())
            ]);

            if (resLog && resLog.error) throw new Error(resLog.error);
            if (resViews && resViews.error) throw new Error(resViews.error);

            rawResponsesLog = Array.isArray(resLog) ? resLog : [];
            rawViewsLog = Array.isArray(resViews) ? resViews : [];

            // Sortieren nach Timestamp absteigend
            const parseTime = (t) => t ? new Date(t).getTime() : 0;
            rawResponsesLog.sort((a, b) => parseTime(b.timestamp) - parseTime(a.timestamp));
            rawViewsLog.sort((a, b) => parseTime(b.zeitpunkt || b.timestamp) - parseTime(a.zeitpunkt || a.timestamp));
        }

        // 2. Event-Filter befüllen
        const filterSelect = document.getElementById('hist-event-filter');
        if (filterSelect) {
            // Hole eindeutige Events aus Events in State ODER Logs
            const eventsMap = {};
            (umfragenState || []).forEach(e => {
                if (e.id) eventsMap[e.id] = e.title;
            });
            rawResponsesLog.forEach(log => {
                const evId = getEventIdFromLog(log);
                if (evId && !eventsMap[evId]) {
                    eventsMap[evId] = `Unbekanntes Event (${evId})`;
                }
            });

            // Aktuell ausgewählten Wert beibehalten
            const curVal = filterSelect.value;
            filterSelect.innerHTML = '<option value="">-- Alle Events --</option>' +
                Object.entries(eventsMap).map(([id, title]) => `<option value="${escapeHtml(id)}">${escapeHtml(title)}</option>`).join('');
            filterSelect.value = curVal;
        }

        filterHistorieData();

    } catch (e) {
        rsvpBody.innerHTML = `<tr><td colspan="6" class="text-center text-danger py-3">Fehler: ${escapeHtml(e.message)}</td></tr>`;
        viewsBody.innerHTML = `<tr><td colspan="4" class="text-center text-danger py-3">Fehler: ${escapeHtml(e.message)}</td></tr>`;
    }
}

function filterHistorieData() {
    const rsvpBody = document.getElementById('hist-rsvp-body');
    const viewsBody = document.getElementById('hist-views-body');
    if (!rsvpBody || !viewsBody) return;

    const eventFilter = document.getElementById('hist-event-filter')?.value || '';
    const searchFilter = (document.getElementById('hist-search-input')?.value || '').toLowerCase().trim();

    // Mapping für Namenauflösung
    const eventsMap = {};
    (umfragenState || []).forEach(e => {
        if (e.id) eventsMap[e.id] = e.title;
    });

    const formatTimestamp = (ts) => {
        if (!ts) return '-';
        const d = new Date(ts);
        if (isNaN(d.getTime())) return escapeHtml(ts);
        return d.toLocaleString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    };

    // 1. Responses Log rendern
    const filteredResponses = rawResponsesLog.filter(log => {
        const evId = getEventIdFromLog(log);
        const matchesEvent = !eventFilter || String(evId) === eventFilter;

        let name = "Lizenz " + log.lizenz;
        let liz = String(log.lizenz || '').trim();
        if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
        const m = membersLookup[liz] || membersLookup[String(log.lizenz).trim()];
        if (m) name = `${m.LastName} ${m.FirstName}`;

        const matchesSearch = !searchFilter ||
            name.toLowerCase().includes(searchFilter) ||
            String(log.lizenz).includes(searchFilter);

        return matchesEvent && matchesSearch;
    });

    if (filteredResponses.length === 0) {
        rsvpBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">Keine Einträge für die Auswahl gefunden.</td></tr>`;
    } else {
        rsvpBody.innerHTML = filteredResponses.map(log => {
            let name = "Lizenz " + log.lizenz;
            let liz = String(log.lizenz || '').trim();
            if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
            const m = membersLookup[liz] || membersLookup[String(log.lizenz).trim()];
            if (m) name = `<b>${m.LastName} ${m.FirstName}</b>`;

            const evId = getEventIdFromLog(log);
            const evTitle = eventsMap[evId] || `Event ${evId}`;
            const attending = isTrue(log.teilnahme !== undefined ? log.teilnahme : log.attending);
            const statusBadge = attending
                ? `<span class="badge bg-success-subtle text-success border border-success-subtle px-2 py-1"><i class="fa-solid fa-check me-1"></i>Angemeldet</span>`
                : `<span class="badge bg-danger-subtle text-danger border border-danger-subtle px-2 py-1"><i class="fa-solid fa-xmark me-1"></i>Abgemeldet</span>`;

            const countVal = log.anzahl_teilnehmer !== undefined ? log.anzahl_teilnehmer : log.count;
            const essenVal = log.anzahl_essen !== undefined ? log.anzahl_essen : log.essen;
            const vegiVal = log.anzahl_vegi !== undefined ? log.anzahl_vegi : (log.vegi || 0);

            let essenStr = '-';
            if (parseInt(essenVal) > 0) {
                essenStr = `<span class="badge bg-warning text-dark" title="Standard">${parseInt(essenVal)}</span>`;
                if (parseInt(vegiVal) > 0) {
                    essenStr += ` <span class="badge bg-success-subtle text-success border border-success-subtle" title="Vegetarisch">Vegi: ${parseInt(vegiVal)}</span>`;
                }
            }

            return `<tr>
                <td class="text-muted small">${formatTimestamp(log.timestamp)}</td>
                <td>${name} <small class="text-muted">(${escapeHtml(log.lizenz)})</small></td>
                <td>${escapeHtml(evTitle)}</td>
                <td class="text-center">${statusBadge}</td>
                <td class="text-center">${parseInt(countVal) > 1 ? `<span class="badge bg-info text-dark">+${parseInt(countVal)-1}</span>` : '-'}</td>
                <td class="text-center">${essenStr}</td>
            </tr>`;
        }).join('');
    }

    // 2. Views Log rendern
    const filteredViews = rawViewsLog.filter(view => {
        const evId = getEventIdFromLog(view);
        const matchesEvent = !eventFilter || String(evId) === eventFilter;

        let name = "Lizenz " + view.lizenz;
        let liz = String(view.lizenz || '').trim();
        if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
        const m = membersLookup[liz] || membersLookup[String(view.lizenz).trim()];
        if (m) name = `${m.LastName} ${m.FirstName}`;

        const matchesSearch = !searchFilter ||
            name.toLowerCase().includes(searchFilter) ||
            String(view.lizenz).includes(searchFilter);

        return matchesEvent && matchesSearch;
    });

    if (filteredViews.length === 0) {
        viewsBody.innerHTML = `<tr><td colspan="4" class="text-center text-muted py-3">Keine Einträge für die Auswahl gefunden.</td></tr>`;
    } else {
        viewsBody.innerHTML = filteredViews.map(view => {
            let name = "Lizenz " + view.lizenz;
            let liz = String(view.lizenz || '').trim();
            if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
            const m = membersLookup[liz] || membersLookup[String(view.lizenz).trim()];
            if (m) name = `<b>${m.LastName} ${m.FirstName}</b>`;

            const evId = getEventIdFromLog(view);
            let evTitle = eventsMap[evId] || `Event ${evId}`;
            if (evId === 'APP_OPEN') evTitle = `📱 Portal geöffnet`;

            return `<tr>
                <td class="text-muted small">${formatTimestamp(view.zeitpunkt || view.timestamp)}</td>
                <td>${name} <small class="text-muted">(${escapeHtml(view.lizenz)})</small></td>
                <td>${escapeHtml(evTitle)}</td>
                <td><span class="text-secondary small">${escapeHtml(view.info || 'Gesehen')}</span></td>
            </tr>`;
        }).join('');
    }
}

async function loadUmfragenPersonenkreise(force = false) {
    const listAktiv = document.getElementById('list-pk-aktiv');
    const listPassiv = document.getElementById('list-pk-passiv');
    const listAlle = document.getElementById('list-pk-alle');
    if (!listAktiv || !listPassiv || !listAlle) return;

    const hasMembers = rawUmfragenMembers.length > 0;
    if (force || !hasMembers) {
        listAktiv.innerHTML = `<li class="list-group-item text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade...</li>`;
        listPassiv.innerHTML = `<li class="list-group-item text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade...</li>`;
        listAlle.innerHTML = `<li class="list-group-item text-center text-muted py-3"><div class="spinner-border spinner-border-sm text-primary me-2"></div>Lade...</li>`;
    }

    try {
        if (force || !hasMembers) {
            let data = [];
            if (window._mglData && window._mglData.length > 0) {
                console.log("⚡ loadUmfragenPersonenkreise: Verwende vorverlegte Mitglieder-Daten aus Cache...");
                const isTrue = val => val === true || val === 1 || val === '1' || String(val).toLowerCase() === 'ja' || String(val).toLowerCase() === 'true';
                data = window._mglData.filter(m => {
                    if (isTrue(m.Deceased)) return false;
                    const isAct = isTrue(m.IsActive);
                    const isPass = isTrue(m._istPassiv) || isTrue(m.IsPassive) || String(m._kategorie || '').toLowerCase().includes('passiv');
                    const isEhren = isTrue(m._istEhren) || isTrue(m.IsHonoraryMember) || String(m._kategorie || '').toLowerCase().includes('ehren');
                    return isAct || isPass || isEhren;
                }).map(m => {
                    const isPass = isTrue(m._istPassiv) || isTrue(m.IsPassive) || String(m._kategorie || '').toLowerCase().includes('passiv');
                    let gruppe = 'aktiv';
                    if (isPass) {
                        gruppe = 'passiv';
                    }
                    return {
                        name: `${m.LastName || ''} ${m.FirstName || ''}`.trim() || m.PrimaryEmail || 'Unbekannt',
                        mail: String(m.PrimaryEmail || m.AdditionalEmail || '').trim(),
                        lizenz: String(m.PersonNumber || m.AddressNumber || '').trim(),
                        gruppe: gruppe
                    };
                });
            } else {
                const res = await apiFetch('umfragen', 'action=getMembers');
                data = await res.json();
            }

            rawUmfragenMembers = Array.isArray(data) ? data : [];
        }
        filterPersonenkreise();

    } catch (e) {
        listAktiv.innerHTML = `<li class="list-group-item text-center text-danger py-3">Fehler: ${escapeHtml(e.message)}</li>`;
        listPassiv.innerHTML = `<li class="list-group-item text-center text-danger py-3">Fehler: ${escapeHtml(e.message)}</li>`;
        listAlle.innerHTML = `<li class="list-group-item text-center text-danger py-3">Fehler: ${escapeHtml(e.message)}</li>`;
    }
}

function filterPersonenkreise() {
    const listAktiv = document.getElementById('list-pk-aktiv');
    const listPassiv = document.getElementById('list-pk-passiv');
    const listAlle = document.getElementById('list-pk-alle');
    if (!listAktiv || !listPassiv || !listAlle) return;

    const search = (document.getElementById('personenkreise-search')?.value || '').toLowerCase().trim();

    const filtered = rawUmfragenMembers.filter(m => {
        if (!search) return true;
        return String(m.name || '').toLowerCase().includes(search) ||
               String(m.lizenz || '').includes(search) ||
               String(m.mail || '').toLowerCase().includes(search);
    }).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de-CH'));

    const buildItem = (m) => {
        const mailStr = m.mail ? `<div class="text-muted small mt-1"><i class="fa-regular fa-envelope me-1"></i>${escapeHtml(m.mail)}</div>` : '';
        return `
            <li class="list-group-item py-2 px-3 hover-item">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <div class="fw-bold text-dark">${escapeHtml(m.name)}</div>
                        ${mailStr}
                    </div>
                    <span class="badge bg-light text-dark border small text-muted font-monospace">${escapeHtml(m.lizenz)}</span>
                </div>
            </li>
        `;
    };

    const aktivMembers = filtered.filter(m => String(m.gruppe).toLowerCase() === 'aktiv');
    const passivMembers = filtered.filter(m => String(m.gruppe).toLowerCase() === 'passiv');
    const alleMembers = filtered;

    // Counts aktualisieren
    document.getElementById('count-pk-aktiv').innerText = aktivMembers.length;
    document.getElementById('count-pk-passiv').innerText = passivMembers.length;
    document.getElementById('count-pk-alle').innerText = alleMembers.length;

    // Listen aktualisieren
    if (aktivMembers.length === 0) {
        listAktiv.innerHTML = `<li class="list-group-item text-center text-muted py-3">Keine aktiven Mitglieder</li>`;
    } else {
        listAktiv.innerHTML = aktivMembers.map(buildItem).join('');
    }

    if (passivMembers.length === 0) {
        listPassiv.innerHTML = `<li class="list-group-item text-center text-muted py-3">Keine passiven Mitglieder</li>`;
    } else {
        listPassiv.innerHTML = passivMembers.map(buildItem).join('');
    }

    if (alleMembers.length === 0) {
        listAlle.innerHTML = `<li class="list-group-item text-center text-muted py-3">Keine Mitglieder gefunden</li>`;
    } else {
        listAlle.innerHTML = alleMembers.map(buildItem).join('');
    }
}
