/**
 * ui-table-kit.js
 * Zentraler Standard für Tabellen und Listen im Vorstand-Portal der Sportschützen Muhen.
 *
 * Funktionen:
 * 1. TableKit.makeSortable(tableElement, options)   - Spalten-Sortierung per Header-Klick (Date, Time, Text, Inputs)
 * 2. TableKit.makeDraggable(containerElement, options) - Drag & Drop Zeilen-Verschiebung (Desktop + Touch)
 * 3. TableKit.setupFilter(options)                  - Live-Suche & Status-Filter (Pills)
 * 4. TableKit.setupCollapsible(toggleEl, contentEl, storageKey) - Einklappbare Sektionen mit LocalStorage-Memory
 */

(function () {
  'use strict';

  function ensureStyles() {
    if (document.getElementById('tablekit-standard-style')) return;
    const style = document.createElement('style');
    style.id = 'tablekit-standard-style';
    style.textContent = `
      /* TableKit: Drag & Drop */
      .tk-drag-handle {
        cursor: grab;
        color: #adb5bd;
        font-size: 1.1rem;
        padding: 2px 6px;
        user-select: none;
        touch-action: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s ease;
      }
      .tk-drag-handle:hover {
        color: #0d6efd;
      }
      .tk-drag-handle:active {
        cursor: grabbing;
      }
      .tk-dragging {
        opacity: 0.45 !important;
        background-color: #e9f2ff !important;
      }
      .tk-drag-over-top {
        border-top: 3px solid #0d6efd !important;
      }
      .tk-drag-over-bottom {
        border-bottom: 3px solid #0d6efd !important;
      }

      /* TableKit: Spalten-Sortierung */
      th.tk-sortable {
        cursor: pointer;
        user-select: none;
        position: relative;
        transition: background-color 0.15s ease;
        white-space: nowrap;
      }
      th.tk-sortable:hover {
        background-color: rgba(13, 110, 253, 0.08) !important;
      }
      .tk-sort-icon {
        display: inline-block;
        margin-left: 5px;
        font-size: 0.75rem;
        color: #adb5bd;
        transition: color 0.15s ease, transform 0.15s ease;
      }
      th.tk-sort-asc .tk-sort-icon {
        color: #0d6efd;
        transform: translateY(-1px);
      }
      th.tk-sort-desc .tk-sort-icon {
        color: #0d6efd;
        transform: translateY(1px);
      }

      /* TableKit: Filter-Pills */
      .tk-filter-pills {
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
        align-items: center;
      }
      .tk-pill-btn {
        font-size: 0.78rem;
        padding: 3px 10px;
        border-radius: 20px;
        border: 1px solid #dee2e6;
        background: #fff;
        color: #495057;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .tk-pill-btn:hover {
        background: #f8f9fa;
        border-color: #adb5bd;
      }
      .tk-pill-btn.active {
        background: #0d6efd;
        color: #fff;
        border-color: #0d6efd;
        font-weight: 600;
        box-shadow: 0 2px 4px rgba(13, 110, 253, 0.25);
      }

      /* TableKit: Collapsible Section */
      .tk-collapse-toggle {
        cursor: pointer;
        user-select: none;
      }
      .tk-collapse-icon {
        transition: transform 0.2s ease;
        display: inline-block;
      }
      .tk-collapsed .tk-collapse-icon {
        transform: rotate(-90deg);
      }
      .tk-collapse-content {
        transition: max-height 0.25s ease, opacity 0.2s ease;
      }
      .tk-collapsed .tk-collapse-content {
        display: none !important;
      }
      /* TableKit: Spalten-Sichtbarkeit / Ausblenden */
      .tk-col-hidden {
        display: none !important;
      }
      /* TableKit: Spalten-Resizing */
      th.tk-col-resizable {
        position: relative !important;
        overflow: visible !important;
        white-space: normal !important;
        vertical-align: bottom !important;
      }
      .tk-col-resizer {
        position: absolute;
        top: 0;
        bottom: 0;
        right: -5px;
        width: 10px;
        height: 100%;
        cursor: col-resize;
        user-select: none;
        z-index: 25;
        display: flex;
        align-items: center;
        justify-content: center;
        touch-action: none;
      }
      .tk-col-resizer-line {
        width: 2px;
        height: 60%;
        background-color: #cbd5e1;
        border-radius: 1px;
        pointer-events: none;
        transition: background-color 0.15s ease, height 0.15s ease, opacity 0.15s ease, width 0.15s ease;
        opacity: 0.5;
      }
      .tk-col-resizer:hover .tk-col-resizer-line,
      .tk-col-resizer.tk-is-dragging .tk-col-resizer-line {
        background-color: #0d6efd;
        height: 90%;
        opacity: 1;
        width: 3px;
      }

      /* TableKit: Spalten Drag & Drop Reordering */
      th.tk-col-reorderable {
        cursor: grab;
      }
      th.tk-col-reordering {
        opacity: 0.45 !important;
        background-color: #e9f2ff !important;
        cursor: grabbing !important;
      }
      th.tk-col-drop-target-left {
        border-left: 3px solid #0d6efd !important;
        background-color: rgba(13, 110, 253, 0.08) !important;
      }
      th.tk-col-drop-target-right {
        border-right: 3px solid #0d6efd !important;
        background-color: rgba(13, 110, 253, 0.08) !important;
      }

      /* TableKit: Flüssiges Resizing & Tabellen-Layout */
      table.tk-table-resizable {
        width: 100%;
      }
      table.tk-table-resizable th.tk-col-resizable {
        position: relative !important;
        overflow: visible !important;
      }
      table.tk-table-resizable td {
        overflow: hidden;
      }
      table.tk-table-resizable td input.form-control,
      table.tk-table-resizable td select.form-select {
        min-width: 0 !important;
      }
    `;
    document.head.appendChild(style);
  }

  // =========================================================
  // 1. SPALTEN-SORTIERUNG (TableKit.makeSortable)
  // =========================================================
  function makeSortable(tableOrTbody, options = {}) {
    ensureStyles();
    const table = tableOrTbody.tagName === 'TABLE' ? tableOrTbody : tableOrTbody.closest('table');
    if (!table) return;

    const headers = table.querySelectorAll('th[data-sort-key]');
    let currentKey = options.initialKey || null;
    let currentDir = options.initialDir || 'asc'; // 'asc' | 'desc'

    headers.forEach(th => {
      th.classList.add('tk-sortable');
      if (!th.querySelector('.tk-sort-icon')) {
        const icon = document.createElement('span');
        icon.className = 'tk-sort-icon';
        icon.innerHTML = '↕';
        th.appendChild(icon);
      }

      th.addEventListener('click', (e) => {
        // Nicht sortieren wenn Klick auf interaktives Element im Header oder Resizer oder nach Drag & Drop
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT' || e.target.closest('.tk-col-resizer') || th.dataset.justDragged === '1') return;

        const sortKey = th.dataset.sortKey;
        if (!sortKey) return;

        if (currentKey === sortKey) {
          currentDir = (currentDir === 'asc') ? 'desc' : 'asc';
        } else {
          currentKey = sortKey;
          currentDir = 'asc';
        }

        // Header Visuals aktualisieren
        headers.forEach(h => {
          h.classList.remove('tk-sort-asc', 'tk-sort-desc');
          const ic = h.querySelector('.tk-sort-icon');
          if (ic) ic.innerHTML = '↕';
        });

        th.classList.add(currentDir === 'asc' ? 'tk-sort-asc' : 'tk-sort-desc');
        const activeIcon = th.querySelector('.tk-sort-icon');
        if (activeIcon) activeIcon.innerHTML = currentDir === 'asc' ? '▲' : '▼';

        // Sortierung anwenden
        if (typeof options.onSort === 'function') {
          options.onSort(currentKey, currentDir);
        } else {
          sortDomRows(table, currentKey, currentDir, options);
        }
      });
    });
  }

  function sortDomRows(table, key, direction, options = {}) {
    const tbody = table.querySelector('tbody') || table;
    const rows = Array.from(tbody.querySelectorAll('tr[data-id]'));
    if (!rows.length) return;

    rows.sort((a, b) => {
      const valA = extractValueFromRow(a, key, options);
      const valB = extractValueFromRow(b, key, options);
      return compareValues(valA, valB, direction);
    });

    rows.forEach(r => tbody.appendChild(r));
  }

  function extractValueFromRow(row, key, options) {
    if (options.getValue) {
      const v = options.getValue(row, key);
      if (v !== undefined) return v;
    }
    const input = row.querySelector(`[data-field="${key}"]`);
    if (input) {
      if (input.tagName === 'SELECT') {
        return input.options[input.selectedIndex]?.text || input.value || '';
      }
      return input.value || '';
    }
    const cell = row.querySelector(`[data-cell="${key}"]`);
    if (cell) return cell.textContent.trim();
    return '';
  }

  function compareValues(a, b, dir) {
    const mult = dir === 'desc' ? -1 : 1;
    if (a === b) return 0;
    if (!a && a !== 0) return 1;
    if (!b && b !== 0) return -1;

    // 1. Datumstest (YYYY-MM-DD oder DD.MM.YYYY)
    const dateA = parseDateValue(a);
    const dateB = parseDateValue(b);
    if (dateA && dateB) return (dateA - dateB) * mult;

    // 2. Zeittest (HH:mm)
    if (/^\d{1,2}:\d{2}$/.test(String(a).trim()) && /^\d{1,2}:\d{2}$/.test(String(b).trim())) {
      return String(a).localeCompare(String(b)) * mult;
    }

    // 3. Numerisch
    const numA = Number(a);
    const numB = Number(b);
    if (!isNaN(numA) && !isNaN(numB) && typeof a !== 'string') {
      return (numA - numB) * mult;
    }

    // 4. Alphabetisch mit Schweizer Locale
    return String(a).localeCompare(String(b), 'de-CH', { numeric: true, sensitivity: 'base' }) * mult;
  }

  function parseDateValue(v) {
    if (!v) return null;
    if (v instanceof Date && !isNaN(v.getTime())) return v;
    const s = String(v).trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
      const d = new Date(s);
      return isNaN(d.getTime()) ? null : d;
    }
    if (/^\d{1,2}\.\d{1,2}\.\d{4}/.test(s)) {
      const parts = s.split('.');
      const d = new Date(parts[2], parts[1] - 1, parts[0]);
      return isNaN(d.getTime()) ? null : d;
    }
    return null;
  }

  // =========================================================
  // 2. ZEILEN-VERSCHIEBBARKEIT PER DRAG & DROP (TableKit.makeDraggable)
  // =========================================================
  function makeDraggable(containerElement, options = {}) {
    ensureStyles();
    if (!containerElement) return;

    let dragSrcEl = null;
    let touchDragging = false;
    let touchTargetEl = null;
    let isHandleActive = false;

    // Desktop: Tracking ob Mousedown auf dem Drag-Handle stattfand
    containerElement.addEventListener('mousedown', (e) => {
      isHandleActive = !!e.target.closest('.tk-drag-handle');
    });
    document.addEventListener('mouseup', () => {
      isHandleActive = false;
    });

    // --- DESKTOP HTML5 DRAG & DROP ---
    containerElement.addEventListener('dragstart', (e) => {
      const row = e.target.closest(options.itemSelector || 'tr[data-id], .tk-draggable-item');
      if (!row) return;

      const hasHandle = !!row.querySelector('.tk-drag-handle');
      // Nur ziehen erlauben wenn vorher mousedown auf dem Handle war (oder kein Handle existiert)
      if (hasHandle && !isHandleActive) {
        e.preventDefault();
        return;
      }

      dragSrcEl = row;
      row.classList.add('tk-dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', row.dataset.id || '');
    });

    containerElement.addEventListener('dragend', () => {
      isHandleActive = false;
      if (dragSrcEl) dragSrcEl.classList.remove('tk-dragging');
      clearDropHighlights(containerElement);
      dragSrcEl = null;
    });

    containerElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (!dragSrcEl) return;

      const targetRow = e.target.closest(options.itemSelector || 'tr[data-id], .tk-draggable-item');
      if (!targetRow || targetRow === dragSrcEl) return;

      clearDropHighlights(containerElement);
      const rect = targetRow.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (e.clientY < mid) {
        targetRow.classList.add('tk-drag-over-top');
      } else {
        targetRow.classList.add('tk-drag-over-bottom');
      }
    });

    containerElement.addEventListener('drop', (e) => {
      e.preventDefault();
      if (!dragSrcEl) return;

      const targetRow = e.target.closest(options.itemSelector || 'tr[data-id], .tk-draggable-item');
      if (!targetRow || targetRow === dragSrcEl) {
        clearDropHighlights(containerElement);
        return;
      }

      const rect = targetRow.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      const insertBefore = e.clientY < mid;

      if (insertBefore) {
        targetRow.parentNode.insertBefore(dragSrcEl, targetRow);
      } else {
        targetRow.parentNode.insertBefore(dragSrcEl, targetRow.nextSibling);
      }

      clearDropHighlights(containerElement);

      if (typeof options.onReorder === 'function') {
        const items = Array.from(containerElement.querySelectorAll(options.itemSelector || 'tr[data-id], .tk-draggable-item'));
        const ids = items.map(el => el.dataset.id).filter(Boolean);
        options.onReorder(ids, items);
      }
    });

    // --- TOUCH SUPPORT FÜR MOBIL & TABLET ---
    containerElement.addEventListener('touchstart', (e) => {
      const handle = e.target.closest('.tk-drag-handle');
      if (!handle) return;

      const row = handle.closest(options.itemSelector || 'tr[data-id], .tk-draggable-item');
      if (!row) return;

      touchDragging = true;
      touchTargetEl = row;
      row.classList.add('tk-dragging');
    }, { passive: false });

    containerElement.addEventListener('touchmove', (e) => {
      if (!touchDragging || !touchTargetEl) return;
      // Verhindert das Standard-Scrollen auf Smartphones, während die Zeile bewegt wird!
      if (e.cancelable) e.preventDefault();

      const touch = e.touches[0];
      const targetOver = document.elementFromPoint(touch.clientX, touch.clientY);
      if (!targetOver) return;

      const targetRow = targetOver.closest(options.itemSelector || 'tr[data-id], .tk-draggable-item');
      if (targetRow && targetRow !== touchTargetEl && targetRow.parentNode === touchTargetEl.parentNode) {
        const rect = targetRow.getBoundingClientRect();
        const mid = rect.top + rect.height / 2;
        if (touch.clientY < mid) {
          targetRow.parentNode.insertBefore(touchTargetEl, targetRow);
        } else {
          targetRow.parentNode.insertBefore(touchTargetEl, targetRow.nextSibling);
        }
      }
    }, { passive: false });

    containerElement.addEventListener('touchend', () => {
      if (!touchDragging) return;
      touchDragging = false;
      if (touchTargetEl) {
        touchTargetEl.classList.remove('tk-dragging');
        touchTargetEl = null;
      }
      if (typeof options.onReorder === 'function') {
        const items = Array.from(containerElement.querySelectorAll(options.itemSelector || 'tr[data-id], .tk-draggable-item'));
        const ids = items.map(el => el.dataset.id).filter(Boolean);
        options.onReorder(ids, items);
      }
    });
  }

  function clearDropHighlights(container) {
    container.querySelectorAll('.tk-drag-over-top, .tk-drag-over-bottom').forEach(el => {
      el.classList.remove('tk-drag-over-top', 'tk-drag-over-bottom');
    });
  }

  // =========================================================
  // 3. FILTERUNG & LIVE-SUCHE (TableKit.setupFilter)
  // =========================================================
  function setupFilter(options = {}) {
    ensureStyles();
    const searchInput = typeof options.searchInput === 'string' ? document.querySelector(options.searchInput) : options.searchInput;
    const pillsContainer = typeof options.pillsContainer === 'string' ? document.querySelector(options.pillsContainer) : options.pillsContainer;
    const container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
    if (!container) return;

    let activeFilter = options.initialFilter || 'all';
    let searchQuery = '';

    function applyFilter() {
      const rows = container.querySelectorAll(options.rowSelector || 'tr[data-id], .tk-draggable-item');
      let visibleCount = 0;

      rows.forEach(row => {
        const matchesStatus = checkStatusMatch(row, activeFilter, options);
        const matchesSearch = checkSearchMatch(row, searchQuery, options);
        const show = matchesStatus && matchesSearch;

        row.style.display = show ? '' : 'none';
        if (show) visibleCount++;
      });

      if (options.countBadge) {
        const badge = typeof options.countBadge === 'string' ? document.querySelector(options.countBadge) : options.countBadge;
        if (badge) badge.innerText = visibleCount;
      }

      if (typeof options.onFilterChange === 'function') {
        options.onFilterChange(visibleCount, activeFilter, searchQuery);
      }
    }

    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = (e.target.value || '').trim().toLowerCase();
        applyFilter();
      });
    }

    if (pillsContainer) {
      pillsContainer.addEventListener('click', (e) => {
        const btn = e.target.closest('.tk-pill-btn');
        if (!btn) return;
        pillsContainer.querySelectorAll('.tk-pill-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeFilter = btn.dataset.filter || 'all';
        applyFilter();
      });
    }

    return {
      apply: applyFilter,
      setFilter: (f) => { activeFilter = f; applyFilter(); },
      setSearch: (q) => { searchQuery = q; if (searchInput) searchInput.value = q; applyFilter(); }
    };
  }

  function checkStatusMatch(row, filter, options) {
    if (filter === 'all') return true;
    let status = '';
    if (options.getStatus) {
      status = options.getStatus(row);
    } else {
      const select = row.querySelector('[data-field="status"]');
      status = select ? select.value : (row.dataset.status || '');
    }
    status = String(status || '').toLowerCase();

    if (filter === 'active-only') return status !== 'abgesagt';
    if (filter === 'fix') return status === 'fix';
    if (filter === 'provisorisch') return status === 'provisorisch';
    if (filter === 'abgesagt') return status === 'abgesagt';
    return true;
  }

  function checkSearchMatch(row, query, options) {
    if (!query) return true;
    if (options.getSearchText) {
      return options.getSearchText(row).toLowerCase().includes(query);
    }
    const text = row.innerText.toLowerCase();
    const inputsText = Array.from(row.querySelectorAll('input, select'))
      .map(i => i.value)
      .join(' ')
      .toLowerCase();
    return (text + ' ' + inputsText).includes(query);
  }

  // =========================================================
  // 4. EINKLAPPBARE SEKTIONEN (TableKit.setupCollapsible)
  // =========================================================
  function setupCollapsible(toggleEl, contentEl, storageKey = null) {
    ensureStyles();
    if (!toggleEl || !contentEl) return;

    toggleEl.classList.add('tk-collapse-toggle');

    let icon = toggleEl.querySelector('.tk-collapse-icon');
    if (!icon) {
      icon = document.createElement('span');
      icon.className = 'tk-collapse-icon me-2';
      icon.innerHTML = '▼';
      toggleEl.insertBefore(icon, toggleEl.firstChild);
    }

    // Gespeicherten Zustand laden falls vorhanden
    if (storageKey) {
      const saved = localStorage.getItem('tk_collapse_' + storageKey);
      if (saved === 'collapsed') {
        toggleEl.parentElement.classList.add('tk-collapsed');
        contentEl.classList.add('tk-collapse-content');
      }
    }

    toggleEl.addEventListener('click', () => {
      const parent = toggleEl.parentElement;
      const isCollapsed = parent.classList.toggle('tk-collapsed');
      if (storageKey) {
        localStorage.setItem('tk_collapse_' + storageKey, isCollapsed ? 'collapsed' : 'expanded');
      }
    });
  }

  // =========================================================
  // 5. SPALTEN EIN- & AUSBLENDEN (TableKit.setupColumnToggle)
  // =========================================================
  function setupColumnToggle(tableOrSelector, options = {}) {
    ensureStyles();
    const table = typeof tableOrSelector === 'string' ? document.querySelector(tableOrSelector) : tableOrSelector;
    if (!table) return;

    const container = typeof options.container === 'string' ? document.querySelector(options.container) : options.container;
    const storageKey = options.storageKey || (table.id ? `tk_cols_${table.id}` : null);

    // Spalten ermitteln: Entweder aus options.columns oder dynamisch aus <th> mit data-col-id
    let cols = options.columns || [];
    if (!cols.length) {
      const ths = table.querySelectorAll('thead th[data-col-id]');
      ths.forEach(th => {
        if (th.dataset.colToggle === 'false') return;
        cols.push({
          id: th.dataset.colId,
          name: th.dataset.colName || th.innerText.replace(/[↕▲▼]/g, '').trim(),
          category: th.dataset.colCat || '',
          categoryName: th.dataset.colCatName || '',
          categoryColor: th.dataset.colCatColor || '',
          defaultVisible: th.dataset.colDefault !== 'hidden'
        });
      });
    }

    if (!cols.length) return;

    // Gespeicherte Sichtbarkeit laden
    let savedState = {};
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) savedState = JSON.parse(raw);
      } catch (_) {}
    }

    // Aktuellen Zustand initialisieren
    const colState = {};
    cols.forEach(c => {
      if (savedState && typeof savedState[c.id] === 'boolean') {
        colState[c.id] = savedState[c.id];
      } else {
        colState[c.id] = c.defaultVisible !== false;
      }
    });

    function applyColumnVisibility() {
      cols.forEach(c => {
        const isVisible = colState[c.id];
        const cells = table.querySelectorAll(`.tk-col-${c.id}, [data-col-id="${c.id}"]`);
        cells.forEach(el => {
          if (isVisible) {
            el.classList.remove('tk-col-hidden');
          } else {
            el.classList.add('tk-col-hidden');
          }
        });
      });

      if (container) {
        const visibleCount = cols.filter(c => colState[c.id]).length;
        const countBadge = container.querySelector('.tk-col-count');
        if (countBadge) countBadge.textContent = `${visibleCount}/${cols.length}`;

        cols.forEach(c => {
          const chk = container.querySelector(`input[data-col-toggle="${c.id}"]`);
          if (chk) chk.checked = colState[c.id];
        });
      }

      if (storageKey) {
        try {
          localStorage.setItem(storageKey, JSON.stringify(colState));
        } catch (_) {}
      }

      if (typeof options.onChange === 'function') {
        options.onChange(colState);
      }
    }

    if (container) {
      let lastCat = null;
      const listItemsHtml = cols.map(c => {
        let catHeader = '';
        if (c.category && c.category !== lastCat) {
          lastCat = c.category;
          catHeader = `
            <div class="fw-bold small text-uppercase px-2 pt-2 pb-1 border-top mt-1" style="font-size: 0.7rem; color: ${c.categoryColor || '#475569'}; background: rgba(0,0,0,0.02); border-radius: 4px;">
              ${c.categoryName || c.category}
            </div>
          `;
        }
        return `
          ${catHeader}
          <label class="dropdown-item d-flex align-items-center justify-content-between py-1 px-2 rounded cursor-pointer mb-0">
            <span>${c.name}</span>
            <input class="form-check-input ms-2 tk-col-checkbox" type="checkbox" data-col-toggle="${c.id}" ${colState[c.id] ? 'checked' : ''}>
          </label>
        `;
      }).join('');

      container.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center gap-1 shadow-xs" type="button" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" title="Spalten ein- oder ausblenden">
            <i class="fas fa-columns text-primary"></i>
            <span>Spalten</span>
            <span class="badge bg-secondary ms-1 tk-col-count" style="font-size: 0.72rem;">${cols.length}/${cols.length}</span>
          </button>
          <div class="dropdown-menu dropdown-menu-end shadow p-2" style="min-width: 260px; font-size: 0.85rem; z-index: 1060;">
            <div class="d-flex justify-content-between align-items-center mb-2 px-1 border-bottom pb-1">
              <span class="fw-bold small text-muted text-uppercase" style="font-size: 0.72rem;">Spalten</span>
              <div class="d-flex gap-2">
                <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-primary small tk-col-show-all" style="font-size: 0.75rem;">Alle an</button>
                <span class="text-muted small">|</span>
                <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-secondary small tk-col-hide-all" style="font-size: 0.75rem;">Alle aus</button>
              </div>
            </div>
            <div class="tk-col-dropdown-list d-flex flex-column gap-1" style="max-height: 420px; overflow-y: auto;">
              ${listItemsHtml}
            </div>
            <div class="border-top pt-1 mt-2 text-center">
              <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-danger small tk-col-reset-all" style="font-size: 0.72rem;" title="Spaltenansicht und Breiten auf Standard zurücksetzen">
                <i class="fas fa-undo me-1"></i>Standard wiederherstellen
              </button>
            </div>
          </div>
        </div>
      `;

      container.querySelectorAll('.tk-col-checkbox').forEach(chk => {
        chk.addEventListener('change', (e) => {
          const colId = e.target.dataset.colToggle;
          colState[colId] = e.target.checked;
          applyColumnVisibility();
        });
      });

      const showAllBtn = container.querySelector('.tk-col-show-all');
      if (showAllBtn) {
        showAllBtn.addEventListener('click', (e) => {
          e.preventDefault();
          cols.forEach(c => { colState[c.id] = true; });
          applyColumnVisibility();
        });
      }

      const hideAllBtn = container.querySelector('.tk-col-hide-all');
      if (hideAllBtn) {
        hideAllBtn.addEventListener('click', (e) => {
          e.preventDefault();
          cols.forEach(c => { colState[c.id] = false; });
          applyColumnVisibility();
        });
      }

      const resetAllBtn = container.querySelector('.tk-col-reset-all');
      if (resetAllBtn) {
        resetAllBtn.addEventListener('click', (e) => {
          e.preventDefault();
          if (storageKey) {
            try { localStorage.removeItem(storageKey); } catch (_) {}
          }
          cols.forEach(c => { colState[c.id] = true; });
          applyColumnVisibility();
          if (typeof options.onResetAll === 'function') {
            options.onResetAll();
          }
        });
      }
    }

    applyColumnVisibility();

    return {
      apply: applyColumnVisibility,
      toggle: (colId, visible) => {
        if (colId in colState) {
          colState[colId] = (typeof visible === 'boolean') ? visible : !colState[colId];
          applyColumnVisibility();
        }
      },
      showAll: () => {
        cols.forEach(c => { colState[c.id] = true; });
        applyColumnVisibility();
      },
      getState: () => ({ ...colState })
    };
  }

  // =========================================================
  // 6. SPALTENBREITEN ANPASSEN (TableKit.makeResizable)
  // =========================================================
  function makeResizable(tableOrSelector, options = {}) {
    ensureStyles();
    const table = typeof tableOrSelector === 'string' ? document.querySelector(tableOrSelector) : tableOrSelector;
    if (!table) return;

    const storageKey = options.storageKey || (table.id ? `tk_col_widths_${table.id}` : null);
    const minColWidth = options.minWidth || 45;
    const columnsConfig = options.columns || {};

    // 1. Gespeicherte Breiten laden
    let savedWidths = {};
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) savedWidths = JSON.parse(raw);
      } catch (_) {}
    }

    const ths = Array.from(table.querySelectorAll('thead th'));
    if (!ths.length) return;

    function saveAllWidths() {
      if (!storageKey) return;
      try {
        const toSave = {};
        ths.forEach((th, idx) => {
          const colId = th.dataset.colId || th.dataset.col || th.getAttribute('data-col') || `col_${idx}`;
          if (th.style.width && th.style.width !== 'auto') {
            const val = parseInt(th.style.width, 10);
            if (!isNaN(val) && val > 20) {
              toSave[colId] = val;
            }
          }
        });
        localStorage.setItem(storageKey, JSON.stringify(toSave));
      } catch (err) {
        console.warn('Fehler beim Speichern der Spaltenbreiten:', err);
      }
    }

    ths.forEach((th, idx) => {
      const colId = th.dataset.colId || th.dataset.col || th.getAttribute('data-col') || `col_${idx}`;
      const colConf = columnsConfig[colId] || {};

      // Gespeicherte Breite anwenden
      if (savedWidths[colId]) {
        const sw = savedWidths[colId];
        th.style.width = sw + 'px';
        th.style.minWidth = sw + 'px';
      } else if (colConf.defaultWidth) {
        th.style.width = colConf.defaultWidth + 'px';
        th.style.minWidth = colConf.defaultWidth + 'px';
      }

      if (colConf.resizable === false) return;

      th.classList.add('tk-col-resizable');

      // Resizer-Element nicht mehrfach einhängen
      let resizer = th.querySelector('.tk-col-resizer');
      if (!resizer) {
        resizer = document.createElement('div');
        resizer.className = 'tk-col-resizer';
        resizer.title = 'Spaltenbreite anpassen (Ziehen zum Ändern, Doppelklick zum Zurücksetzen)';

        const line = document.createElement('div');
        line.className = 'tk-col-resizer-line';
        resizer.appendChild(line);

        // Klicks abfangen (damit Sortierung nicht versehentlich triggert)
        resizer.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
        });

        // Doppelklick zum Zurücksetzen
        resizer.addEventListener('dblclick', (e) => {
          e.stopPropagation();
          e.preventDefault();
          if (colConf.defaultWidth) {
            th.style.width = colConf.defaultWidth + 'px';
            th.style.minWidth = colConf.defaultWidth + 'px';
          } else {
            th.style.width = '';
            th.style.minWidth = '';
          }
          if (storageKey) {
            try {
              const raw = localStorage.getItem(storageKey);
              if (raw) {
                const map = JSON.parse(raw);
                delete map[colId];
                localStorage.setItem(storageKey, JSON.stringify(map));
              }
            } catch (_) {}
          }
          if (typeof options.onResize === 'function') {
            options.onResize(colId, null);
          }
        });

        // Dragging per Pointer Events (Maus + Touch vereint)
        const onPointerDown = (e) => {
          e.stopPropagation();
          e.preventDefault();

          const startX = e.pageX || (e.touches && e.touches[0] ? e.touches[0].pageX : 0);
          const startWidth = th.getBoundingClientRect().width;
          const currentMinWidth = colConf.minWidth || minColWidth;

          resizer.classList.add('tk-is-dragging');
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';

          const onPointerMove = (ev) => {
            const currentX = ev.pageX || (ev.touches && ev.touches[0] ? ev.touches[0].pageX : 0);
            const diff = currentX - startX;
            const newWidth = Math.max(currentMinWidth, Math.round(startWidth + diff));
            th.style.width = newWidth + 'px';
            th.style.minWidth = newWidth + 'px';
          };

          const onPointerUp = () => {
            resizer.classList.remove('tk-is-dragging');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            window.removeEventListener('pointermove', onPointerMove);
            window.removeEventListener('pointerup', onPointerUp);
            window.removeEventListener('touchmove', onPointerMove);
            window.removeEventListener('touchend', onPointerUp);

            saveAllWidths();

            if (typeof options.onResize === 'function') {
              const finalWidth = parseInt(th.style.width, 10);
              options.onResize(colId, finalWidth);
            }
          };

          window.addEventListener('pointermove', onPointerMove);
          window.addEventListener('pointerup', onPointerUp);
          window.addEventListener('touchmove', onPointerMove, { passive: false });
          window.addEventListener('touchend', onPointerUp);
        };

        resizer.addEventListener('pointerdown', onPointerDown);
        resizer.addEventListener('touchstart', onPointerDown, { passive: false });

        th.appendChild(resizer);
      }
    });

    return {
      apply: () => {
        if (storageKey) {
          try {
            const raw = localStorage.getItem(storageKey);
            if (raw) {
              const map = JSON.parse(raw);
              ths.forEach((th, idx) => {
                const colId = th.dataset.colId || th.dataset.col || th.getAttribute('data-col') || `col_${idx}`;
                if (map[colId]) {
                  th.style.width = map[colId] + 'px';
                  th.style.minWidth = map[colId] + 'px';
                }
              });
            }
          } catch (_) {}
        }
      },
      reset: () => {
        if (storageKey) {
          try { localStorage.removeItem(storageKey); } catch (_) {}
        }
        ths.forEach((th, idx) => {
          const colId = th.dataset.colId || th.dataset.col || th.getAttribute('data-col') || `col_${idx}`;
          const colConf = columnsConfig[colId] || {};
          if (colConf.defaultWidth) {
            th.style.width = colConf.defaultWidth + 'px';
            th.style.minWidth = colConf.defaultWidth + 'px';
          } else {
            th.style.width = '';
            th.style.minWidth = '';
          }
        });
      },
      setWidth: (colId, width) => {
        const targetTh = ths.find((th, idx) => {
          const id = th.dataset.colId || th.dataset.col || th.getAttribute('data-col') || `col_${idx}`;
          return id === colId;
        });
        if (targetTh) {
          targetTh.style.width = width + 'px';
          targetTh.style.minWidth = width + 'px';
          saveAllWidths();
        }
      }
    };
  }

  // =========================================================
  // 7. SPALTEN-REIHENFOLGE PER DRAG & DROP (TableKit.makeColumnReorderable)
  // =========================================================
  function makeColumnReorderable(tableOrSelector, options = {}) {
    ensureStyles();
    const table = typeof tableOrSelector === 'string' ? document.querySelector(tableOrSelector) : tableOrSelector;
    if (!table) return;

    const storageKey = options.storageKey || (table.id ? `tk_col_order_${table.id}` : null);
    const lockedCols = new Set(options.lockedColumns || []);

    const thead = table.querySelector('thead');
    if (!thead) return;
    const headerRow = thead.querySelector('tr');
    if (!headerRow) return;

    // Gespeicherte Reihenfolge vorab anwenden falls vorhanden
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const savedOrder = JSON.parse(raw);
          if (Array.isArray(savedOrder) && savedOrder.length > 0) {
            applyColumnOrder(table, savedOrder);
          }
        }
      } catch (err) {
        console.warn('Fehler beim Laden der Spaltenreihenfolge:', err);
      }
    }

    const ths = Array.from(headerRow.querySelectorAll('th[data-col-id]'));
    if (!ths.length) return;

    let draggedTh = null;
    let draggedColId = null;

    ths.forEach(th => {
      const colId = th.dataset.colId;
      if (lockedCols.has(colId)) return;

      th.classList.add('tk-col-reorderable');
      th.setAttribute('draggable', 'true');

      th.addEventListener('dragstart', (e) => {
        if (e.target.closest('.tk-col-resizer') || e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') {
          e.preventDefault();
          return;
        }

        draggedTh = th;
        draggedColId = colId;
        th.classList.add('tk-col-reordering');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', colId);
      });

      th.addEventListener('dragend', () => {
        th.classList.remove('tk-col-reordering');
        clearDropHighlights();
        th.dataset.justDragged = '1';
        setTimeout(() => {
          delete th.dataset.justDragged;
          draggedTh = null;
          draggedColId = null;
        }, 120);
      });

      th.addEventListener('dragover', (e) => {
        if (!draggedTh || draggedTh === th) return;
        if (lockedCols.has(th.dataset.colId)) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';

        clearDropHighlights();
        const rect = th.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        if (e.clientX < mid) {
          th.classList.add('tk-col-drop-target-left');
        } else {
          th.classList.add('tk-col-drop-target-right');
        }
      });

      th.addEventListener('dragleave', () => {
        th.classList.remove('tk-col-drop-target-left', 'tk-col-drop-target-right');
      });

      th.addEventListener('drop', (e) => {
        if (!draggedTh || draggedTh === th) return;
        if (lockedCols.has(th.dataset.colId)) return;
        e.preventDefault();

        const rect = th.getBoundingClientRect();
        const mid = rect.left + rect.width / 2;
        const insertBefore = e.clientX < mid;

        clearDropHighlights();

        const targetNextTh = insertBefore ? th : th.nextElementSibling;
        const targetNextColId = targetNextTh ? targetNextTh.dataset.colId : null;

        // 1. Header verschieben
        headerRow.insertBefore(draggedTh, targetNextTh);

        // 2. Zeilenzellen verschieben (unterstützt data-col-id="..." und tk-col-...)
        const rows = table.querySelectorAll('tbody tr');
        rows.forEach(tr => {
          const cellFrom = tr.querySelector(`td[data-col-id="${draggedColId}"], td.tk-col-${draggedColId}`);
          const cellTo = targetNextColId ? tr.querySelector(`td[data-col-id="${targetNextColId}"], td.tk-col-${targetNextColId}`) : null;
          if (cellFrom) {
            tr.insertBefore(cellFrom, cellTo);
          }
        });

        // 3. Neue Reihenfolge speichern
        const currentOrder = Array.from(headerRow.querySelectorAll('th[data-col-id]'))
          .map(h => h.dataset.colId)
          .filter(Boolean);

        if (storageKey) {
          try {
            localStorage.setItem(storageKey, JSON.stringify(currentOrder));
          } catch (_) {}
        }

        if (typeof options.onReorder === 'function') {
          options.onReorder(currentOrder);
        }
      });
    });

    function clearDropHighlights() {
      headerRow.querySelectorAll('.tk-col-drop-target-left, .tk-col-drop-target-right').forEach(el => {
        el.classList.remove('tk-col-drop-target-left', 'tk-col-drop-target-right');
      });
    }

    return {
      getOrder: () => Array.from(headerRow.querySelectorAll('th[data-col-id]')).map(h => h.dataset.colId),
      apply: (customOrder) => applyColumnOrder(table, customOrder || (storageKey ? JSON.parse(localStorage.getItem(storageKey) || 'null') : null)),
      reset: () => {
        if (storageKey) {
          try { localStorage.removeItem(storageKey); } catch (_) {}
        }
      }
    };
  }

  function applyColumnOrder(tableOrSelector, order) {
    const table = typeof tableOrSelector === 'string' ? document.querySelector(tableOrSelector) : tableOrSelector;
    if (!table || !Array.isArray(order) || !order.length) return;

    const thead = table.querySelector('thead');
    if (!thead) return;
    const headerRow = thead.querySelector('tr');
    if (!headerRow) return;

    const rows = Array.from(table.querySelectorAll('tbody tr'));

    // 1. Feste Anfangsspalten (wie Checkbox, Index, Zeilen-Drag) an den Anfang setzen falls vorhanden
    const pinStartCols = ['col_check', 'check', 'col_idx', 'idx', 'col_drag', 'drag'];
    pinStartCols.forEach(colId => {
      const th = headerRow.querySelector(`th[data-col-id="${colId}"]`);
      if (th) headerRow.insertBefore(th, headerRow.firstChild);
      rows.forEach(tr => {
        const td = tr.querySelector(`td[data-col-id="${colId}"], td.tk-col-${colId}`);
        if (td) tr.insertBefore(td, tr.firstChild);
      });
    });

    // 2. Geordnete dynamische Spalten positionieren
    order.forEach(colId => {
      if (pinStartCols.includes(colId)) return;
      const th = headerRow.querySelector(`th[data-col-id="${colId}"]`);
      if (th) {
        headerRow.appendChild(th);
      }
      rows.forEach(tr => {
        const td = tr.querySelector(`td[data-col-id="${colId}"], td.tk-col-${colId}`);
        if (td) {
          tr.appendChild(td);
        }
      });
    });

    // 3. Feste Endspalten (wie Aktionen) sicherstellen
    const pinEndCols = ['col_aktionen', 'col_action', 'col_actions', 'aktionen', 'action', 'actions'];
    pinEndCols.forEach(colId => {
      const th = headerRow.querySelector(`th[data-col-id="${colId}"]`);
      if (th) headerRow.appendChild(th);
      rows.forEach(tr => {
        const td = tr.querySelector(`td[data-col-id="${colId}"], td.tk-col-${colId}`);
        if (td) tr.appendChild(td);
      });
    });
  }

  // ===========================================================================
  // 7b. ALL-IN-ONE TABELLEN-INITIALISIERER (TableKit.initTable & TableKit.syncTable)
  // ===========================================================================
  function initTable(tableOrSelector, options = {}) {
    ensureStyles();
    const table = typeof tableOrSelector === 'string' ? document.querySelector(tableOrSelector) : tableOrSelector;
    if (!table) return null;

    // Vorherigen Controller/Observer sauber abkoppeln falls vorhanden
    if (table._tkController && typeof table._tkController.destroy === 'function') {
      table._tkController.destroy();
    }

    const baseId = options.id || table.id || 'table';
    const storageKeyPrefix = options.storagePrefix || 'tk_';
    const keyWidths = options.storageKeyWidths || `${storageKeyPrefix}widths_${baseId}`;
    const keyOrder = options.storageKeyOrder || `${storageKeyPrefix}order_${baseId}`;
    const keyCols = options.storageKeyCols || `${storageKeyPrefix}cols_${baseId}`;

    let resizerInstance = null;
    let reorderInstance = null;
    let toggleInstance = null;

    table.classList.add('tk-table-enhanced');

    // 1. Spaltenreihenfolge per Drag & Drop
    if (options.reorderable !== false) {
      const reorderOpts = typeof options.reorderable === 'object' ? options.reorderable : {};
      reorderInstance = makeColumnReorderable(table, {
        storageKey: keyOrder,
        lockedColumns: options.lockedColumns || ['check', 'actions', 'col_check', 'col_actions'],
        ...reorderOpts
      });
    }

    // 2. Spaltenbreiten ziehen (Resize)
    if (options.resizable !== false) {
      const resizeOpts = typeof options.resizable === 'object' ? options.resizable : {};
      table.classList.add('tk-table-resizable');
      resizerInstance = makeResizable(table, {
        storageKey: keyWidths,
        minWidth: options.minWidth || 45,
        columns: options.columns || (resizeOpts.columns || {}),
        ...resizeOpts
      });
    }

    // 3. Spalten Toggle (Ein- / Ausblenden)
    if (options.columnToggle) {
      const toggleContainer = (typeof options.columnToggle === 'string' || options.columnToggle instanceof Element)
        ? options.columnToggle
        : options.columnToggle.container;
      const toggleOpts = typeof options.columnToggle === 'object' ? options.columnToggle : {};
      toggleInstance = setupColumnToggle(table, {
        container: toggleContainer,
        storageKey: keyCols,
        ...toggleOpts,
        onResetAll: () => {
          if (resizerInstance && typeof resizerInstance.reset === 'function') resizerInstance.reset();
          if (reorderInstance && typeof reorderInstance.reset === 'function') reorderInstance.reset();
          try {
            localStorage.removeItem(keyWidths);
            localStorage.removeItem(keyOrder);
            localStorage.removeItem(keyCols);
          } catch (_) {}
          if (typeof options.onReset === 'function') options.onReset();
          sync();
        }
      });
    }

    // 4. Sortable
    if (options.sortable) {
      const sortOpts = typeof options.sortable === 'object' ? options.sortable : {};
      makeSortable(table, sortOpts);
    }

    function sync() {
      if (reorderInstance && typeof reorderInstance.apply === 'function') {
        reorderInstance.apply();
      }
      if (resizerInstance && typeof resizerInstance.apply === 'function') {
        resizerInstance.apply();
      }
      if (toggleInstance && typeof toggleInstance.apply === 'function') {
        toggleInstance.apply();
      }
    }

    // Automatische Re-Synchronisation bei tbody-Mutations
    let observer = null;
    if (options.autoSync !== false) {
      const tbody = table.querySelector('tbody');
      if (tbody && window.MutationObserver) {
        observer = new MutationObserver((mutations) => {
          let hasChild = false;
          for (const m of mutations) {
            if (m.type === 'childList') { hasChild = true; break; }
          }
          if (hasChild) {
            if (table._tkSyncTimeout) clearTimeout(table._tkSyncTimeout);
            table._tkSyncTimeout = setTimeout(sync, 15);
          }
        });
        observer.observe(tbody, { childList: true });
      }
    }

    const controller = {
      table,
      id: baseId,
      resizer: resizerInstance,
      reorder: reorderInstance,
      toggle: toggleInstance,
      sync,
      reset: () => {
        if (resizerInstance && typeof resizerInstance.reset === 'function') resizerInstance.reset();
        if (reorderInstance && typeof reorderInstance.reset === 'function') reorderInstance.reset();
        try {
          localStorage.removeItem(keyWidths);
          localStorage.removeItem(keyOrder);
          localStorage.removeItem(keyCols);
        } catch (_) {}
        sync();
      },
      destroy: () => {
        if (observer) observer.disconnect();
      }
    };

    table._tkController = controller;
    return controller;
  }

  function syncTable(tableOrSelector) {
    const table = typeof tableOrSelector === 'string' ? document.querySelector(tableOrSelector) : tableOrSelector;
    if (!table) return;
    if (table._tkController && typeof table._tkController.sync === 'function') {
      table._tkController.sync();
    } else {
      applyColumnOrder(table, null);
    }
  }

  // Bereinigt Kontonummer und Bezeichnung von rohen IBAN-Blöcken (z.B. CH06 8080...)
  function cleanKontoDisplay(konto, bezeichnung = '') {
    const cleanKonto = String(konto || '').trim();
    const cleanBezeichnung = String(bezeichnung || '')
      .replace(/\s*\bCH\d{2}[\s0-9A-Z]{12,}\b/gi, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return {
      konto: cleanKonto,
      bezeichnung: cleanBezeichnung,
      display: cleanBezeichnung ? `${cleanKonto} | ${cleanBezeichnung}` : cleanKonto
    };
  }

  // ===========================================================================
  // 8. MODAL DRAG & RESIZE STANDARD (UIModalKit)
  // ===========================================================================
  function makeModalMovableAndResizable(modalEl, options = {}) {
    if (typeof modalEl === 'string') modalEl = document.querySelector(modalEl);
    if (!modalEl) return;
    if (modalEl.id === 'ui-confirm-modal' || modalEl.dataset.noMovable === 'true') return;
    const dialog = modalEl.querySelector('.modal-dialog');
    const content = modalEl.querySelector('.modal-content');
    const header = modalEl.querySelector('.modal-header');

    if (!dialog || !content || !header) return;
    if (dialog._uiModalKitInitialized) return;
    dialog._uiModalKitInitialized = true;
    modalEl._uiModalKitInitialized = true;

    const modalBody = modalEl.querySelector('.modal-body');
    let maxBtn = modalEl.querySelector('.rn-modal-maximize-btn, .modal-maximize-btn');
    let resizer = modalEl.querySelector('.rn-modal-resizer, .modal-resizer');

    // Auto-inject Maximize-Button vor Close-Button falls nicht vorhanden
    if (!maxBtn) {
      const closeBtn = header.querySelector('.btn-close');
      if (closeBtn) {
        maxBtn = document.createElement('button');
        maxBtn.type = 'button';
        const isHeaderDarkBg = header.classList.contains('text-white') || 
                               header.classList.contains('bg-primary') || 
                               header.classList.contains('bg-dark') ||
                               header.classList.contains('bg-danger') ||
                               header.classList.contains('bg-success') ||
                               header.classList.contains('bg-secondary') ||
                               header.classList.contains('bg-info');
        maxBtn.className = `btn btn-sm btn-link ${isHeaderDarkBg ? 'text-white' : 'text-secondary'} p-0 rn-modal-maximize-btn me-2`;
        maxBtn.title = 'Maximieren / Wiederherstellen';
        maxBtn.style.textDecoration = 'none';
        maxBtn.style.fontSize = '0.95rem';
        maxBtn.innerHTML = '<i class="fas fa-expand"></i>';
        closeBtn.parentNode.insertBefore(maxBtn, closeBtn);
      }
    }

    // Auto-inject Resizer Grip falls nicht vorhanden
    if (!resizer) {
      resizer = document.createElement('div');
      resizer.className = 'rn-modal-resizer';
      resizer.title = 'Grösse durch Ziehen verändern';
      resizer.style.cssText = 'position: absolute; right: 2px; bottom: 2px; width: 18px; height: 18px; cursor: nwse-resize; z-index: 1060; display: flex; align-items: flex-end; justify-content: flex-end; padding: 2px; color: #94a3b8; user-select: none;';
      resizer.innerHTML = '<svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" style="opacity: 0.5;"><line x1="8" y1="2" x2="2" y2="8"></line><line x1="8" y1="5" x2="5" y2="8"></line><line x1="8" y1="8" x2="8" y2="8"></line></svg>';
      content.style.position = 'relative';
      content.appendChild(resizer);
    }

    header.style.cursor = 'grab';
    header.style.userSelect = 'none';

    if (modalBody) {
      modalBody.style.overflowY = 'auto';
      modalBody.style.maxHeight = 'calc(85vh - 65px)';
    }

    let isDragging = false;
    let isResizing = false;
    let isMaximized = false;
    let savedState = null;
    let startX, startY, initialLeft, initialTop, initialWidth, initialHeight;

    function ensureFixedPosition() {
      const rect = dialog.getBoundingClientRect();
      if (dialog.classList.contains('modal-dialog-centered') || dialog.style.position !== 'fixed') {
        dialog.classList.remove('modal-dialog-centered');
        dialog.style.position = 'fixed';
        dialog.style.margin = '0';
        dialog.style.left = Math.round(rect.left) + 'px';
        dialog.style.top = Math.max(10, Math.round(rect.top)) + 'px';
        dialog.style.width = Math.round(rect.width) + 'px';
        dialog.style.maxWidth = 'none';
        dialog.style.zIndex = '1060';
      }
      return rect;
    }

    // Header Drag (Verschieben bei jeglicher Grösse)
    header.addEventListener('pointerdown', function(e) {
      if (e.target.closest('button') || e.target.closest('input') || e.target.closest('a') || e.target.closest('select')) {
        return;
      }
      if (isMaximized) return;

      e.preventDefault();
      ensureFixedPosition();

      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      initialLeft = parseFloat(dialog.style.left) || dialog.getBoundingClientRect().left;
      initialTop = parseFloat(dialog.style.top) || dialog.getBoundingClientRect().top;

      header.style.cursor = 'grabbing';
      document.body.style.userSelect = 'none';

      function onPointerMove(ev) {
        if (!isDragging) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;

        const rect = dialog.getBoundingClientRect();
        let nextLeft = initialLeft + dx;
        let nextTop = initialTop + dy;

        nextLeft = Math.max(-rect.width + 120, Math.min(window.innerWidth - 120, nextLeft));
        nextTop = Math.max(0, Math.min(window.innerHeight - 60, nextTop));

        dialog.style.left = Math.round(nextLeft) + 'px';
        dialog.style.top = Math.round(nextTop) + 'px';
      }

      function onPointerUp() {
        isDragging = false;
        header.style.cursor = 'grab';
        document.body.style.userSelect = '';
        window.removeEventListener('pointermove', onPointerMove);
        window.removeEventListener('pointerup', onPointerUp);
      }

      window.addEventListener('pointermove', onPointerMove);
      window.addEventListener('pointerup', onPointerUp);
    });

    // Doppelklick auf Header = Maximieren / Wiederherstellen
    header.addEventListener('dblclick', function(e) {
      if (e.target.closest('button') || e.target.closest('input')) return;
      if (maxBtn) maxBtn.click();
    });

    // Resizing via Grip unten rechts
    if (resizer) {
      resizer.addEventListener('pointerdown', function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (isMaximized) return;

        ensureFixedPosition();
        const rect = dialog.getBoundingClientRect();
        const contentRect = content.getBoundingClientRect();

        isResizing = true;
        startX = e.clientX;
        startY = e.clientY;
        initialWidth = rect.width;
        initialHeight = contentRect.height;

        document.body.style.userSelect = 'none';
        document.body.style.cursor = 'nwse-resize';

        function onResizeMove(ev) {
          if (!isResizing) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;

          const currentLeft = parseFloat(dialog.style.left) || rect.left;
          const currentTop = parseFloat(dialog.style.top) || rect.top;

          const maxW = window.innerWidth - currentLeft - 10;
          const maxH = window.innerHeight - currentTop - 10;
          const newW = Math.max(450, Math.min(maxW, initialWidth + dx));
          const newH = Math.max(280, Math.min(maxH, initialHeight + dy));

          dialog.style.width = Math.round(newW) + 'px';
          content.style.height = Math.round(newH) + 'px';
          if (modalBody) {
            modalBody.style.maxHeight = `calc(${Math.round(newH)}px - 62px)`;
          }
        }

        function onResizeUp() {
          isResizing = false;
          document.body.style.userSelect = '';
          document.body.style.cursor = '';
          window.removeEventListener('pointermove', onResizeMove);
          window.removeEventListener('pointerup', onResizeUp);
        }

        window.addEventListener('pointermove', onResizeMove);
        window.addEventListener('pointerup', onResizeUp);
      });
    }

    // Button Maximieren / Wiederherstellen
    if (maxBtn) {
      maxBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        const icon = maxBtn.querySelector('i');

        if (!isMaximized) {
          const rect = dialog.getBoundingClientRect();
          const contentRect = content.getBoundingClientRect();
          savedState = {
            left: dialog.style.left || (Math.round(rect.left) + 'px'),
            top: dialog.style.top || (Math.round(rect.top) + 'px'),
            width: dialog.style.width || (Math.round(rect.width) + 'px'),
            height: content.style.height || (Math.round(contentRect.height) + 'px'),
            bodyMaxHeight: modalBody ? modalBody.style.maxHeight : ''
          };

          dialog.classList.remove('modal-dialog-centered');
          dialog.style.position = 'fixed';
          dialog.style.margin = '0';
          dialog.style.left = '12px';
          dialog.style.top = '12px';
          dialog.style.width = 'calc(100vw - 24px)';
          dialog.style.maxWidth = 'none';
          content.style.height = 'calc(100vh - 24px)';
          if (modalBody) {
            modalBody.style.maxHeight = 'calc(100vh - 24px - 62px)';
          }
          if (icon) icon.className = 'fas fa-compress';
          maxBtn.title = 'Wiederherstellen';
          isMaximized = true;
        } else {
          if (savedState) {
            dialog.style.left = savedState.left;
            dialog.style.top = savedState.top;
            dialog.style.width = savedState.width;
            content.style.height = savedState.height;
            if (modalBody) {
              modalBody.style.maxHeight = savedState.bodyMaxHeight || 'calc(85vh - 65px)';
            }
          }
          if (icon) icon.className = 'fas fa-expand';
          maxBtn.title = 'Maximieren / Verkleinern';
          isMaximized = false;
        }
      };
    }

    // Beim Schliessen: Falls maximiert geschlossen wurde, auf Normalgrösse für das nächste Öffnen zurücksetzen
    modalEl.addEventListener('hidden.bs.modal', function() {
      if (isMaximized && maxBtn) {
        maxBtn.click();
      }
    });
  }

  // 8.1 Automatischer globaler Hook für alle Bootstrap 5 Modale im gesamten Vereinsportal
  if (typeof document !== 'undefined') {
    document.addEventListener('shown.bs.modal', function(e) {
      // Nur auf Bildschirmen >= 768px (Desktop / Tablet) aktivieren, um Mobilgeräte nicht zu beeinträchtigen
      if (window.innerWidth >= 768 && e.target && e.target.classList && e.target.classList.contains('modal')) {
        makeModalMovableAndResizable(e.target);
      }
    });
  }

  // ===========================================================================
  // 9. ASYNCHRONES MODAL-BESTÄTIGUNGS- & ALERT-KIT (UIConfirmKit)
  // ===========================================================================
  let confirmModalInstance = null;
  let confirmModalEl = null;

  function ensureConfirmModalDOM() {
    if (confirmModalEl && document.body.contains(confirmModalEl)) {
      return confirmModalEl;
    }
    let el = document.getElementById('ui-confirm-modal');
    if (!el) {
      el = document.createElement('div');
      el.id = 'ui-confirm-modal';
      el.className = 'modal fade';
      el.tabIndex = -1;
      el.setAttribute('aria-hidden', 'true');
      el.setAttribute('data-bs-backdrop', 'static');
      el.setAttribute('data-bs-keyboard', 'true');
      el.dataset.noMovable = 'true';
      el.style.zIndex = '1095';

      el.innerHTML = `
        <div class="modal-dialog modal-dialog-centered" style="max-width: 440px;">
          <div class="modal-content shadow-lg border-0" style="border-radius: 12px; overflow: hidden;">
            <div class="modal-header border-0 pb-1 pt-3 px-3">
              <div class="d-flex align-items-center gap-2">
                <div id="uiConfirmIconWrapper" class="d-flex align-items-center justify-content-center rounded-circle flex-shrink-0" style="width: 36px; height: 36px;">
                  <i id="uiConfirmIcon" class="fas"></i>
                </div>
                <h5 class="modal-title fs-6 fw-bold mb-0 text-dark" id="uiConfirmTitle">Bestätigung</h5>
              </div>
              <button type="button" class="btn-close shadow-none" id="uiConfirmCloseBtn" aria-label="Schliessen" style="font-size: 0.8rem;"></button>
            </div>
            <div class="modal-body py-2 px-3 text-secondary" id="uiConfirmBody" style="font-size: 0.92rem; line-height: 1.5; padding-left: 56px !important;">
            </div>
            <div class="modal-footer border-0 pt-2 pb-3 px-3 gap-2">
              <button type="button" class="btn btn-sm btn-outline-secondary px-3" id="uiConfirmCancelBtn" style="border-radius: 6px;">Abbrechen</button>
              <button type="button" class="btn btn-sm px-3 fw-semibold shadow-xs" id="uiConfirmOkBtn" style="border-radius: 6px;">Bestätigen</button>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(el);
    }
    confirmModalEl = el;
    if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
      confirmModalInstance = bootstrap.Modal.getOrCreateInstance(el, { backdrop: 'static', keyboard: true });
    }
    return el;
  }

  const UIConfirmKit = {
    /**
     * Öffnet einen asynchronen Bestätigungsdialog (liefert Promise<boolean>).
     * @param {Object|string} options
     * @returns {Promise<boolean>}
     */
    confirm(options = {}) {
      if (typeof options === 'string') {
        options = { message: options };
      }
      return new Promise((resolve) => {
        const modalEl = ensureConfirmModalDOM();
        const bsModal = confirmModalInstance || (typeof bootstrap !== 'undefined' && bootstrap.Modal ? bootstrap.Modal.getOrCreateInstance(modalEl) : null);

        const titleEl = modalEl.querySelector('#uiConfirmTitle');
        const bodyEl = modalEl.querySelector('#uiConfirmBody');
        const iconWrapper = modalEl.querySelector('#uiConfirmIconWrapper');
        const iconEl = modalEl.querySelector('#uiConfirmIcon');
        const cancelBtn = modalEl.querySelector('#uiConfirmCancelBtn');
        const okBtn = modalEl.querySelector('#uiConfirmOkBtn');
        const closeBtn = modalEl.querySelector('#uiConfirmCloseBtn');

        const type = options.type || 'primary'; // 'danger' | 'warning' | 'primary' | 'success' | 'info'
        const title = options.title || (type === 'danger' ? 'Achtung' : 'Bestätigung erforderlich');
        const message = options.message || options.text || 'Möchtest du diese Aktion wirklich ausführen?';
        const cancelText = options.cancelText || 'Abbrechen';
        let defaultOkText = 'Bestätigen';
        if (type === 'danger') defaultOkText = 'Löschen';
        if (type === 'success') defaultOkText = 'OK';
        const confirmText = options.confirmText || options.okText || defaultOkText;

        titleEl.textContent = title;
        bodyEl.innerHTML = message;
        cancelBtn.textContent = cancelText;
        cancelBtn.style.display = '';
        okBtn.textContent = confirmText;

        // Semantisches Styling
        okBtn.className = 'btn btn-sm px-3 fw-semibold shadow-xs';
        if (type === 'danger') {
          iconWrapper.style.backgroundColor = '#fee2e2';
          iconWrapper.style.color = '#dc2626';
          iconEl.className = 'fas fa-exclamation-triangle';
          okBtn.classList.add('btn-danger', 'text-white');
        } else if (type === 'warning') {
          iconWrapper.style.backgroundColor = '#fef3c7';
          iconWrapper.style.color = '#d97706';
          iconEl.className = 'fas fa-exclamation-circle';
          okBtn.classList.add('btn-warning', 'text-dark');
        } else if (type === 'success') {
          iconWrapper.style.backgroundColor = '#dcfce7';
          iconWrapper.style.color = '#16a34a';
          iconEl.className = 'fas fa-check-circle';
          okBtn.classList.add('btn-success', 'text-white');
        } else if (type === 'info') {
          iconWrapper.style.backgroundColor = '#e0f2fe';
          iconWrapper.style.color = '#0284c7';
          iconEl.className = 'fas fa-info-circle';
          okBtn.classList.add('btn-primary', 'text-white');
        } else {
          // 'primary'
          iconWrapper.style.backgroundColor = '#dbeafe';
          iconWrapper.style.color = '#2563eb';
          iconEl.className = 'fas fa-question-circle';
          okBtn.classList.add('btn-primary', 'text-white');
        }

        if (options.confirmBtnClass) {
          okBtn.className = options.confirmBtnClass;
        }

        let resolved = false;

        function cleanup() {
          okBtn.removeEventListener('click', onOk);
          cancelBtn.removeEventListener('click', onCancel);
          closeBtn.removeEventListener('click', onCancel);
          modalEl.removeEventListener('hidden.bs.modal', onHidden);
          modalEl.removeEventListener('shown.bs.modal', onShown);
        }

        function onOk() {
          resolved = true;
          cleanup();
          if (bsModal) bsModal.hide();
          resolve(true);
        }

        function onCancel() {
          resolved = true;
          cleanup();
          if (bsModal) bsModal.hide();
          resolve(false);
        }

        function onHidden() {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(false);
          }
        }

        function onShown() {
          if (options.focusCancel) {
            cancelBtn.focus();
          } else {
            okBtn.focus();
          }
        }

        okBtn.addEventListener('click', onOk);
        cancelBtn.addEventListener('click', onCancel);
        closeBtn.addEventListener('click', onCancel);
        modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
        modalEl.addEventListener('shown.bs.modal', onShown, { once: true });

        if (bsModal) {
          bsModal.show();
        } else {
          const ok = window.confirm(message.replace(/<[^>]*>?/gm, ''));
          resolve(ok);
        }
      });
    },

    /**
     * Öffnet einen asynchronen Hinweisdialog (liefert Promise<void>).
     * @param {Object|string} options
     * @returns {Promise<void>}
     */
    alert(options = {}) {
      if (typeof options === 'string') {
        options = { message: options };
      }
      return new Promise((resolve) => {
        const modalEl = ensureConfirmModalDOM();
        const bsModal = confirmModalInstance || (typeof bootstrap !== 'undefined' && bootstrap.Modal ? bootstrap.Modal.getOrCreateInstance(modalEl) : null);

        const titleEl = modalEl.querySelector('#uiConfirmTitle');
        const bodyEl = modalEl.querySelector('#uiConfirmBody');
        const iconWrapper = modalEl.querySelector('#uiConfirmIconWrapper');
        const iconEl = modalEl.querySelector('#uiConfirmIcon');
        const cancelBtn = modalEl.querySelector('#uiConfirmCancelBtn');
        const okBtn = modalEl.querySelector('#uiConfirmOkBtn');
        const closeBtn = modalEl.querySelector('#uiConfirmCloseBtn');

        const type = options.type || 'info';
        const title = options.title || (type === 'danger' ? 'Fehler' : (type === 'warning' ? 'Hinweis' : 'Information'));
        const message = options.message || options.text || '';
        const confirmText = options.confirmText || options.okText || 'Verstanden';

        titleEl.textContent = title;
        bodyEl.innerHTML = message;
        cancelBtn.style.display = 'none';
        okBtn.textContent = confirmText;

        okBtn.className = 'btn btn-sm px-3 fw-semibold shadow-xs';
        if (type === 'danger') {
          iconWrapper.style.backgroundColor = '#fee2e2';
          iconWrapper.style.color = '#dc2626';
          iconEl.className = 'fas fa-exclamation-triangle';
          okBtn.classList.add('btn-danger', 'text-white');
        } else if (type === 'warning') {
          iconWrapper.style.backgroundColor = '#fef3c7';
          iconWrapper.style.color = '#d97706';
          iconEl.className = 'fas fa-exclamation-circle';
          okBtn.classList.add('btn-warning', 'text-dark');
        } else if (type === 'success') {
          iconWrapper.style.backgroundColor = '#dcfce7';
          iconWrapper.style.color = '#16a34a';
          iconEl.className = 'fas fa-check-circle';
          okBtn.classList.add('btn-success', 'text-white');
        } else {
          iconWrapper.style.backgroundColor = '#e0f2fe';
          iconWrapper.style.color = '#0284c7';
          iconEl.className = 'fas fa-info-circle';
          okBtn.classList.add('btn-primary', 'text-white');
        }

        if (options.confirmBtnClass) {
          okBtn.className = options.confirmBtnClass;
        }

        let resolved = false;

        function cleanup() {
          okBtn.removeEventListener('click', onDismiss);
          closeBtn.removeEventListener('click', onDismiss);
          modalEl.removeEventListener('hidden.bs.modal', onHidden);
          modalEl.removeEventListener('shown.bs.modal', onShown);
        }

        function onDismiss() {
          resolved = true;
          cleanup();
          if (bsModal) bsModal.hide();
          resolve();
        }

        function onHidden() {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve();
          }
        }

        function onShown() {
          okBtn.focus();
        }

        okBtn.addEventListener('click', onDismiss);
        closeBtn.addEventListener('click', onDismiss);
        modalEl.addEventListener('hidden.bs.modal', onHidden, { once: true });
        modalEl.addEventListener('shown.bs.modal', onShown, { once: true });

        if (bsModal) {
          bsModal.show();
        } else {
          window.alert(message.replace(/<[^>]*>?/gm, ''));
          resolve();
        }
      });
    }
  };

  // ===========================================================================
  // 10. SCHWEIZER STANDARD-FORMATIERUNGEN (UIFormatKit)
  // ===========================================================================
  const UIFormat = {
    /**
     * Formatiert Währungsbeträge nach Schweizer Standard:
     * - "CHF 1'234.50" (Standard)
     * - "1'234.50" (symbol: false)
     * - "- CHF 50.00" bzw. "-50.00"
     * @param {number|string} val
     * @param {Object} options
     * @returns {string}
     */
    money(val, options = {}) {
      const fallback = (options.fallback !== undefined) ? options.fallback : '-';
      if (val === null || val === undefined || val === '') return fallback;

      const num = Number(val);
      if (isNaN(num)) return fallback;

      const decimals = (options.decimals !== undefined) ? options.decimals : 2;
      const showSymbol = options.symbol !== false;
      const currency = options.currency || 'CHF';
      const isNeg = num < 0;

      const absVal = Math.abs(num);
      const fixed = absVal.toFixed(decimals);
      const parts = fixed.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
      const numStr = parts.join('.');

      if (isNeg) {
        return showSymbol ? `- ${currency} ${numStr}` : `-${numStr}`;
      }
      return showSymbol ? `${currency} ${numStr}` : numStr;
    },

    /**
     * Formatiert Datum nach Schweizer Norm: DD.MM.YYYY
     * Verhindert bei reinen Datumswerten (YYYY-MM-DD) Zeitzonenverschiebungen.
     * @param {string|Date} val
     * @param {Object} options
     * @returns {string}
     */
    date(val, options = {}) {
      const fallback = (options.fallback !== undefined) ? options.fallback : '-';
      if (!val) return fallback;

      const str = String(val).trim();
      if (!str) return fallback;

      // 1. Reines Datum (YYYY-MM-DD) ohne Zeitzone splitten (verhindert Verschiebung durch UTC)
      if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
        const [y, m, d] = str.split('-');
        if (options.weekday) {
          const dt = new Date(Number(y), Number(m) - 1, Number(d));
          const wd = dt.toLocaleDateString('de-CH', { weekday: options.weekdayFormat || 'short' });
          return `${wd}, ${d}.${m}.${y}`;
        }
        return `${d}.${m}.${y}`;
      }

      // 2. Schweizer Format (bereits DD.MM.YYYY oder D.M.YYYY)
      const dmy = str.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})/);
      if (dmy) {
        const d = dmy[1].padStart(2, '0');
        const m = dmy[2].padStart(2, '0');
        const y = dmy[3];
        if (options.weekday) {
          const dt = new Date(Number(y), Number(m) - 1, Number(d));
          const wd = dt.toLocaleDateString('de-CH', { weekday: options.weekdayFormat || 'short' });
          return `${wd}, ${d}.${m}.${y}`;
        }
        return `${d}.${m}.${y}`;
      }

      // 3. ISO-String oder Date
      const d = (val instanceof Date) ? val : new Date(str);
      if (isNaN(d.getTime())) return fallback;

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();

      if (options.weekday) {
        const wd = d.toLocaleDateString('de-CH', { weekday: options.weekdayFormat || 'short' });
        return `${wd}, ${day}.${month}.${year}`;
      }
      return `${day}.${month}.${year}`;
    },

    /**
     * Formatiert Datum und Uhrzeit: DD.MM.YYYY, HH:mm (bzw. :ss)
     * @param {string|Date} val
     * @param {Object} options
     * @returns {string}
     */
    dateTime(val, options = {}) {
      const fallback = (options.fallback !== undefined) ? options.fallback : '-';
      if (!val) return fallback;

      const d = (val instanceof Date) ? val : new Date(String(val).trim());
      if (isNaN(d.getTime())) return fallback;

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');

      if (options.seconds) {
        const seconds = String(d.getSeconds()).padStart(2, '0');
        return `${day}.${month}.${year}, ${hours}:${minutes}:${seconds}`;
      }
      return `${day}.${month}.${year}, ${hours}:${minutes}`;
    },

    /**
     * Formatiert eine Uhrzeit: HH:mm (bzw. :ss)
     * @param {string|Date} val
     * @param {Object} options
     * @returns {string}
     */
    time(val, options = {}) {
      const fallback = (options.fallback !== undefined) ? options.fallback : '-';
      if (!val) return fallback;

      const str = String(val).trim();
      const timeMatch = str.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
      if (timeMatch) {
        const hh = timeMatch[1].padStart(2, '0');
        const mm = timeMatch[2];
        if (options.seconds && timeMatch[3]) {
          return `${hh}:${mm}:${timeMatch[3]}`;
        }
        return `${hh}:${mm}`;
      }

      const d = (val instanceof Date) ? val : new Date(str);
      if (!isNaN(d.getTime())) {
        const hours = String(d.getHours()).padStart(2, '0');
        const minutes = String(d.getMinutes()).padStart(2, '0');
        if (options.seconds) {
          const seconds = String(d.getSeconds()).padStart(2, '0');
          return `${hours}:${minutes}:${seconds}`;
        }
        return `${hours}:${minutes}`;
      }

      return fallback;
    },

    /**
     * Formatiert IBAN in 4-stellige Blöcke: CH93 0076 2011 6238 5295 7
     * @param {string} val
     * @param {Object} options
     * @returns {string}
     */
    iban(val, options = {}) {
      const fallback = (options.fallback !== undefined) ? options.fallback : '-';
      if (!val) return fallback;

      const clean = String(val).replace(/[^A-Za-z0-9]/g, '').toUpperCase();
      if (!clean) return fallback;

      return clean.replace(/(.{4})/g, '$1 ').trim();
    },

    /**
     * Formatiert Telefonnummern nach Schweizer Standard (+41 79 123 45 67 oder 079 123 45 67)
     * @param {string} val
     * @param {Object} options
     * @returns {string}
     */
    phone(val, options = {}) {
      const fallback = (options.fallback !== undefined) ? options.fallback : '-';
      if (!val) return fallback;

      const raw = String(val).trim();
      if (!raw) return fallback;

      const isIntl = options.format !== 'national'; // Default: international
      const hasPlus = raw.startsWith('+');
      let digits = raw.replace(/\D/g, '');
      if (!digits) return fallback;

      // Vorwahlen normalisieren
      if (digits.startsWith('0041')) {
        digits = '41' + digits.slice(4);
      } else if (digits.startsWith('0') && !hasPlus) {
        digits = '41' + digits.slice(1);
      } else if (!hasPlus && !digits.startsWith('41') && digits.length === 9) {
        digits = '41' + digits;
      }

      // Schweizer Mobil- oder Festnetznummer (41 + 9 Ziffern = 11 Stellen)
      if (digits.startsWith('41') && digits.length === 11) {
        const area = digits.slice(2, 4);
        const p1 = digits.slice(4, 7);
        const p2 = digits.slice(7, 9);
        const p3 = digits.slice(9, 11);

        if (isIntl) {
          return `+41 ${area} ${p1} ${p2} ${p3}`;
        } else {
          return `0${area} ${p1} ${p2} ${p3}`;
        }
      }

      // Fallback für andere Längen / Auslandsnummern
      if (hasPlus) {
        return '+' + digits.replace(/(\d{3})(?=\d)/g, '$1 ');
      }
      return raw;
    }
  };

  // ===========================================================================
  // 11. BUTTON-LIFECYCLE & DOUBLE-SUBMIT GUARD (UIButtonKit)
  // ===========================================================================
  const UIButtonKit = {
    /**
     * Umschliesst eine asynchrone Funktion mit automatischer Button-Deaktivierung,
     * Spinner und ausnahmsloser Wiederherstellung im finally-Block.
     * @param {HTMLElement|string} buttonOrSelector
     * @param {Function} asyncFn
     * @param {Object} options
     * @returns {Promise<any>}
     */
    async withLoading(buttonOrSelector, asyncFn, options = {}) {
      const btn = (typeof buttonOrSelector === 'string')
        ? document.querySelector(buttonOrSelector)
        : buttonOrSelector;

      if (!btn || typeof asyncFn !== 'function') {
        if (typeof asyncFn === 'function') return await asyncFn();
        return;
      }

      // Schutz vor Double-Submit bei schnellen Mehrfachklicks
      if (btn._uiButtonLoading) return;
      btn._uiButtonLoading = true;

      const originalHtml = btn.innerHTML;
      const originalDisabled = btn.disabled;
      const originalWidth = btn.getBoundingClientRect().width;

      if (originalWidth > 0 && options.preserveWidth !== false) {
        btn.style.minWidth = Math.round(originalWidth) + 'px';
      }

      btn.disabled = true;

      const spinnerText = options.loadingText !== undefined
        ? options.loadingText
        : (options.text || null);
      const spinnerHtml = '<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>';

      if (spinnerText !== null) {
        btn.innerHTML = `${spinnerHtml}${spinnerText}`;
      } else {
        btn.innerHTML = `${spinnerHtml}${originalHtml}`;
      }

      try {
        const result = await asyncFn();
        if (options.successText) {
          btn.innerHTML = options.successText;
          const duration = options.successDuration || 1200;
          await new Promise(r => setTimeout(r, duration));
        }
        return result;
      } finally {
        btn.innerHTML = originalHtml;
        btn.disabled = originalDisabled;
        if (options.preserveWidth !== false) {
          btn.style.minWidth = '';
        }
        delete btn._uiButtonLoading;
      }
    },

    /**
     * Manuelle Steuerung des Button-Ladezustands.
     * @param {HTMLElement|string} buttonOrSelector
     * @param {boolean} isLoading
     * @param {Object} options
     */
    setLoading(buttonOrSelector, isLoading, options = {}) {
      const btn = (typeof buttonOrSelector === 'string')
        ? document.querySelector(buttonOrSelector)
        : buttonOrSelector;
      if (!btn) return;

      if (isLoading) {
        if (btn._uiButtonLoading) return;
        btn._uiButtonLoading = true;
        btn._originalHtml = btn.innerHTML;
        btn._originalDisabled = btn.disabled;
        btn.disabled = true;
        const text = options.loadingText || options.text || btn.innerText;
        btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>${text}`;
      } else {
        if (btn._originalHtml !== undefined) {
          btn.innerHTML = btn._originalHtml;
          delete btn._originalHtml;
        }
        if (btn._originalDisabled !== undefined) {
          btn.disabled = btn._originalDisabled;
          delete btn._originalDisabled;
        }
        delete btn._uiButtonLoading;
      }
    }
  };

  // ===========================================================================
  // 12. ZENTRALER SHEETJS EXPORT-SERVICE (UIExportKit)
  // ===========================================================================
  const UIExportKit = {
    /**
     * Exportiert eine gerenderte HTML-Tabelle direkt in eine Excel-Datei (.xlsx).
     * Beachtet TableKit-Ausblendungen (.tk-col-hidden) und filtert UI-Artefakte heraus.
     * @param {HTMLTableElement|string} tableOrSelector
     * @param {Object} options
     */
    tableToExcel(tableOrSelector, options = {}) {
      if (typeof XLSX === 'undefined') {
        const msg = 'SheetJS (XLSX) Bibliothek ist nicht geladen.';
        if (window.UIConfirmKit) window.UIConfirmKit.alert({ title: 'Export-Fehler', message: msg, type: 'danger' });
        else alert(msg);
        return;
      }

      const table = (typeof tableOrSelector === 'string')
        ? document.querySelector(tableOrSelector)
        : tableOrSelector;
      if (!table) return;

      const thead = table.querySelector('thead');
      const tbody = table.querySelector('tbody') || table;
      if (!thead) return;

      const excludeHidden = options.excludeHiddenColumns !== false;
      const onlyVisibleRows = options.onlyVisibleRows !== false;

      // 1. Spalten analysieren
      const headerThs = Array.from(thead.querySelectorAll('tr:last-child th'));
      const activeColumns = [];

      headerThs.forEach((th, idx) => {
        const colId = (th.dataset.colId || th.getAttribute('data-col') || '').toLowerCase();
        // Aktionen, Checkboxen und Ausblende-Spalten überspringen
        if (colId === 'check' || colId === 'actions' || colId === 'aktionen' || colId === 'col_check' || colId === 'col_actions' || colId === 'drag' || colId === 'col_drag') return;
        if (th.classList.contains('tk-col-actions') || th.classList.contains('tk-col-check')) return;
        if (excludeHidden && (th.classList.contains('tk-col-hidden') || th.style.display === 'none')) return;

        // Header-Text bereinigen (Sortierpfeile, Resizer entfernen)
        let headerText = th.innerText.replace(/[↕▲▼]/g, '').trim();
        // Text aus data-col-name bevorzugen falls vorhanden
        if (th.dataset.colName) headerText = th.dataset.colName;

        activeColumns.push({
          idx,
          colId,
          name: headerText || `Spalte ${idx + 1}`
        });
      });

      if (!activeColumns.length) return;

      // 2. Tabellenzeilen extrahieren
      const aoa = [activeColumns.map(c => c.name)];
      const rows = Array.from(tbody.querySelectorAll('tr'));

      rows.forEach(tr => {
        // Ignorieren wenn gefiltert / ausgeblendet
        if (onlyVisibleRows && tr.style.display === 'none') return;
        // Ignorieren wenn Sub-Header oder Leerzeile
        if (tr.classList.contains('tk-ignore-export')) return;

        const cells = Array.from(tr.children);
        if (!cells.length) return;

        const rowData = [];
        activeColumns.forEach(c => {
          let td = c.colId ? tr.querySelector(`td[data-col-id="${c.colId}"], td.tk-col-${c.colId}`) : null;
          if (!td && cells[c.idx]) {
            td = cells[c.idx];
          }

          if (!td) {
            rowData.push('');
            return;
          }

          let val = '';
          const input = td.querySelector('input:not([type="checkbox"]):not([type="hidden"]), select, textarea');
          if (input) {
            if (input.tagName === 'SELECT') {
              val = input.options[input.selectedIndex]?.text || input.value || '';
            } else {
              val = input.value || '';
            }
          } else {
            val = td.innerText.trim();
          }

          // Formatierungen bereinigen (z.B. "CHF 1'234.50" -> Zahl 1234.50 für echte Excel-Berechnungen)
          if (options.parseNumbers !== false && /^CHF\s*[\d',.-]+$/i.test(val)) {
            const rawNum = parseFloat(val.replace(/CHF/i, '').replace(/'/g, '').trim());
            if (!isNaN(rawNum)) val = rawNum;
          } else if (options.parseNumbers !== false && /^[\d']+\.\d{2}$/.test(val)) {
            const rawNum = parseFloat(val.replace(/'/g, ''));
            if (!isNaN(rawNum)) val = rawNum;
          }

          rowData.push(val);
        });

        aoa.push(rowData);
      });

      // 3. Worksheet & Workbook erzeugen
      const ws = XLSX.utils.aoa_to_sheet(aoa);

      const colWidths = activeColumns.map((col, colIdx) => {
        let maxLen = col.name.length;
        for (let r = 1; r < aoa.length; r++) {
          const cellVal = String(aoa[r][colIdx] || '');
          if (cellVal.length > maxLen) maxLen = Math.min(60, cellVal.length);
        }
        return { wch: Math.max(12, maxLen + 3) };
      });
      ws['!cols'] = colWidths;

      const wb = XLSX.utils.book_new();
      const sheetName = (options.sheetName || 'Tabelle').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      let baseFilename = options.filename || table.id || 'Export';
      baseFilename = baseFilename.replace(/\.xlsx$/i, '');
      const todayStr = new Date().toISOString().split('T')[0];
      const finalFilename = (options.dateSuffix !== false)
        ? `${baseFilename}_${todayStr}.xlsx`
        : `${baseFilename}.xlsx`;

      XLSX.writeFile(wb, finalFilename);
    },

    /**
     * Exportiert ein Rohdaten-Array nach Excel (.xlsx).
     * @param {Array<Object>} dataArray
     * @param {Object} options
     */
    dataToExcel(dataArray, options = {}) {
      if (typeof XLSX === 'undefined') {
        const msg = 'SheetJS (XLSX) Bibliothek ist nicht geladen.';
        if (window.UIConfirmKit) window.UIConfirmKit.alert({ title: 'Export-Fehler', message: msg, type: 'danger' });
        else alert(msg);
        return;
      }

      if (!Array.isArray(dataArray) || !dataArray.length) {
        if (window.UIConfirmKit) {
          window.UIConfirmKit.alert({ title: 'Keine Daten', message: 'Es sind keine Datensätze für den Export vorhanden.', type: 'warning' });
        }
        return;
      }

      let ws;
      if (options.headers && typeof options.headers === 'object') {
        const keys = Object.keys(options.headers);
        const headerLabels = Object.values(options.headers);
        const aoa = [headerLabels];

        dataArray.forEach(row => {
          const r = keys.map(k => (row[k] !== undefined && row[k] !== null) ? row[k] : '');
          aoa.push(r);
        });
        ws = XLSX.utils.aoa_to_sheet(aoa);
      } else {
        ws = XLSX.utils.json_to_sheet(dataArray);
      }

      if (Array.isArray(options.columnWidths)) {
        ws['!cols'] = options.columnWidths.map(w => ({ wch: w }));
      }

      const wb = XLSX.utils.book_new();
      const sheetName = (options.sheetName || 'Daten').slice(0, 31);
      XLSX.utils.book_append_sheet(wb, ws, sheetName);

      let baseFilename = options.filename || 'Export';
      baseFilename = baseFilename.replace(/\.xlsx$/i, '');
      const todayStr = new Date().toISOString().split('T')[0];
      const finalFilename = (options.dateSuffix !== false)
        ? `${baseFilename}_${todayStr}.xlsx`
        : `${baseFilename}.xlsx`;

      XLSX.writeFile(wb, finalFilename);
    },

    /**
     * Exportiert ein Datenarray als CSV-Datei (.csv mit Semikolon).
     * @param {Array<Object>} dataArray
     * @param {Object} options
     */
    dataToCsv(dataArray, options = {}) {
      if (typeof XLSX === 'undefined') {
        const msg = 'SheetJS (XLSX) Bibliothek ist nicht geladen.';
        if (window.UIConfirmKit) window.UIConfirmKit.alert({ title: 'Export-Fehler', message: msg, type: 'danger' });
        else alert(msg);
        return;
      }

      if (!Array.isArray(dataArray) || !dataArray.length) return;

      let ws;
      if (options.headers && typeof options.headers === 'object') {
        const keys = Object.keys(options.headers);
        const headerLabels = Object.values(options.headers);
        const aoa = [headerLabels];
        dataArray.forEach(row => {
          aoa.push(keys.map(k => (row[k] !== undefined && row[k] !== null) ? row[k] : ''));
        });
        ws = XLSX.utils.aoa_to_sheet(aoa);
      } else {
        ws = XLSX.utils.json_to_sheet(dataArray);
      }

      const csvContent = '\uFEFF' + XLSX.utils.sheet_to_csv(ws, { FS: ';' });
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const baseFilename = (options.filename || 'Export').replace(/\.csv$/i, '');
      const todayStr = new Date().toISOString().split('T')[0];
      const filename = (options.dateSuffix !== false) ? `${baseFilename}_${todayStr}.csv` : `${baseFilename}.csv`;

      if (navigator.msSaveBlob) {
        navigator.msSaveBlob(blob, filename);
      } else {
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
      }
    }
  };

  // ===========================================================================
  // 13. GLOBALE TASTATUR-ERGONOMIE (UIHotkeyKit)
  // ===========================================================================
  const UIHotkeyKit = {
    _customHotkeys: {},
    _initialized: false,

    init() {
      if (this._initialized || typeof window === 'undefined') return;
      this._initialized = true;

      window.addEventListener('keydown', (e) => {
        const isCtrl = e.ctrlKey || e.metaKey;
        const key = e.key.toLowerCase();
        const activeEl = document.activeElement;
        const isInputFocused = activeEl && (
          activeEl.tagName === 'INPUT' ||
          activeEl.tagName === 'TEXTAREA' ||
          activeEl.tagName === 'SELECT' ||
          activeEl.isContentEditable
        );

        // 1. Custom Hotkeys prüfen (z.B. 'ctrl+s', 'escape', 'ctrl+k')
        const combo = (isCtrl ? 'ctrl+' : '') + (e.shiftKey ? 'shift+' : '') + (e.altKey ? 'alt+' : '') + key;
        if (this._customHotkeys[combo]) {
          const res = this._customHotkeys[combo](e);
          if (res === false) {
            e.preventDefault();
            return;
          }
        }

        // 2. Strg + S / Cmd + S (Speichern-Guard)
        if (isCtrl && key === 's') {
          e.preventDefault();
          this._handleSave();
          return;
        }

        // 3. Escape (Hierarchisches Schliessen)
        if (key === 'escape') {
          this._handleEscape(e);
          return;
        }

        // 4. Strg + K oder '/' (Schnellsuche)
        if ((isCtrl && key === 'k') || (key === '/' && !isInputFocused && !isCtrl)) {
          e.preventDefault();
          this._handleSearchFocus();
          return;
        }
      });
    },

    register(shortcut, handler) {
      if (!shortcut || typeof handler !== 'function') return;
      this._customHotkeys[shortcut.toLowerCase().trim()] = handler;
      if (!this._initialized) this.init();
    },

    unregister(shortcut) {
      delete this._customHotkeys[shortcut.toLowerCase().trim()];
    },

    _handleSave() {
      // Priorität 1: Modal geöffnet?
      const openModal = document.querySelector('.modal.show');
      if (openModal) {
        const modalBtn = openModal.querySelector(
          '.modal-footer button.btn-primary:not([disabled]):not([style*="display: none"]), ' +
          '.modal-footer button.btn-success:not([disabled]):not([style*="display: none"]), ' +
          'button[type="submit"]:not([disabled]):not([style*="display: none"]), ' +
          '.btn-save:not([disabled]):not([style*="display: none"])'
        );
        if (modalBtn) {
          modalBtn.click();
          this._showToast('💾 Speichern ausgelöst');
          return;
        }
      }

      // Priorität 2: Aktiver Speichern-Button der aktuellen Sektion / Kachel
      const activeContainer = document.querySelector('.tab-pane.active, .card:not([style*="display: none"]), main') || document.body;
      const saveBtn = activeContainer.querySelector(
        'button.btn-primary.btn-save:not([disabled]), ' +
        '#btnSave:not([disabled]), ' +
        '.btn-save:not([disabled]), ' +
        'button[type="submit"]:not([disabled])'
      );
      if (saveBtn) {
        saveBtn.click();
        this._showToast('💾 Speichern ausgelöst');
        return;
      }

      // Fallback: SaveButtonKit falls vorhanden
      if (window.SaveButtonKit && typeof window.SaveButtonKit.trigger === 'function') {
        window.SaveButtonKit.trigger();
        this._showToast('💾 Speichern ausgelöst');
      }
    },

    _handleEscape(e) {
      // Priorität 1: Oberstes Modal schliessen
      const openModals = Array.from(document.querySelectorAll('.modal.show'));
      if (openModals.length > 0) {
        const topModal = openModals[openModals.length - 1];
        if (topModal.dataset.bsKeyboard !== 'false') {
          if (typeof bootstrap !== 'undefined' && bootstrap.Modal) {
            const inst = bootstrap.Modal.getInstance(topModal);
            if (inst) {
              inst.hide();
              return;
            }
          }
          const closeBtn = topModal.querySelector('.btn-close, [data-bs-dismiss="modal"]');
          if (closeBtn) {
            closeBtn.click();
            return;
          }
        }
      }

      // Priorität 2: Offene Dropdown-Menüs schliessen
      const openDropdowns = Array.from(document.querySelectorAll('.dropdown-menu.show'));
      if (openDropdowns.length > 0) {
        openDropdowns.forEach(d => {
          const toggle = d.closest('.dropdown')?.querySelector('[data-bs-toggle="dropdown"]');
          if (toggle && typeof bootstrap !== 'undefined' && bootstrap.Dropdown) {
            const inst = bootstrap.Dropdown.getInstance(toggle);
            if (inst) inst.hide();
          } else {
            d.classList.remove('show');
          }
        });
        return;
      }

      // Priorität 3: Wenn Suchfeld aktiv, leeren und Filter resetten
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.type === 'search' || activeEl.classList.contains('tk-search-input') || (activeEl.id && activeEl.id.includes('Search')))) {
        if (activeEl.value) {
          activeEl.value = '';
          activeEl.dispatchEvent(new Event('input', { bubbles: true }));
          activeEl.blur();
        }
      }
    },

    _handleSearchFocus() {
      const activeContainer = document.querySelector('.tab-pane.active') || document.body;
      const searchInput = activeContainer.querySelector(
        'input[type="search"], ' +
        'input.tk-search-input, ' +
        '#mglSearchInput, ' +
        '#rnSearchInput, ' +
        '#jbSearchInput, ' +
        'input[id*="search" i], ' +
        'input[placeholder*="Suchen" i]'
      );
      if (searchInput) {
        searchInput.focus();
        searchInput.select();
      }
    },

    _showToast(msg) {
      let toastEl = document.getElementById('ui-hotkey-toast');
      if (!toastEl) {
        toastEl = document.createElement('div');
        toastEl.id = 'ui-hotkey-toast';
        toastEl.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 1099; background: rgba(15, 23, 42, 0.85); color: #fff; padding: 6px 14px; border-radius: 20px; font-size: 0.82rem; pointer-events: none; opacity: 0; transition: opacity 0.2s ease; box-shadow: 0 4px 12px rgba(0,0,0,0.15); backdrop-filter: blur(4px);';
        document.body.appendChild(toastEl);
      }
      toastEl.textContent = msg;
      toastEl.style.opacity = '1';
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => {
        toastEl.style.opacity = '0';
      }, 1500);
    }
  };

  // ===========================================================================
  // 14. OFFLINE-BANNER & AUTH-TOKEN HEARTBEAT (UIConnectivityKit)
  // ===========================================================================
  const UIConnectivityKit = {
    _bannerEl: null,
    _heartbeatTimer: null,
    _isOnline: true,
    _initialized: false,

    init(options = {}) {
      if (this._initialized || typeof window === 'undefined') return;
      this._initialized = true;

      this._isOnline = (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
        ? navigator.onLine
        : true;

      window.addEventListener('online', () => this._handleConnectivityChange(true));
      window.addEventListener('offline', () => this._handleConnectivityChange(false));

      if (!this._isOnline) {
        this._showBanner(false);
      }

      // Heartbeat: alle 10 Minuten
      const intervalMs = options.heartbeatIntervalMs || (10 * 60 * 1000);
      this._heartbeatTimer = setInterval(() => this.checkSession(), intervalMs);
      if (this._heartbeatTimer && typeof this._heartbeatTimer.unref === 'function') {
        this._heartbeatTimer.unref();
      }

      // Bei Rückkehr zum Browser-Tab
      if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') {
            this.checkSession();
          }
        });
      }
    },

    isOnline() {
      return (typeof navigator !== 'undefined' && typeof navigator.onLine === 'boolean')
        ? navigator.onLine
        : this._isOnline;
    },

    _ensureBanner() {
      if (this._bannerEl && document.body.contains(this._bannerEl)) return this._bannerEl;
      let el = document.getElementById('ui-connectivity-banner');
      if (!el) {
        el = document.createElement('div');
        el.id = 'ui-connectivity-banner';
        el.style.cssText = 'position: fixed; top: 0; left: 0; right: 0; z-index: 2000; text-align: center; padding: 7px 16px; font-size: 0.85rem; font-weight: 600; display: none; transition: transform 0.25s ease, opacity 0.25s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.15);';
        document.body.prepend(el);
      }
      this._bannerEl = el;
      return el;
    },

    _handleConnectivityChange(isOnline) {
      this._isOnline = isOnline;
      this._showBanner(isOnline);
      if (isOnline) {
        this.checkSession();
      }
    },

    _showBanner(isOnline) {
      const banner = this._ensureBanner();
      if (this._bannerHideTimeout) clearTimeout(this._bannerHideTimeout);

      if (!isOnline) {
        banner.style.backgroundColor = '#dc2626';
        banner.style.color = '#ffffff';
        banner.innerHTML = '<i class="fas fa-wifi-slash me-2"></i>⚠️ <strong>Du bist offline:</strong> Keine Internetverbindung. Bitte Seiten nicht neu laden, damit deine Eingaben erhalten bleiben.';
        banner.style.display = 'block';
      } else {
        if (banner.style.display !== 'none') {
          banner.style.backgroundColor = '#16a34a';
          banner.style.color = '#ffffff';
          banner.innerHTML = '<i class="fas fa-check-circle me-2"></i>✅ <strong>Wieder online:</strong> Verbindung zum Server hergestellt.';
          this._bannerHideTimeout = setTimeout(() => {
            banner.style.display = 'none';
          }, 2500);
        }
      }
    },

    async checkSession() {
      try {
        const client = window.sb || (typeof supabase !== 'undefined' ? supabase : null);
        if (!client || !client.auth) return;

        const { data, error } = await client.auth.getSession();
        if (error || !data || !data.session) return;

        const session = data.session;
        if (!session.expires_at) return;

        const nowSec = Math.floor(Date.now() / 1000);
        const remainingSec = session.expires_at - nowSec;

        if (remainingSec < 900) {
          console.log('🔄 UIConnectivityKit: Auth-Token läuft in <15 Min ab. Erneuere Session transparent...');
          const { error: refreshErr } = await client.auth.refreshSession();
          if (refreshErr) {
            console.warn('⚠️ UIConnectivityKit: Token-Refresh fehlgeschlagen:', refreshErr);
          } else {
            console.log('✅ UIConnectivityKit: Session erfolgreich verlängert.');
          }
        }
      } catch (err) {
        console.warn('UIConnectivityKit checkSession Fehler:', err);
      }
    }
  };

  // 14.1 Automatische Initialisierung bei Skript-Ausführung
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        UIHotkeyKit.init();
        UIConnectivityKit.init();
      });
    } else {
      UIHotkeyKit.init();
      UIConnectivityKit.init();
    }
  }

  // Globale Registrierung
  window.TableKit = {
    makeSortable,
    makeDraggable,
    setupFilter,
    setupCollapsible,
    setupColumnToggle,
    makeResizable,
    makeColumnReorderable,
    applyColumnOrder,
    initTable,
    syncTable,
    cleanKontoDisplay,
    formatKontoSearch: (konto, bezeichnung) => cleanKontoDisplay(konto, bezeichnung).display,
    setupDraggableModal: makeModalMovableAndResizable,
    SaveButton: window.SaveButtonKit || null,
    Confirm: UIConfirmKit,
    Format: UIFormat,
    Button: UIButtonKit,
    Export: UIExportKit,
    Hotkey: UIHotkeyKit,
    Connectivity: UIConnectivityKit,
    ensureStyles
  };

  window.bhCleanKontoDisplay = cleanKontoDisplay;

  window.UIModalKit = {
    makeMovableAndResizable: makeModalMovableAndResizable
  };

  window.UIConfirmKit = UIConfirmKit;
  window.confirmAsync = UIConfirmKit.confirm;
  window.alertAsync = UIConfirmKit.alert;

  window.UIFormat = UIFormat;
  window.UIFormatKit = UIFormat;
  window.formatSwissMoney = UIFormat.money;
  if (!window.formatSwissDate) {
    window.formatSwissDate = UIFormat.date;
  }

  window.UIButtonKit = UIButtonKit;
  window.withLoading = UIButtonKit.withLoading;

  window.UIExportKit = UIExportKit;

  window.UIHotkeyKit = UIHotkeyKit;
  window.UIConnectivityKit = UIConnectivityKit;

  console.log('✅ TableKit, UIModalKit, UIConfirmKit, UIFormatKit, UIButtonKit, UIExportKit, UIHotkeyKit & UIConnectivityKit Standard geladen (Sportschützen Muhen UI Toolkit)');
})();



