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
 * - Callout- / Alert-Banner: Info (Blau), Frist (Grün), Hinweis (Gelb), Dringend (Rot)
 * - Call-to-Action (CTA) Buttons (Mobile-optimierte HTML-Buttons für Mails)
 * - Platzhalter-Pills / Dropdown: Klickbare {{...}}-Variablen an Cursor-Position
 * - Word-/Outlook-Paste-Filter & HTML-Bereinigung
 * ==============================================================================
 */

(function () {
    'use strict';

    const BANNER_PRESETS = [
        {
            type: 'info',
            label: 'Info-Banner (Blau)',
            icon: 'fa-info-circle',
            bg: '#eff6ff',
            border: '#3b82f6',
            textColor: '#1e3a8a',
            defaultText: '<strong>Information:</strong> Bitte bringen Sie Ihr persönliches Schiessbüchlein und den Gehörschutz mit.'
        },
        {
            type: 'success',
            label: 'Frist- / Termin-Banner (Grün)',
            icon: 'fa-calendar-check',
            bg: '#f0fdf4',
            border: '#22c55e',
            textColor: '#14532d',
            defaultText: '<strong>Frist / Anmeldeschluss:</strong> Bitte um Rückmeldung bis spätestens 15. Oktober 2026.'
        },
        {
            type: 'warning',
            label: 'Wichtiger Hinweis (Gelb)',
            icon: 'fa-exclamation-triangle',
            bg: '#fffbeb',
            border: '#f59e0b',
            textColor: '#78350f',
            defaultText: '<strong>Wichtiger Hinweis:</strong> Standblattausgabe schliesst 30 Minuten vor Schiessende.'
        },
        {
            type: 'danger',
            label: 'Dringend / Mahnung (Rot)',
            icon: 'fa-bell',
            bg: '#fef2f2',
            border: '#ef4444',
            textColor: '#7f1d1d',
            defaultText: '<strong>Dringend:</strong> Letzte Frist vor Mahnstopp bzw. Anlass-Verschiebung.'
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
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="formatBlock" data-val="h3" title="Überschrift (H3)">
                            <i class="fas fa-heading"></i>
                        </button>
                        <button type="button" class="btn btn-outline-secondary px-2" data-cmd="formatBlock" data-val="p" title="Standard-Absatz">
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
            html += `<div class="vr mx-1 text-muted" style="height: 22px;"></div>`;

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
                } else if (act === 'link') {
                    e.preventDefault();
                    this.promptLink();
                } else if (act === 'divider') {
                    e.preventDefault();
                    this.insertHtml('<hr style="border:none; border-top:1px solid #cbd5e1; margin: 20px 0;">');
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

            // Caret / Selection merken
            ['keyup', 'mouseup', 'focus'].forEach(evName => {
                this.editor.addEventListener(evName, () => this.saveSelection());
            });

            // Input / Change
            this.editor.addEventListener('input', () => {
                this.triggerChange();
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
        }

        promptLink() {
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
            const btnText = prompt('Beschriftung des Buttons (z. B. «GV-Dossier herunterladen»):', 'Jetzt ansehen / herunterladen');
            if (!btnText) return;

            const btnUrl = prompt('Ziel-URL oder Platzhalter (z. B. {{dossier.download_url}}):', '{{dossier.download_url}}');
            if (!btnUrl) return;

            const buttonHtml = `
                <div style="text-align: center; margin: 24px 0;">
                    <a href="${escapeHtml(btnUrl.trim())}" target="_blank" rel="noopener noreferrer" 
                       style="display: inline-block; background-color: #1a3a5a; color: #ffffff; padding: 12px 24px; font-size: 14px; font-weight: bold; text-decoration: none; border-radius: 6px; box-shadow: 0 2px 4px rgba(0,0,0,0.15); letter-spacing: 0.3px;">
                        ${escapeHtml(btnText.trim())} &rarr;
                    </a>
                </div>
            `;
            this.insertHtml(buttonHtml);
        }

        insertBanner(type) {
            const preset = BANNER_PRESETS.find(b => b.type === type) || BANNER_PRESETS[0];
            const bannerHtml = `
                <div class="club-banner-callout" style="background-color: ${preset.bg}; border-left: 4px solid ${preset.border}; border-radius: 6px; padding: 14px 18px; margin: 18px 0; font-size: 13.5px; line-height: 1.55; color: ${preset.textColor};">
                    ${preset.defaultText}
                </div>
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
     * - Normalisiert Chrome <div> zu sauberen <p>-Tags
     * - Entfernt überflüssige leere Tags
     */
    function cleanHtmlContent(html) {
        if (!html) return '';
        let clean = html.trim();

        // Word/Office Markup entfernen
        clean = clean.replace(/<!--[\s\S]*?-->/gi, '');
        clean = clean.replace(/<\/?o:[a-z]+[^>]*>/gi, '');
        clean = clean.replace(/class="Mso[a-zA-Z0-9]+"/gi, '');
        clean = clean.replace(/style="[^"]*mso-[^"]*"/gi, '');

        // Chrome/Edge Divs zu Absätzen wandeln
        clean = clean.replace(/<div(?!\s*class=["'][^"']*club-banner[^"']*["'])[^>]*>/gi, '<p>')
                     .replace(/<\/div>/gi, '</p>');

        // Mehrfache <br> in Absätze überführen
        clean = clean.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>');

        // Unnötige <br> am Paragraphen-Ende säubern
        clean = clean.replace(/<br\s*\/?>\s*<\/p>/gi, '</p>');

        // Leere Absätze entfernen
        clean = clean.replace(/<p>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>/gi, '');

        // Leere Spans säubern
        clean = clean.replace(/<span[^>]*>\s*<\/span>/gi, '');

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

    console.log('✅ [ClubWysiwyg] Globaler Vereins-WYSIWYG initialisiert.');
})();
