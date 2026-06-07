// =========================================================
//  MODULE: MANAGER - UI
//  - Skeleton-Loader, Datenverarbeitung & HTML-Karten-Rendering
// =========================================================

function renderLoadingState() {
    const config = CONTEST_CONFIG[appState.activeModule];
    const inner = document.getElementById('manager-inner');
    if (!inner) return;
    
    // Skeleton Screen statt einfachem Spinner
    inner.innerHTML = `
        <div class="col-md-4 d-none d-md-block">
            <div class="skeleton-block mb-3" style="height: 200px;"></div>
            <div class="skeleton-block" style="height: 400px;"></div>
        </div>
        <div class="col-12 col-md-8">
            <div class="row g-3">
                <div class="col-xl-6 col-12"><div class="skeleton-block" style="height: 250px;"></div></div>
                <div class="col-xl-6 col-12"><div class="skeleton-block" style="height: 250px;"></div></div>
                <div class="col-xl-6 col-12"><div class="skeleton-block" style="height: 250px;"></div></div>
            </div>
            <div class="text-center mt-4 text-muted">
                <div class="spinner-border spinner-border-sm text-primary me-2"></div>
                Lade ${escapeHtml(config.title)}...
            </div>
        </div>`;
}

function processContestData(data, config) {
    appState.members = (data.members || []).map(m => ({
        id: String(m.id),
        vorname: m.vorname || "",
        nachname: m.nachname || "",
        email: m.email || ""
    }));

    const memberById = new Map(appState.members.map(m => [String(m.id), m]));

    appState.teams = [];
    appState.pool = [];

    const assignedIds = new Set();
    const sheetData = data.contestData || [];
    const tempTeams = {};

    sheetData.forEach(row => {
        const rowId = row.id != null ? String(row.id).trim() : "";
        if (!rowId) return;

        const member = memberById.get(rowId);
        const displayName = member
            ? `${member.nachname} ${member.vorname}`.trim()
            : `ID ${rowId}`;
        const email = member ? (member.email || "") : "";
        const teamName = String(row.runde_1_team || "").trim() || "Pool";

        let zoneKey = config.zones[0].key;
        if (config.zones.length > 1) {
            const stellung = String(row.stellung || "").toLowerCase();
            zoneKey = stellung.includes("kniend") ? "kniend" : "liegend";
        }

        if (teamName !== "Pool" && teamName) {
            if (!tempTeams[teamName]) tempTeams[teamName] = { name: teamName, shooters: [] };
            tempTeams[teamName].shooters.push({ id: rowId, name: displayName, email, zone: zoneKey });
            assignedIds.add(rowId);
        }
    });

    if (Object.keys(tempTeams).length > 0) {
        appState.teams = Object.values(tempTeams).sort((a, b) =>
            a.name.localeCompare(b.name, undefined, { numeric: true })
        );
    } else {
        for (let i = 1; i <= config.defaultTeams; i++) addTeamToState(true);
    }

    appState.members.forEach(m => {
        const id = String(m.id);
        if (!assignedIds.has(id)) {
            appState.pool.push({
                id,
                name: `${m.nachname} ${m.vorname}`.trim(),
                email: m.email || "",
                zone: null
            });
        }
    });
}

function renderContestUI() {
    const config = CONTEST_CONFIG[appState.activeModule];
    const container = document.getElementById('manager-inner');
    if (!container) return;

    const poolScroll = document.querySelector('.pool-scroll-area')?.scrollTop || 0;
    const teamsScroll = document.querySelector('.teams-scroll-area')?.scrollTop || 0;

    const teamsHtml = appState.teams.map(team => renderTeamCard(team, config)).join('');

    container.innerHTML = `
      <div class="manager-split col-12">
        <!-- POOL: links, schmal -->
        <div class="pool-scroll-area">
          <div class="sidebar-stack">
            <div class="card shadow-sm border-secondary sidebar-card">
              <div class="card-header bg-secondary text-white py-2">
                <i class="fas fa-users"></i> Pool
                <input type="text" class="form-control form-control-sm mt-1"
                  placeholder="Suchen..."
                  onkeyup="filterPool(this.value)">
              </div>
              <div class="card-body dropzone bg-light pool-body"
                data-target-type="pool">
                ${appState.pool.map(renderPlayerItem).join('')}
                ${appState.pool.length === 0
                  ? '<div class="text-muted text-center small mt-3 py-3">Alle eingeteilt</div>'
                  : ''}
              </div>
              <div class="card-footer small text-muted text-center py-1">
                ${appState.pool.length} verfügbar
              </div>
            </div>
          </div>
        </div>

        <!-- TEAMS: rechts, breit -->
        <div class="teams-scroll-area">
          <div class="row g-3" id="teams-area">
            ${teamsHtml}
          </div>
        </div>
      </div>`;

    requestAnimationFrame(() => {
        const ps = document.querySelector('.pool-scroll-area');
        const ts = document.querySelector('.teams-scroll-area');
        if (ps) ps.scrollTop = poolScroll;
        if (ts) ts.scrollTop = teamsScroll;
        // Fix #6b: Pool-Suchfilter nach re-render wiederherstellen
        if (typeof restorePoolFilter === 'function') restorePoolFilter();
    });
}

function renderTeamCard(team, config) {
    const zonesHtml = config.zones.map((zone) => {
        const shooters = team.shooters.filter(s =>
            config.zones.length === 1 ? true : s.zone === zone.key
        );

        const limit = zone.limit;
        const filled = shooters.length;
        const remaining = Math.max(0, limit - filled);
        const isFull = filled >= limit;

        let zoneBg = zone.key === 'liegend'
            ? '#e3f2fd'
            : (zone.key === 'kniend' ? '#f3e5f5' : '#fff');
        if (isFull) zoneBg = '#f8f9fa';

        let contentHtml = shooters.map(s => renderPlayerItem(s)).join('');
        for (let i = 0; i < remaining; i++) {
            contentHtml += `
                <div class="card mb-1 ghost-slot">
                    <div class="card-body p-1 px-2 text-center small text-muted fst-italic">
                        <i class="fas fa-plus-circle opacity-50"></i> ${escapeHtml(zone.label)}
                    </div>
                </div>`;
        }

        const headerColor = isFull ? 'text-success' : 'text-secondary';
        const headerIcon = isFull ? '<i class="fas fa-check-circle"></i>' : '';

        return `
            <div class="team-zone p-2 mb-2 border rounded dropzone ${isFull ? 'zone-full' : ''}"
                style="background:${zoneBg}; min-height: 60px;"
                data-team="${escapeHtml(team.name)}"
                data-zone="${escapeHtml(zone.key)}"
                data-limit="${limit}"
                data-target-type="team">
                ${config.zones.length > 1 ? `
                    <div class="d-flex justify-content-between small fw-bold ${headerColor} mb-2 pe-none">
                        <span>${escapeHtml(zone.label)}</span>
                        <span>${headerIcon} ${filled}/${limit}</span>
                    </div>` : ''}
                <div>${contentHtml}</div>
            </div>`;
    }).join('');

    const totalShooters = team.shooters.length;
    const totalSlots = config.zones.reduce((sum, z) => sum + z.limit, 0);
    const teamComplete = totalShooters >= totalSlots;

    return `
        <div class="col-xl-6 col-12">
            <div class="card shadow-sm h-100 border-0 ${teamComplete ? 'border-start border-success border-4' : ''}">
                <div class="card-header d-flex justify-content-between align-items-center bg-white pt-3 pb-1 border-bottom-0">
                    <h5 class="m-0 fw-bold text-primary text-truncate">${escapeHtml(team.name)}</h5>
                    <span class="badge ${teamComplete ? 'bg-success' : 'bg-light text-dark border'}">
                        ${totalShooters}/${totalSlots}
                    </span>
                </div>
                <div class="card-body p-2">${zonesHtml}</div>
                <div class="text-end p-2 pt-0">
                    <small class="text-danger text-decoration-underline"
                           onclick="removeTeamFromState('${escapeJs(team.name)}')"
                           style="cursor:pointer; font-size: 0.75rem;">
                        Team entfernen
                    </small>
                </div>
            </div>
        </div>`;
}

function renderPlayerItem(player) {
    return `
      <div class="card mb-1 draggable-player border-0 shadow-sm"
           draggable="true"
           data-id="${escapeHtml(String(player.id))}"
           style="border-left: 3px solid var(--primary) !important; overflow:hidden;">
        <div class="drag-handle">⠿</div>
        <div class="card-body p-1 px-2 pointer-events-none" style="padding-left:26px !important;">
          <div class="player-row pointer-events-none">
            <span class="player-name small fw-bold pointer-events-none"
                  style="display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:100%;">
              ${escapeHtml(player.name)}
            </span>
          </div>
        </div>
      </div>
    `;
}

function renderMailItem(player) {
    return `
        <div class="card mb-1 border-0 shadow-sm bg-white">
            <div class="card-body p-1 px-2 d-flex justify-content-between align-items-center">
                <div class="text-truncate small" style="max-width:80%">
                    ${escapeHtml(player.name)}
                </div>
                <i class="fas fa-times text-danger"
                   style="cursor:pointer;"
                   onclick="removeFromMail('${escapeJs(String(player.id))}')"></i>
            </div>
        </div>`;
}


/* --- BOTTOM SHEET LOGIK & UI --- */
function ensureTapSheet() {
    if (document.getElementById('tap-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'tap-overlay';
    overlay.className = 'tap-overlay';
    overlay.onclick = closeTapSheet;

    const sheet = document.createElement('div');
    sheet.id = 'tap-sheet';
    sheet.className = 'tap-sheet';
    sheet.innerHTML = `
        <div class="tap-sheet-handle"></div>
        <div class="tap-sheet-header" id="tap-sheet-header"></div>
        <div class="tap-sheet-body" id="tap-sheet-body"></div>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);
}

function closeTapSheet() {
    const overlay = document.getElementById('tap-overlay');
    const sheet = document.getElementById('tap-sheet');
    if (overlay) overlay.classList.remove('visible');
    if (sheet) sheet.classList.remove('visible');
}

function handlePlayerTap(playerId, inTeam, currentTeamName) {
    ensureTapSheet();
    const config = CONTEST_CONFIG[appState.activeModule];

    let player;
    if (inTeam) {
        const team = appState.teams.find(t => t.name === currentTeamName);
        player = team ? team.shooters.find(s => String(s.id) === String(playerId)) : null;
    } else {
        player = appState.pool.find(p => String(p.id) === String(playerId));
    }
    if (!player) return;

    // Header
    const header = document.getElementById('tap-sheet-header');
    header.innerHTML = `
        <div style="font-weight:700; font-size:1rem; color:#0f172a;">${escapeHtml(player.name)}</div>
        <div style="font-size:0.8rem; color:#64748b; margin-top:2px;">${inTeam ? '👥 ' + escapeHtml(currentTeamName) : '🟡 Im Pool'}</div>
    `;

    // Body
    const body = document.getElementById('tap-sheet-body');
    let buttonsHtml = '';

    if (inTeam) {
        buttonsHtml += `
            <button class="tap-team-btn danger" onclick="tapAssignPlayer('${escapeJs(playerId)}', null, null, '${escapeJs(currentTeamName)}')">
                <i class="fas fa-arrow-left"></i>
                Zurück in Pool
            </button>
        `;
    }

    appState.teams.forEach(team => {
        config.zones.forEach(zone => {
            if (inTeam && team.name === currentTeamName && player.zone === zone.key) return;

            const shootersInZone = team.shooters.filter(s =>
                config.zones.length === 1 ? true : s.zone === zone.key
            );
            const limit = zone.limit;
            const filled = shootersInZone.length;
            const isFull = filled >= limit;

            const btnLabel = config.zones.length > 1
                ? `${team.name} - ${zone.label}`
                : team.name;
            const statusLabel = isFull ? 'Voll' : `${filled}/${limit}`;

            buttonsHtml += `
                <button class="tap-team-btn${isFull ? ' danger' : ''}" 
                        ${isFull ? 'disabled' : ''}
                        onclick="tapAssignPlayer('${escapeJs(playerId)}', '${escapeJs(team.name)}', '${escapeJs(zone.key)}', '${inTeam ? escapeJs(currentTeamName) : ''}')">
                    <i class="fas fa-shield-alt"></i>
                    ${escapeHtml(btnLabel)}
                    <span class="tap-badge">${statusLabel}</span>
                </button>
            `;
        });
    });

    body.innerHTML = buttonsHtml || '<p class="text-muted text-center">Keine Teams vorhanden</p>';

    const overlay = document.getElementById('tap-overlay');
    const sheet = document.getElementById('tap-sheet');
    requestAnimationFrame(() => {
        overlay.classList.add('visible');
        sheet.classList.add('visible');
    });
}

function tapAssignPlayer(playerId, targetTeamName, zoneKey, fromTeamName) {
    const id = String(playerId);
    let shooterObj = null;

    if (targetTeamName) {
        const targetTeam = appState.teams.find(t => t.name === targetTeamName);
        if (targetTeam) {
            const config = CONTEST_CONFIG[appState.activeModule];
            const targetZoneKey = zoneKey || config.zones[0].key;
            const limit = config.zones.find(z => z.key === targetZoneKey)?.limit || 99;
            const filled = targetTeam.shooters.filter(s => s.zone === targetZoneKey && String(s.id) !== id).length;
            if (filled >= limit) {
                alert("Dieses Team bzw. diese Zone ist bereits voll!");
                return;
            }
        }
    }

    if (fromTeamName) {
        const fromTeam = appState.teams.find(t => t.name === fromTeamName);
        if (fromTeam) {
            const idx = fromTeam.shooters.findIndex(s => String(s.id) === id);
            if (idx !== -1) {
                [shooterObj] = fromTeam.shooters.splice(idx, 1);
                if (!targetTeamName) {
                    shooterObj.zone = null;
                    appState.pool.push(shooterObj);
                }
            }
        }
    } else {
        const poolIdx = appState.pool.findIndex(p => String(p.id) === id);
        if (poolIdx !== -1) {
            [shooterObj] = appState.pool.splice(poolIdx, 1);
        }
    }

    if (targetTeamName) {
        if (!shooterObj) {
            const member = appState.members.find(m => String(m.id) === id);
            shooterObj = {
                id,
                name: member ? `${member.nachname} ${member.vorname}`.trim() : id,
                email: member ? (member.email || '') : '',
                zone: zoneKey || CONTEST_CONFIG[appState.activeModule].zones[0].key
            };
        }
        shooterObj.zone = zoneKey || shooterObj.zone || CONTEST_CONFIG[appState.activeModule].zones[0].key;

        const targetTeam = appState.teams.find(t => t.name === targetTeamName);
        if (targetTeam) targetTeam.shooters.push(shooterObj);
    }

    appState.isDirty = true;
    if (typeof window.markUnsaved === 'function') window.markUnsaved();

    closeTapSheet();
    renderContestUI();
}

