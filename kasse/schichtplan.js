/**
 * schichtplan.js - Aplano-inspirierter Schicht- & Helferplaner
 * Sportschützen Muhen
 * Bietet visuelle Schicht-Matrix, Besetzungsanzeige (X/Y) und 1-Klick-Kassenbediener-Übernahme
 */

const AplanoSchichtplan = (function () {
  let stations = [];
  let shifts = [];
  let activeDate = new Date().toISOString().split('T')[0];

  async function init() {
    await loadData();
    renderTimelineGrid();
  }

  async function loadData() {
    stations = await FestkasseDB.getAll('stations');
    shifts = await FestkasseDB.getAll('shifts');
    const savedDate = await FestkasseDB.get('settings', 'activeDate');
    if (savedDate && savedDate.value) {
      activeDate = savedDate.value;
    }
  }

  // Ermittelt eindeutige Timeslots aus den Schichten für den gewählten Tag
  function getSlotsForDate(dateStr) {
    const dayShifts = shifts.filter(s => s.date === dateStr);
    const slotsMap = new Map();

    dayShifts.forEach(s => {
      const key = `${s.startTime} - ${s.endTime}`;
      if (!slotsMap.has(key)) {
        slotsMap.set(key, {
          key,
          title: s.title || key,
          startTime: s.startTime,
          endTime: s.endTime
        });
      }
    });

    // Fallback auf Standard-Slots, falls leer
    if (slotsMap.size === 0) {
      return [
        { key: '10:00 - 14:00', title: 'Frühschicht', startTime: '10:00', endTime: '14:00' },
        { key: '14:00 - 18:00', title: 'Nachmittag', startTime: '14:00', endTime: '18:00' },
        { key: '18:00 - 23:00', title: 'Abendschicht', startTime: '18:00', endTime: '23:00' }
      ];
    }

    return Array.from(slotsMap.values()).sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // Rendert die Aplano-Timeline Matrix
  function renderTimelineGrid() {
    const container = document.getElementById('aplano-grid-container');
    if (!container) return;

    const slots = getSlotsForDate(activeDate);

    let html = `
      <table class="aplano-table">
        <thead>
          <tr>
            <th class="aplano-th-station">Bereich / Stand</th>
            ${slots.map(slot => `
              <th class="aplano-th-slot">
                <div>${escapeHtml(slot.title)}</div>
                <div style="font-size: 11px; font-weight: normal; opacity: 0.8;">${slot.startTime} – ${slot.endTime}</div>
              </th>
            `).join('')}
          </tr>
        </thead>
        <tbody>
    `;

    stations.forEach(st => {
      html += `
        <tr>
          <!-- Stations-Header Spalte -->
          <td>
            <div class="station-title-cell" style="border-left: 4px solid ${st.color || '#0ea5e9'};">
              <div class="station-icon">${st.icon || '📍'}</div>
              <div>
                <div class="station-name">${escapeHtml(st.name)}</div>
                ${st.isCashier ? '<span style="font-size: 11px; color: #10b981; font-weight: 700;">● Kassenstation</span>' : ''}
              </div>
            </div>
          </td>
      `;

      // Zellen für die Slots
      slots.forEach(slot => {
        const shift = shifts.find(s => 
          s.stationId === st.id && 
          s.date === activeDate && 
          s.startTime === slot.startTime && 
          s.endTime === slot.endTime
        );

        html += `<td>${renderShiftCard(shift, st, slot)}</td>`;
      });

      html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
  }

  // Rendert eine einzelne Schichtkarte (Aplano Card)
  function renderShiftCard(shift, station, slot) {
    if (!shift) {
      return `
        <div class="shift-card" style="opacity: 0.5; justify-content: center; align-items: center; border-style: dashed;">
          <button class="btn-assign-helper" onclick="AplanoSchichtplan.openCreateShiftModal('${station.id}', '${slot.startTime}', '${slot.endTime}', '${slot.title}')">
            <span>➕ Schicht anlegen</span>
          </button>
        </div>
      `;
    }

    const assignedCount = (shift.assignedHelpers || []).length;
    const requiredCount = shift.requiredHelpers || 1;

    let statusClass = 'shift-status-full';
    let statusText = `● ${assignedCount}/${requiredCount} Voll`;
    if (assignedCount === 0) {
      statusClass = 'shift-status-empty';
      statusText = `● 0/${requiredCount} Offen`;
    } else if (assignedCount < requiredCount) {
      statusClass = 'shift-status-partial';
      statusText = `● ${assignedCount}/${requiredCount} Teilweise`;
    }

    let helpersHtml = '';
    if (shift.assignedHelpers && shift.assignedHelpers.length > 0) {
      helpersHtml = shift.assignedHelpers.map((h, idx) => `
        <div class="helper-chip">
          <div class="helper-chip-left">
            <div class="helper-avatar-sm">${getInitials(h.name)}</div>
            <span>${escapeHtml(h.name)}</span>
          </div>
          <button class="btn-delete-helper" title="Zuteilung aufheben" onclick="AplanoSchichtplan.removeHelper('${shift.id}', ${idx})" style="background:transparent; border:none; color:#ef4444; cursor:pointer; font-size:12px;">✕</button>
        </div>
      `).join('');
    }

    return `
      <div class="shift-card" style="border-top: 3px solid ${station.color || '#0ea5e9'};">
        <div class="d-flex justify-content-between align-items-center">
          <span class="shift-status-pill ${statusClass}">${statusText}</span>
          <span style="font-size: 11px; color: var(--text-dim); font-weight: 600;">${shift.startTime}–${shift.endTime}</span>
        </div>

        <div class="shift-helpers-list">
          ${helpersHtml}
        </div>

        ${assignedCount < requiredCount ? `
          <button class="btn-assign-helper" onclick="AplanoSchichtplan.openAssignModal('${shift.id}')">
            <span>➕ Helfer zuteilen</span>
          </button>
        ` : ''}

        ${station.isCashier && shift.assignedHelpers && shift.assignedHelpers.length > 0 ? `
          <button class="btn-takeover-cashier" onclick="AplanoSchichtplan.takeoverCashier('${shift.assignedHelpers[0].name}', '${station.name}')">
            <span>👤 Als Bediener übernehmen</span>
          </button>
        ` : ''}
      </div>
    `;
  }

  // 1-Klick-Übernahme des Kassenbedieners
  async function takeoverCashier(name, stationName) {
    await FestkasseDB.put('settings', { key: 'cashierName', value: name });
    await FestkasseDB.put('settings', { key: 'stationName', value: stationName });
    
    // UI im Kassen-Header aktualisieren
    const nameEl = document.getElementById('active-cashier-name');
    const stationEl = document.getElementById('active-cashier-station');
    if (nameEl) nameEl.textContent = name;
    if (stationEl) stationEl.textContent = stationName;

    const avatarEl = document.getElementById('active-operator-avatar');
    if (avatarEl) avatarEl.textContent = getInitials(name);

    if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
      KasseModule.showToast(`Bediener gewechselt: ${name} (${stationName})`);
    }

    // Zur Kassenansicht wechseln
    if (typeof KasseModule !== 'undefined' && KasseModule.switchView) {
      KasseModule.switchView('kasse');
    }
  }

  // Helfer Zuteilungs-Modal
  function openAssignModal(shiftId) {
    const shift = shifts.find(s => s.id === shiftId);
    if (!shift) return;

    const modal = document.getElementById('aplano-assign-modal');
    document.getElementById('assign-shift-id').value = shiftId;
    document.getElementById('assign-helper-name').value = '';
    document.getElementById('assign-helper-phone').value = '';
    document.getElementById('assign-helper-role').value = '';
    
    if (modal) modal.classList.add('active');
  }

  async function saveAssignHelper() {
    const shiftId = document.getElementById('assign-shift-id').value;
    const name = document.getElementById('assign-helper-name').value.trim();
    const phone = document.getElementById('assign-helper-phone').value.trim();
    const role = document.getElementById('assign-helper-role').value.trim();

    if (!name) {
      alert('Bitte gib den Namen des Helfers ein.');
      return;
    }

    const shift = shifts.find(s => s.id === shiftId);
    if (shift) {
      if (!shift.assignedHelpers) shift.assignedHelpers = [];
      shift.assignedHelpers.push({ name, phone, role: role || 'Helfer' });
      await FestkasseDB.put('shifts', shift);
      await loadData();
      renderTimelineGrid();
      closeModal('aplano-assign-modal');
      if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
        KasseModule.showToast(`Helfer ${name} erfolgreich eingeteilt`);
      }
    }
  }

  async function removeHelper(shiftId, index) {
    const shift = shifts.find(s => s.id === shiftId);
    if (shift && shift.assignedHelpers) {
      const removed = shift.assignedHelpers.splice(index, 1);
      await FestkasseDB.put('shifts', shift);
      await loadData();
      renderTimelineGrid();
      if (typeof KasseModule !== 'undefined' && KasseModule.showToast && removed.length > 0) {
        KasseModule.showToast(`Zuteilung für ${removed[0].name} aufgehoben`);
      }
    }
  }

  // Neue Schicht Modal
  function openCreateShiftModal(stationId, startTime, endTime, title) {
    const modal = document.getElementById('aplano-create-shift-modal');
    document.getElementById('create-shift-station').value = stationId;
    document.getElementById('create-shift-title').value = title || '';
    document.getElementById('create-shift-start').value = startTime || '10:00';
    document.getElementById('create-shift-end').value = endTime || '14:00';
    document.getElementById('create-shift-count').value = '1';
    
    if (modal) modal.classList.add('active');
  }

  async function saveCreateShift() {
    const stationId = document.getElementById('create-shift-station').value;
    const title = document.getElementById('create-shift-title').value.trim() || 'Schicht';
    const startTime = document.getElementById('create-shift-start').value;
    const endTime = document.getElementById('create-shift-end').value;
    const requiredHelpers = parseInt(document.getElementById('create-shift-count').value, 10) || 1;

    const newShift = {
      id: 'sh_' + Date.now(),
      stationId,
      date: activeDate,
      startTime,
      endTime,
      title,
      requiredHelpers,
      assignedHelpers: []
    };

    await FestkasseDB.put('shifts', newShift);
    await loadData();
    renderTimelineGrid();
    closeModal('aplano-create-shift-modal');
    if (typeof KasseModule !== 'undefined' && KasseModule.showToast) {
      KasseModule.showToast(`Neue Schicht angelegt`);
    }
  }

  function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.classList.remove('active');
  }

  function getInitials(name) {
    if (!name) return '??';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  return {
    init,
    renderTimelineGrid,
    takeoverCashier,
    openAssignModal,
    saveAssignHelper,
    removeHelper,
    openCreateShiftModal,
    saveCreateShift,
    closeModal
  };
})();
