// =========================================================
//  ARCHIV: MODULE: MANAGER - TOUCH LEGACY
//  - Diese Datei dient als Archiv für die Touch-Gesten und Tap-Einteilung
//  - Kann später wiederverwendet oder in mobile Versionen integriert werden
// =========================================================

/* --- TOUCH-DRAG LOGIK --- */
function initTouchDragAndDropLegacy() {
    let dragSrcEl = null;
    let dragId = null;
    let touchClone = null;

    // Globales Touch-Tracking, um emulierte Drag-Events auf Touchscreens zu verhindern
    document.addEventListener('touchstart', () => {
        window.isTouching = true;
    }, { passive: true });
    
    document.addEventListener('touchend', () => {
        setTimeout(() => {
            window.isTouching = false;
        }, 100);
    }, { passive: true });

    document.addEventListener('touchcancel', () => {
        window.isTouching = false;
    }, { passive: true });

    function onTouchMove(e) {
        if (!dragId || !touchClone) return;
        e.preventDefault();
        const touch = e.touches[0];
        moveClone(touch.clientX, touch.clientY);
        removeDropHighlights();
        
        // WICHTIG: Klon kurz ausblenden, damit elementFromPoint das Element darunter findet
        touchClone.style.display = 'none';
        const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        touchClone.style.display = 'block';
        
        const zone = elemBelow ? elemBelow.closest('.dropzone') : null;
        if (zone) zone.classList.add('drag-over');
    }

    function moveClone(x, y) {
        if (touchClone) {
            touchClone.style.left = (x - 20) + 'px';
            touchClone.style.top  = (y - 20) + 'px';
        }
    }

    function cleanupTouch() {
        if (touchClone) touchClone.remove();
        if (dragSrcEl) dragSrcEl.style.opacity = '1';
        removeDropHighlights();
        document.querySelectorAll('.drag-clone').forEach(el => el.remove());
        document.querySelectorAll('.draggable-player').forEach(el => el.style.opacity = '1');
        dragId = null; touchClone = null; dragSrcEl = null;
        document.body.classList.remove('body-dragging');

        // Listener entfernen
        document.removeEventListener('touchmove', onTouchMove);
    }

    document.addEventListener('touchstart', (e) => {
        const handle = e.target.closest('.drag-handle');
        const el = handle ? handle.closest('.draggable-player') : null;
        if (!el) return;

        e.preventDefault();
        dragId = el.dataset.id;
        dragSrcEl = el;
        touchClone = el.cloneNode(true);
        touchClone.classList.add('drag-clone');
        document.body.appendChild(touchClone);
        const touch = e.touches[0];
        moveClone(touch.clientX, touch.clientY);
        el.style.opacity = '0.4';
        document.body.classList.add('body-dragging');
        if (navigator.vibrate) navigator.vibrate(25);

        // touchmove aktivieren
        document.addEventListener('touchmove', onTouchMove, { passive: false });
    }, { passive: false });

    document.addEventListener('touchend', (e) => {
        if (!dragId) return;
        const touch = e.changedTouches[0];
        if (touchClone) touchClone.style.display = 'none';
        const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const zone = elemBelow ? elemBelow.closest('.dropzone') : null;
        if (zone) handleDrop(dragId, zone);
        cleanupTouch();
    });

    document.addEventListener('touchcancel', (e) => {
        cleanupTouch();
    });

    // --- MOBILE TAP DETECTION (separate from drag-handle drag) ---
    let tapEl = null;
    let tapT0 = 0;
    let tapX0 = 0;
    let tapY0 = 0;
    let tapMoved = false;

    document.addEventListener('touchstart', (e) => {
        if (e.target.closest('.drag-handle')) return;
        const el = e.target.closest('.draggable-player');
        if (!el) return;
        tapEl = el;
        tapT0 = Date.now();
        tapX0 = e.touches[0].clientX;
        tapY0 = e.touches[0].clientY;
        tapMoved = false;
    }, { passive: true });

    document.addEventListener('touchmove', (e) => {
        if (!tapEl) return;
        const dx = e.touches[0].clientX - tapX0;
        const dy = e.touches[0].clientY - tapY0;
        if (Math.sqrt(dx * dx + dy * dy) > 10) tapMoved = true;
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        const el = tapEl;
        tapEl = null;
        if (!el) return;
        if (tapMoved) return;
        if (Date.now() - tapT0 > 300) return;

        const playerId = el.dataset.id;
        const teamZoneEl = el.closest('[data-target-type="team"]');
        const inTeam = !!teamZoneEl;
        const teamName = teamZoneEl ? teamZoneEl.dataset.team : '';

        handlePlayerTap(playerId, inTeam, teamName);
    }, { passive: true });
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
