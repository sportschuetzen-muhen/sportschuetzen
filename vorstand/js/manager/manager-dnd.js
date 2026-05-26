// =========================================================
//  MODULE: MANAGER - DND (DRAG & DROP)
//  - Desktop Drag & Drop, iOS-sichere Touch-Mechanik & State Modifier
// =========================================================

function initDragAndDrop() {
    let dragSrcEl = null;
    let dragId = null;
    let touchClone = null;

    // --- DESKTOP ---
    document.addEventListener('dragstart', (e) => {
        const el = e.target.closest('.draggable-player');
        if (!el) return;
        dragSrcEl = el;
        dragId = el.dataset.id;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', dragId);
        setTimeout(() => el.style.opacity = '0.4', 0);
    });

    document.addEventListener('dragend', (e) => {
        const el = e.target.closest('.draggable-player');
        if (el) el.style.opacity = '1';
        removeDropHighlights();
        dragSrcEl = null;
    });

    document.addEventListener('dragover', (e) => {
        e.preventDefault();
        const zone = e.target.closest('.dropzone');
        if (zone) zone.classList.add('drag-over');
    });

    document.addEventListener('dragleave', (e) => {
        const zone = e.target.closest('.dropzone');
        if (zone) zone.classList.remove('drag-over');
    });

    document.addEventListener('drop', (e) => {
        e.preventDefault();
        const zone = e.target.closest('.dropzone');
        if (zone && dragId) handleDrop(dragId, zone);
        removeDropHighlights();
    });

    // --- MOBILE TOUCH (iOS-safe) ---
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
        if (touchClone) touchClone.remove();
        if (dragSrcEl) dragSrcEl.style.opacity = '1';
        removeDropHighlights();
        document.querySelectorAll('.drag-clone').forEach(el => el.remove());
        document.querySelectorAll('.draggable-player').forEach(el => el.style.opacity = '1');
        dragId = null; touchClone = null; dragSrcEl = null;

        // Listener entfernen
        document.removeEventListener('touchmove', onTouchMove);
    });
}

function moveClone(x, y) {
    if (touchClone) {
        touchClone.style.left = (x - 20) + 'px';
        touchClone.style.top  = (y - 20) + 'px';
    }
}

function removeDropHighlights() {
    document.querySelectorAll('.dropzone').forEach(z => z.classList.remove('drag-over'));
}

// =========================================================
//  STATE LOGIC & UPDATERS
// =========================================================
function handleDrop(playerId, targetZone) {
    const targetType = targetZone.dataset.targetType;

    // Haptic Feedback bei Drop
    if (navigator.vibrate) navigator.vibrate(20);

    if (targetType === "mail") {
        copyToMail(playerId);
        return;
    }

    if (targetType === "pool") {
        movePlayerInState(playerId, null, null);
        renderContestUI();
        return;
    }

    if (targetType === "team") {
        const limit = parseInt(targetZone.dataset.limit, 10);
        const teamName = targetZone.dataset.team;
        const zoneKey = targetZone.dataset.zone;
        const team = appState.teams.find(t => t.name === teamName);
        if (!team) return;

        const currentCount = team.shooters.filter(s =>
            s.zone === zoneKey && String(s.id) !== String(playerId)
        ).length;
        if (currentCount >= limit) return; // Zone voll

        // Success Haptic Pattern bei erfolgreichem Zuweisen
        if (navigator.vibrate) setTimeout(() => navigator.vibrate([30, 50, 30]), 50);

        movePlayerInState(playerId, teamName, zoneKey);
        renderContestUI();
    }
}

function movePlayerInState(id, targetTeam, targetZone) {
    appState.isDirty = true;
    window.markUnsaved();
    let player = null;
    const sid = String(id);

    const poolIdx = appState.pool.findIndex(p => String(p.id) === sid);
    if (poolIdx > -1) {
        player = appState.pool.splice(poolIdx, 1)[0];
    } else {
        for (let t of appState.teams) {
            const idx = t.shooters.findIndex(s => String(s.id) === sid);
            if (idx > -1) { player = t.shooters.splice(idx, 1)[0]; break; }
        }
    }

    if (!player) return;

    if (!targetTeam) {
        player.zone = null;
        appState.pool.push(player);
    } else {
        const team = appState.teams.find(t => t.name === targetTeam);
        if (team) { player.zone = targetZone; team.shooters.push(player); }
    }
}

function copyToMail(id) {
    const sid = String(id);
    let player = appState.pool.find(p => String(p.id) === sid);
    if (!player) {
        for (let t of appState.teams) {
            player = t.shooters.find(s => String(s.id) === sid);
            if (player) break;
        }
    }
    if (player && !appState.mailList.find(m => String(m.id) === sid)) {
        appState.mailList.push({ ...player });
        renderContestUI();
    }
}

function removeFromMail(id) {
    appState.mailList = appState.mailList.filter(m => String(m.id) !== String(id));
    renderContestUI();
}

function addTeamToState(silent = false) {
    window.markUnsaved();
    const config = CONTEST_CONFIG[appState.activeModule];
    let nextNum = 1;
    const existingNums = appState.teams.map(t => {
        const match = t.name.match(/(\d+)$/);
        return match ? parseInt(match[1], 10) : 0;
    });
    while (existingNums.includes(nextNum)) nextNum++;
    appState.teams.push({ name: `${config.baseTeamName} ${nextNum}`, shooters: [] });
    if (!silent) renderContestUI();
}

function removeTeamFromState(teamName) {
    if (!confirm(`Team "${teamName}" wirklich löschen?`)) return;
    window.markUnsaved();
    const idx = appState.teams.findIndex(t => t.name === teamName);
    if (idx === -1) return;
    appState.teams[idx].shooters.forEach(s => { s.zone = null; appState.pool.push(s); });
    appState.teams.splice(idx, 1);
    renderContestUI();
}

function filterPool(val) {
    val = String(val || "").toLowerCase();
    document.querySelectorAll('.dropzone[data-target-type="pool"] .draggable-player').forEach(el => {
        el.parentElement.style.display =
            el.innerText.toLowerCase().includes(val) ? 'block' : 'none';
    });
}
