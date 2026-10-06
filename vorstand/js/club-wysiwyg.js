/**
 * club-wysiwyg.js
 * ==============================================================================
 * Globaler Vereins-WYSIWYG-Editor für Sportschützen Muhen
 * Projekt: Vereinsportal Sportschützen Muhen
 *
 * Stellt window.ClubWysiwyg bereit für:
 * - News KI (Webseiten-Berichte)
 * - Dokumente & Vorlagen (E-Mail-Vorlagen, Begleittexte)
 * - Generalversammlung (Einladungs- & Kampagnen-Mails)
 * - Vorstandsbriefe & Rundschreiben
 *
 * Features:
 * - Typografie-Richtlinie: Fett, Kursiv, Listen, Links, H2/H3 (kein Unterstreichen im Fließtext)
 * - Undo / Redo / Formatierung entfernen (Reset)
 * - Intelligentes H3-Toggle (Absatz <-> Überschrift)
 * - Callout- / Alert-Banner: Info (Blau), Frist (Grün), Hinweis (Gelb), Dringend (Rot)
 *   (Übernahme selektierten Textes, keine festen Dummy-Sätze)
 * - Call-to-Action (CTA) Buttons (Mobile-optimierte HTML-Buttons mit geschütztem Container)
 * - Platzhalter-Pills / Dropdown: Klickbare {{...}}-Variablen an Cursor-Position
 * - Word-/Outlook-Paste-Filter & DOM-basierte HTML-Bereinigung
 * ==============================================================================
 */

(function () {
    'use strict';

    const BANNER_PRESETS = [
        {
            type: 'info',
            label: 'Info-Banner (Blau)',
            title: 'Information',
            icon: 'fa-info-circle',
            bg: '#eff6ff',
            border: '#3b82f6',
            textColor: '#1e3a8a'
        },
        {
            type: 'success',
            label: 'Frist- / Termin-Banner (Grün)',
            title: 'Frist / Anmeldeschluss',
            icon: 'fa-calendar-check',
            bg: '#f0fdf4',
            border: '#22c55e',
            textColor: '#14532d'
        },
        {
            type: 'warning',
            label: 'Wichtiger Hinweis (Gelb)',
            title: 'Wichtiger Hinweis',
            icon: 'fa-exclamation-triangle',
            bg: '#fffbeb',
            border: '#f59e0b',
            textColor: '#78350f'
        },
        {
            type: 'danger',
            label: 'Dringend / Mahnung (Rot)',
            title: 'Dringend',
            icon: 'fa-bell',
            bg: '#fef2f2',
            border: '#ef4444',
            textColor: '#7f1d1d'
        }
    ];

    class ClubWysiwygEditor {
        constructor(targetEl, options = {}) {
            this.targetEl = (typeof targetEl === 'string') ? document.querySelector(targetEl) : targetEl;
            if (!this.targetEl) {
                console.warn('[ClubWysiwyg] Ziel-Element nicht gefunden:', targetEl);
                return;
            }

            this.options = Object.assign({
                mode: 'email', // 'email' | 'news' | 'document'
                minHeight: '220px',
                placeholder: 'Text hier eingeben...',
                placeholders: [],
                onChange: null,
                enableHistory: true,
                enableBanners: true,
                enableButtons: true,
                enableHeadings: true,
                enableLists: true,
                enableLinks: true
            }, options);

            this.savedRange = null;
            this.init();
        }

        init() {
            const isTextarea = (this.targetEl.tagName === 'TEXTAREA');

            // Falls bereits initialisiert, vorherige Instanz auflösen
            if (this.targetEl._clubWysiwygInstance) {
                this.targetEl._clubWysiwygInstance.destroy();
            }

            this.wrapper = document.createElement('div');
            this.wrapper.className = 'club-wysiwyg-wrapper border rounded-3 overflow-hidden shadow-sm bg-white mb-2';

            // Toolbar erstellen
            this.toolbar = document.createElement('div');
            this.toolbar.className = 'club-wysiwyg-toolbar d-flex flex-wrap gap-1 align-items-center bg-light p-2 border-bottom';
            this.buildToolbar();

            // Editor-Bereich (contenteditable)
            this.editor = document.createElement('div');
            this.editor.className = 'club-wysiwyg-content p-3';
            this.editor.setAttribute('contenteditable', 'true');
            this.editor.style.minHeight = this.options.minHeight;
            this.editor.style.maxHeight = '500px';
            this.editor.style.overflowY = 'auto';
            this.editor.style.outline = 'none';
            this.editor.style.lineHeight = '1.6';
            this.editor.style.fontSize = '14px';
            this.editor.style.color = '#1e293b';

            // Initiale Inhalte setzen
            let initialHtml = '';
            if (isTextarea) {
                const rawVal = this.targetEl.value || '';
                // Wenn es reiner Text ist (keine HTML-Tags), in Absätze wandeln
                if (rawVal && !/<[a-z][\s\S]*>/i.test(rawVal)) {
                    initialHtml = rawVal.split(/\n\s*\n/).map(p => `<p>${escapeHtml(p.trim()).replace(/\n/g, '<br>')}</p>`).join('');
                } else {
                    initialHtml = rawVal;
                }
                this.targetEl.style.display = 'none';
                this.targetEl.parentNode.insertBefore(this.wrapper, this.targetEl);
            } else {
                initialHtml = this.targetEl.innerHTML || '';
                this.targetEl.parentNode.insertBefore(this.wrapper, this.targetEl);
                this.targetEl.style.display = 'none';
            }

            this.editor.innerHTML = initialHtml || `<p><br></p>`;

            this.wrapper.appendChild(this.toolbar);
            this.wrapper.appendChild(this.editor);

            // Events registrieren
            this.registerEvents();

            this.targetEl._clubWysiwygInstance = this;
        }

        buildToolbar() {
            let html = '';

            // Gruppe 0: Verlauf (Undo / Redo / Formatierung entfernen)
            if (this.options.enableHistory !== false) {
                html += `
                    <div class="btn-group btn-group-sm me-1">
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="undo" title="Rückgängig (Strg+Z)">
                            <i class="fas fa-undo"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="redo" title="Wiederherstellen (Strg+Y)">
                            <i class="fas fa-redo"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="removeFormat" title="Formatierung entfernen / Reset">
                            <i class="fas fa-eraser"></i>
                        </button>
                    </div>
                    <div class="vr mx-1 text-muted" style="height: 20px;"></div>
                `;
            }

            // Gruppe 1: Schriftstil (Fett, Kursiv)
            html += `
                <div class="btn-group btn-group-sm me-1">
                    <button type="button" class="btn btn-outline-secondary px-2" data-cmd="bold" title="Fett (Strg+B)">
                        <i class="fas fa-bold"></i>
                    </button>
                    <button type="button" class="btn btn-outline-secondary px-2" data-cmd="italic" title="Kursiv (Strg+I)">
                        <i class="fas fa-italic"></i>
                    </button>
                </div>
            `;

            // Gruppe 2: Absätze & Überschriften
            if (this.options.enableHeadings) {
                html += `
                    <div class="btn-group btn-group-sm me-1">
                        <button type="button" class="btn btn-outline-secondary px-2" data-action="heading-toggle" title="Überschrift (H3 umschalten / zurücknehmen)">
                            <i class="fas fa-heading"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="formatBlock" data-val="p" title="Standard-Absatz (P)">
                            <i class="fas fa-paragraph"></i>
                        </button>
                    </div>
                `;
            }

            // Gruppe 3: Listen
            if (this.options.enableLists) {
                html += `
                    <div class="btn-group btn-group-sm me-1">
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="insertUnorderedList" title="Aufzählung / Stichpunkte">
                            <i class="fas fa-list-ul"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="insertOrderedList" title="Nummerierte Liste">
                            <i class="fas fa-list-ol"></i>
                        </button>
                    </div>
                `;
            }

            // Gruppe 4: Links & Trenner
            if (this.options.enableLinks) {
                html += `
                    <div class="btn-group btn-group-sm me-1">
                        <button type="button" class="btn btn-outline-secondary px-2" data-action="link" title="Link einfügen">
                            <i class="fas fa-link"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="unlink" title="Link aufheben">
                            <i class="fas fa-unlink"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary px-2" data-action="divider" title="Trennlinie einfügen">
                            <i class="fas fa-minus"></i>
                        </button>
                    </div>
                `;
            }

            // Trennlinie in Toolbar
            html += `<div class="vr mx-1 text-muted" style="height: 20px;"></div>`;

            // Gruppe 5: Banner / Callout-Boxen
            if (this.options.enableBanners) {
                html += `
                    <div class="dropdown d-inline-block me-1">
                        <button class="btn btn-sm btn-outline-primary dropdown-toggle py-1 px-2" type="button" data-bs-toggle="dropdown" aria-expanded="false" title="Farbige Hinweis- & Frist-Banner einfügen">
                            <i class="fas fa-bullhorn me-1"></i>Banner
                        </button>
                        <ul class="dropdown-menu shadow-sm" style="font-size: 13px;">
                            ${BANNER_PRESETS.map(b => `
                                <li>
                                    <a class="dropdown-item d-flex align-items-center gap-2 py-1.5" href="javascript:void(0)" data-banner-type="${b.type}">
                                        <i class="fas ${b.icon}" style="color: ${b.border}; width: 16px;"></i>
                                        <span>${b.label}</span>
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                `;
            }

            // Gruppe 6: Call-to-Action (CTA) Button
            if (this.options.enableButtons) {
                html += `
                    <button type="button" class="btn btn-sm btn-outline-success py-1 px-2 me-1" data-action="cta-button" title="Klickbaren Aktions-Button für E-Mails einfügen (z. B. PDF-Download)">
                        <i class="fas fa-hand-pointer me-1"></i>Aktions-Button
                    </button>
                `;
            }

            // Gruppe 7: Platzhalter-Dropdown (falls vorhanden)
            if (this.options.placeholders && this.options.placeholders.length > 0) {
                html += `
                    <div class="dropdown d-inline-block ms-auto">
                        <button class="btn btn-sm btn-outline-dark dropdown-toggle py-1 px-2" type="button" data-bs-toggle="dropdown" aria-expanded="false">
                            <i class="fas fa-code me-1 text-primary"></i>{x} Platzhalter
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm" style="max-height: 280px; overflow-y: auto; font-size: 12px;">
                            ${this.options.placeholders.map(p => {
                                const tag = typeof p === 'string' ? p : p.tag;
                                const lbl = typeof p === 'string' ? p : (p.label || p.tag);
                                return `
                                    <li>
                                        <a class="dropdown-item py-1 font-monospace" href="javascript:void(0)" data-placeholder="{{${tag.replace(/[{}]/g, '')}}}">
                                            <strong>{{${tag.replace(/[{}]/g, '')}}}</strong> <span class="text-muted ms-1" style="font-size:11px;">(${escapeHtml(lbl)})</span>
                                        </a>
                                    </li>
                                `;
                            }).join('')}
                        </ul>
                    </div>
                `;
            }

            this.toolbar.innerHTML = html;
        }

        registerEvents() {
            // Mousedown auf Toolbar-Buttons verhindert Verlust des Cursors / der Text-Selektion
            this.toolbar.addEventListener('mousedown', (e) => {
                const btn = e.target.closest('button, a');
                if (btn && !btn.classList.contains('dropdown-toggle') && !btn.closest('.dropdown-menu')) {
                    e.preventDefault();
                }
            });

            // Toolbar Button Clicks
            this.toolbar.addEventListener('click', (e) => {
                const btn = e.target.closest('button, a');
                if (!btn) return;

                const cmd = btn.getAttribute('data-cmd');
                const val = btn.getAttribute('data-val');
                const act = btn.getAttribute('data-action');
                const bannerType = btn.getAttribute('data-banner-type');
                const ph = btn.getAttribute('data-placeholder');

                if (cmd) {
                    e.preventDefault();
                    this.restoreSelection();
                    document.execCommand(cmd, false, val || null);
                    this.editor.focus();
                    this.triggerChange();
                    this.updateToolbarState();
                } else if (act === 'heading-toggle') {
                    e.preventDefault();
                    this.toggleHeading();
                } else if (act === 'link') {
                    e.preventDefault();
                    this.promptLink();
                } else if (act === 'divider') {
                    e.preventDefault();
                    this.insertHtml('<hr style="border:none; border-top:1px solid #cbd5e1; margin: 20px 0;"><p><br></p>');
                } else if (act === 'cta-button') {
                    e.preventDefault();
                    this.promptCtaButton();
                } else if (bannerType) {
                    e.preventDefault();
                    this.insertBanner(bannerType);
                } else if (ph) {
                    e.preventDefault();
                    this.insertHtml(`<span style="background-color:#e0f2fe; color:#0369a1; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight:600; font-size:12px;">${escapeHtml(ph)}</span>&nbsp;`);
                }
            });

            // Caret / Selection merken und Toolbar-Zustände synchronisieren
            ['keyup', 'mouseup', 'focus'].forEach(evName => {
                this.editor.addEventListener(evName, () => {
                    this.saveSelection();
                    this.updateToolbarState();
                });
            });

            // Input / Change
            this.editor.addEventListener('input', () => {
                this.triggerChange();
                this.updateToolbarState();
            });

            // Globales selectionchange für präzise Toolbar-Zustände
            document.addEventListener('selectionchange', () => {
                if (document.activeElement === this.editor || this.editor.contains(document.activeElement)) {
                    this.saveSelection();
                    this.updateToolbarState();
                }
            });

            // Paste Event: Automatisches Bereinigen von Word/Outlook-Styles
            this.editor.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.originalEvent || e).clipboardData.getData('text/html') || (e.originalEvent || e).clipboardData.getData('text/plain');
                if (text) {
                    const cleaned = cleanHtmlContent(text);
                    this.insertHtml(cleaned);
                }
            });
        }

        saveSelection() {
            const sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                this.savedRange = sel.getRangeAt(0);
            }
        }

        restoreSelection() {
            if (this.savedRange) {
                const sel = window.getSelection();
                sel.removeAllRanges();
                sel.addRange(this.savedRange);
            }
        }

        getCurrentBlockNode() {
            const sel = window.getSelection();
            if (!sel || !sel.rangeCount) return null;
            let node = sel.anchorNode;
            while (node && node !== this.editor) {
                if (node.nodeType === 1 && /^(P|H1|H2|H3|H4|H5|H6|DIV|LI|BLOCKQUOTE)$/i.test(node.tagName)) {
                    return node;
                }
                node = node.parentNode;
            }
            return null;
        }

        toggleHeading() {
            this.restoreSelection();
            const block = this.getCurrentBlockNode();
            const isHeading = block && /^H[1-6]$/i.test(block.tagName);

            if (isHeading) {
                // Von Überschrift zurück zu Standard-Absatz
                document.execCommand('formatBlock', false, 'p');
            } else {
                // Zu H3 machen
                document.execCommand('formatBlock', false, 'h3');
            }

            this.editor.focus();
            this.triggerChange();
            this.updateToolbarState();
        }

        updateToolbarState() {
            if (!this.toolbar) return;

            const toggleBtn = (selector, isActive) => {
                const btn = this.toolbar.querySelector(selector);
                if (!btn) return;
                if (isActive) {
                    btn.classList.add('active', 'btn-primary', 'text-white');
                    btn.classList.remove('btn-outline-secondary');
                } else {
                    btn.classList.remove('active', 'btn-primary', 'text-white');
                    btn.classList.add('btn-outline-secondary');
                }
            };

            // Fett & Kursiv
            try {
                toggleBtn('[data-cmd="bold"]', document.queryCommandState('bold'));
                toggleBtn('[data-cmd="italic"]', document.queryCommandState('italic'));
                toggleBtn('[data-cmd="insertUnorderedList"]', document.queryCommandState('insertUnorderedList'));
                toggleBtn('[data-cmd="insertOrderedList"]', document.queryCommandState('insertOrderedList'));
            } catch (_) {}

            // H3 Überschrift
            const blockNode = this.getCurrentBlockNode();
            const isHeading = Boolean(blockNode && /^H[1-6]$/i.test(blockNode.tagName));
            toggleBtn('[data-action="heading-toggle"]', isHeading);
        }

        insertHtml(html) {
            this.restoreSelection();
            this.editor.focus();

            const sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                const range = sel.getRangeAt(0);
                range.deleteContents();

                const el = document.createElement('div');
                el.innerHTML = html;
                const frag = document.createDocumentFragment();
                let node, lastNode;
                while ((node = el.firstChild)) {
                    lastNode = frag.appendChild(node);
                }
                range.insertNode(frag);

                if (lastNode) {
                    const newRange = range.cloneRange();
                    newRange.setStartAfter(lastNode);
                    newRange.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(newRange);
                    this.savedRange = newRange;
                }
            } else {
                this.editor.innerHTML += html;
            }
            this.triggerChange();
            this.updateToolbarState();
        }

        promptLink() {
            this.saveSelection();
            const currentSel = window.getSelection() ? window.getSelection().toString() : '';
            const url = prompt('URL für den Link eingeben (z. B. https://sportschuetzen-muhen.ch):', 'https://');
            if (url && url !== 'https://') {
                let targetUrl = url.trim();
                if (!/^https?:\/\//i.test(targetUrl) && !/^\//.test(targetUrl)) {
                    targetUrl = 'https://' + targetUrl;
                }
                const linkText = currentSel.trim() || targetUrl;
                this.insertHtml(`<a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" style="color: #0284c7; text-decoration: underline; font-weight: 500;">${escapeHtml(linkText)}</a>`);
            }
        }

        promptCtaButton() {
            this.saveSelection();
            const selText = window.getSelection() ? window.getSelection().toString().trim() : '';

            const btnText = prompt('Beschriftung des Buttons (z. B. «GV-Dossier ansehen» oder «PDF öffnen»):', selText || 'Jetzt ansehen / öffnen');
            if (!btnText) return;

            const btnUrl = prompt('Ziel-URL oder Platzhalter (z. B. {{dossier.download_url}} oder https://...):', '{{dossier.download_url}}');
            if (!btnUrl) return;

            let targetUrl = btnUrl.trim();
            if (!/^https?:\/\//i.test(targetUrl) && !/^{{.*}}$/.test(targetUrl) && !/^\//.test(targetUrl)) {
                targetUrl = 'https://' + targetUrl;
            }

            const buttonHtml = `
                <div class="club-cta-container" style="text-align: center; margin: 24px 0; clear: both;">
                    <a href="${escapeHtml(targetUrl)}" target="_blank" rel="noopener noreferrer" 
                       style="display: inline-block; background-color: #1a3a5a; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); letter-spacing: 0.3px;">
                        ${escapeHtml(btnText.trim())} &rarr;
                    </a>
                </div><p><br></p>
            `;
            this.insertHtml(buttonHtml);
        }

        insertBanner(type) {
            const preset = BANNER_PRESETS.find(b => b.type === type) || BANNER_PRESETS[0];
            this.saveSelection();

            // Prüfen, ob der Benutzer bereits Text markiert hat
            let selectedText = '';
            const sel = window.getSelection();
            if (sel && sel.rangeCount > 0) {
                selectedText = sel.toString().trim();
            }

            const bodyContent = selectedText 
                ? escapeHtml(selectedText)
                : 'Text hier eingeben...';

            const bannerHtml = `
                <div class="club-banner-callout" style="background-color: ${preset.bg}; border-left: 4px solid ${preset.border}; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: ${preset.textColor};">
                    <strong>${preset.title}:</strong> ${bodyContent}
                </div><p><br></p>
            `;
            this.insertHtml(bannerHtml);
        }

        triggerChange() {
            const html = this.getCleanHtml();

            // Underlying Target aktualisieren
            if (this.targetEl.tagName === 'TEXTAREA') {
                this.targetEl.value = html;
                this.targetEl.dispatchEvent(new Event('input', { bubbles: true }));
            } else {
                this.targetEl.innerHTML = html;
            }

            if (typeof this.options.onChange === 'function') {
                this.options.onChange(html);
            }
        }

        getCleanHtml() {
            return cleanHtmlContent(this.editor.innerHTML);
        }

        setHtml(html) {
            this.editor.innerHTML = html || '<p><br></p>';
            this.triggerChange();
            this.updateToolbarState();
        }

        insertVariable(variableTag) {
            const cleanTag = variableTag.startsWith('{{') ? variableTag : `{{${variableTag}}}`;
            this.insertHtml(`<span style="background-color:#e0f2fe; color:#0369a1; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-weight:600; font-size:12px;">${escapeHtml(cleanTag)}</span>&nbsp;`);
        }

        destroy() {
            if (this.wrapper && this.wrapper.parentNode) {
                this.wrapper.parentNode.removeChild(this.wrapper);
            }
            if (this.targetEl) {
                this.targetEl.style.display = '';
                delete this.targetEl._clubWysiwygInstance;
            }
        }
    }

    /**
     * Zentraler HTML-Sanitizer:
     * - Bereinigt Microsoft Word- & Outlook-Tags (mso-*, <o:p>)
     * - Normalisiert Chrome <div> zu sauberen <p>-Tags via DOMParser
     * - Schützt Vereins-Banner (.club-banner-callout) und Buttons (.club-cta-container)
     * - Verhindert zerstörte oder unvollständige HTML-Tags
     */
    function cleanHtmlContent(html) {
        if (!html) return '';
        let clean = html.trim();

        // Word/Office Markup entfernen
        clean = clean.replace(/<!--[\s\S]*?-->/gi, '');
        clean = clean.replace(/<\/?o:[a-z]+[^>]*>/gi, '');
        clean = clean.replace(/class="Mso[a-zA-Z0-9]+"/gi, '');
        clean = clean.replace(/style="[^"]*mso-[^"]*"/gi, '');

        try {
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<body>${clean}</body>`, 'text/html');
            const body = doc.body;

            // Alle nicht-geschützten <div> zu <p> transformieren
            const divs = Array.from(body.querySelectorAll('div'));
            divs.forEach(div => {
                if (div.classList.contains('club-banner-callout') || div.classList.contains('club-cta-container')) {
                    return; // Geschützte Vereins-Elemente unangetastet lassen
                }
                const p = doc.createElement('p');
                p.innerHTML = div.innerHTML;
                if (div.style.textAlign) p.style.textAlign = div.style.textAlign;
                div.parentNode.replaceChild(p, div);
            });

            // Leere Spans säubern
            const spans = Array.from(body.querySelectorAll('span'));
            spans.forEach(span => {
                if (!span.textContent.trim() && !span.querySelector('*')) {
                    span.remove();
                }
            });

            clean = body.innerHTML;
        } catch (e) {
            console.warn('[ClubWysiwyg] Fehler bei DOM-Bereinigung:', e);
        }

        // Mehrfache aufeinanderfolgende <br> normalisieren
        clean = clean.replace(/(<br\s*\/?>\s*){3,}/gi, '<br><br>');

        return clean;
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // --- GLOBALE EXPORTE ---
    window.ClubWysiwyg = {
        init: function (targetEl, options) {
            return new ClubWysiwygEditor(targetEl, options);
        },
        cleanHtml: cleanHtmlContent,
        getPresets: () => BANNER_PRESETS
    };

    console.log('✅ [ClubWysiwyg] Globaler Vereins-WYSIWYG initialisiert (inkl. Undo/Redo/Format-Reset & geschütztem CTA).');
})();
