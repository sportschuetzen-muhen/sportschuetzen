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
        // Nicht sortieren wenn Klick auf interaktives Element im Header
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON' || e.target.tagName === 'SELECT') return;

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
        cols.push({
          id: th.dataset.colId,
          name: th.dataset.colName || th.innerText.replace(/[↕▲▼]/g, '').trim(),
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
      container.innerHTML = `
        <div class="dropdown">
          <button class="btn btn-sm btn-outline-secondary dropdown-toggle d-flex align-items-center gap-1 shadow-xs" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Spalten ein- oder ausblenden">
            <i class="fas fa-columns text-primary"></i>
            <span>Spalten</span>
            <span class="badge bg-secondary ms-1 tk-col-count" style="font-size: 0.72rem;">${cols.length}/${cols.length}</span>
          </button>
          <div class="dropdown-menu dropdown-menu-end shadow p-2" style="min-width: 220px; font-size: 0.85rem; z-index: 1060;">
            <div class="d-flex justify-content-between align-items-center mb-2 px-1 border-bottom pb-1">
              <span class="fw-bold small text-muted text-uppercase" style="font-size: 0.72rem;">Spalten auswählen</span>
              <button type="button" class="btn btn-link btn-sm p-0 text-decoration-none text-primary small tk-col-show-all" style="font-size: 0.75rem;">Alle an</button>
            </div>
            <div class="tk-col-dropdown-list d-flex flex-column gap-1">
              ${cols.map(c => `
                <label class="dropdown-item d-flex align-items-center justify-content-between py-1 px-2 rounded cursor-pointer mb-0">
                  <span>${c.name}</span>
                  <input class="form-check-input ms-2 tk-col-checkbox" type="checkbox" data-col-toggle="${c.id}" ${colState[c.id] ? 'checked' : ''}>
                </label>
              `).join('')}
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

  // Globale Registrierung
  window.TableKit = {
    makeSortable,
    makeDraggable,
    setupFilter,
    setupCollapsible,
    setupColumnToggle,
    ensureStyles
  };

  console.log('✅ TableKit Standard geladen (Sportschützen Muhen UI Toolkit)');
})();
