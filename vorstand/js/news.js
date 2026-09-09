// News KI - Logik
document.addEventListener('DOMContentLoaded', () => {
    const fotoInput = document.getElementById('news-foto');
    const previewContainer = document.getElementById('news-preview-container');
    const icon = document.getElementById('news-upload-icon');
    const text = document.getElementById('news-upload-text');
    let base64Images = [];

    if (fotoInput) {
        fotoInput.addEventListener('change', async function(e) {
            const files = Array.from(e.target.files);
            if (!files || files.length === 0) {
                base64Images = [];
                if (previewContainer) previewContainer.style.display = 'none';
                icon.style.display = 'inline-block';
                text.style.display = 'block';
                return;
            }

            icon.style.display = 'none';
            text.style.display = 'none';
            if (previewContainer) {
                previewContainer.style.display = 'flex';
                previewContainer.innerHTML = '';
            }
            base64Images = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                try {
                    const base64 = await resizeAndEncodeImage(file);
                    base64Images.push(base64);
                    
                    if (previewContainer) {
                        const img = document.createElement('img');
                        img.src = base64;
                        img.className = 'img-fluid rounded';
                        img.style.maxHeight = '120px';
                        img.style.objectFit = 'cover';
                        // Highlight first image
                        if (i === 0) {
                            img.style.border = '3px solid var(--primary)';
                            img.title = 'Aufmacher / Titelbild';
                        }
                        previewContainer.appendChild(img);
                    }
                } catch(err) {
                    console.error("Error processing image:", err);
                }
            }
        });
    }

    function resizeAndEncodeImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX_WIDTH = 1000;
                    const MAX_HEIGHT = 1000;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_WIDTH) {
                            height *= MAX_WIDTH / width;
                            width = MAX_WIDTH;
                        }
                    } else {
                        if (height > MAX_HEIGHT) {
                            width *= MAX_HEIGHT / height;
                            height = MAX_HEIGHT;
                        }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    resolve(canvas.toDataURL('image/jpeg', 0.8));
                }
                img.onerror = reject;
                img.src = event.target.result;
            }
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // --- KI-MODELL AUSWAHL & ERKLÄRUNG ---
    const modelSelect = document.getElementById('news-model');
    const modelDesc = document.getElementById('news-model-desc');
    if (modelSelect && modelDesc) {
        modelSelect.addEventListener('change', () => {
            const selectedOption = modelSelect.options[modelSelect.selectedIndex];
            const info = selectedOption.getAttribute('data-info') || '';
            modelDesc.textContent = info;
        });

        // Dynamische Modelle von Google abrufen
        window.initDynamicModels = async function(selectElement, descElement, defaultModel = 'gemini-2.5-flash', module = 'news') {
            try {
                const res = await apiFetch(module, 'action=list_models');
                if (!res.ok) throw new Error("API request failed");
                const data = await res.json();
                if (data.success && data.models && data.models.length > 0) {
                    const modelInfos = {
                        'gemini-2.5-flash': 'Hervorragende Qualität, beste Bildanalyse. Ideal für Berichte mit Bildern. (Tageslimit-anfälliger)',
                        'gemini-2.0-flash-lite': 'Sehr schnell und hohe Kapazitätsgrenzen. Gut bei Quotenüberschreitungen des Standardmodells.',
                        'gemini-2.5-pro': 'Höchste logische Qualität und beste Erkennungsrate, aber langsamer.'
                    };

                    const recommendedNames = {
                        'gemini-2.5-flash': 'Gemini 2.5 Flash (Empfohlen / Standard)',
                        'gemini-2.0-flash-lite': 'Gemini 2.0 Flash Lite (Lite / Höchste Kapazität)',
                        'gemini-2.5-pro': 'Gemini 2.5 Pro (Höchste Genauigkeit)'
                    };

                    // Exclude legacy/deprecated models containing 1.5 or 1.0
                    const activeModels = data.models.filter(m => !m.name.includes('gemini-1.5') && !m.name.includes('gemini-1.0'));

                    // Sortiere Modelle: Moderne/Empfohlene Modelle (Flash/Pro/Lite) zuerst, danach andere
                    const sortedModels = activeModels.sort((a, b) => {
                        const hasA = (recommendedNames[a.name] || a.name.includes('flash') || a.name.includes('pro')) ? 1 : 0;
                        const hasB = (recommendedNames[b.name] || b.name.includes('flash') || b.name.includes('pro')) ? 1 : 0;
                        if (hasA !== hasB) return hasB - hasA;
                        return a.name.localeCompare(b.name);
                    });

                    const prevValue = selectElement.value;
                    selectElement.innerHTML = sortedModels.map(m => {
                        let displayName = recommendedNames[m.name] || m.displayName || m.name;
                        
                        // Dynamisches Tagging für neue/unbekannte Modelle
                        if (!recommendedNames[m.name]) {
                            if (m.name.includes('flash-lite') || m.name.includes('lite')) {
                                displayName = `${m.displayName || m.name} (Lite / Höchste Kapazität)`;
                            } else if (m.name.includes('flash')) {
                                displayName = `${m.displayName || m.name} (Schnell / Standard)`;
                            } else if (m.name.includes('pro')) {
                                displayName = `${m.displayName || m.name} (Premium / Höchste Präzision)`;
                            }
                        }

                        const info = modelInfos[m.name] || m.description || 'Verfügbares Modell von Google Gemini.';
                        const isSelected = m.name === (prevValue || defaultModel) ? 'selected' : '';
                        return `<option value="${escapeHtml(m.name)}" data-info="${escapeHtml(info)}" ${isSelected}>${escapeHtml(displayName)}</option>`;
                    }).join('');

                    if (descElement) {
                        const selectedOption = selectElement.options[selectElement.selectedIndex];
                        if (selectedOption) {
                            descElement.textContent = selectedOption.getAttribute('data-info') || '';
                        }
                    }
                }
            } catch (err) {
                console.warn("Konnte Modelle nicht dynamisch von Google laden:", err);
            }
        };

        window.initDynamicModels(modelSelect, modelDesc, 'gemini-2.5-flash', 'news');
    }

    // --- DRAFT MODE: GENERIEREN ---
    const generateBtn = document.getElementById('news-generate-btn');
    const publishBtn = document.getElementById('news-publish-btn');
    const draftContainer = document.getElementById('news-draft-container');
    const draftEditor = document.getElementById('news-draft-editor');

    if (generateBtn) {
        generateBtn.addEventListener('click', async (e) => {
            const title = document.getElementById('news-title').value;
            const keywords = document.getElementById('news-keywords').value;
            
            if (!title || !keywords) {
                showToast("Bitte Titel und Stichworte eingeben.", "warning");
                return;
            }

            const btnText = document.getElementById('news-btn-text');
            const spinner = document.getElementById('news-spinner');

            generateBtn.disabled = true;
            btnText.classList.add('d-none');
            spinner.classList.remove('d-none');
            draftContainer.style.display = 'none';
            publishBtn.classList.add('d-none');

            try {
                const useImageContent = document.getElementById('news-use-image-content') ? document.getElementById('news-use-image-content').checked : true;
                const selectedModel = modelSelect ? modelSelect.value : 'gemini-2.5-flash';
                
                const response = await apiFetch('news', 'action=generate', {
                    method: 'POST',
                    body: JSON.stringify({
                        keywords: keywords,
                        images: base64Images,
                        useImageContent: useImageContent,
                        model: selectedModel
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP Error ${response.status}`);
                }

                const data = await response.json();
                
                // Entwurf anzeigen
                draftEditor.innerHTML = data.html;
                draftContainer.style.display = 'block';
                publishBtn.classList.remove('d-none'); // Jetzt Publizieren Button einblenden
                
                showToast("Entwurf generiert! Bitte prüfen und ggf. anpassen.", "success");
                
            } catch (err) {
                console.error(err);
                if (err.message === 'QUOTA_EXCEEDED' || err.message.includes('limit') || err.message.includes('quota') || err.message.includes('Quota exceeded') || err.message.includes('RESOURCE_EXHAUSTED')) {
                    // Hole Alternativen aus dem Dropdown, falls vorhanden
                    let alternatives = [];
                    if (modelSelect) {
                        Array.from(modelSelect.options).forEach(opt => {
                            if (opt.value !== selectedModel) {
                                const cleanName = opt.text.split(" (")[0];
                                alternatives.push(cleanName);
                            }
                        });
                    }
                    const altText = alternatives.length > 0 ? ` (z. B. ${alternatives.slice(0, 3).map(a => `'${a}'`).join(' oder ')})` : "";
                    showToast(`Kapazitätsengpass beim gewählten Modell! Bitte wähle ein alternatives Modell${altText} und versuche es erneut.`, "warning");
                    if (modelSelect) {
                        modelSelect.classList.add('border-warning');
                        modelSelect.focus();
                        setTimeout(() => modelSelect.classList.remove('border-warning'), 5000);
                    }
                } else {
                    showToast("Fehler beim Generieren: " + err.message, "danger");
                }
            } finally {
                generateBtn.disabled = false;
                btnText.classList.remove('d-none');
                spinner.classList.add('d-none');
            }
        });
    }

    // --- DRAFT MODE: DEFINITIV PUBLIZIEREN ---
    if (publishBtn) {
        publishBtn.addEventListener('click', async (e) => {
            const title = document.getElementById('news-title').value;
            const finalHtml = draftEditor.innerHTML;

            if (!finalHtml || finalHtml.trim() === '') {
                showToast("Der Entwurf ist leer.", "warning");
                return;
            }

            // HTML bereinigen (Absätze normalisieren, Divs konvertieren, leere Tags entfernen)
            const cleanedHtml = cleanHtmlContent(finalHtml);

            let author = "Vorstand";
            if (window.currentUser) {
                author = window.currentUser;
            } else if (localStorage.getItem('portal_user')) {
                author = localStorage.getItem('portal_user');
            }
            
            const btnText = document.getElementById('news-publish-btn-text');
            const spinner = document.getElementById('news-publish-spinner');

            publishBtn.disabled = true;
            generateBtn.disabled = true;
            btnText.classList.add('d-none');
            spinner.classList.remove('d-none');

            try {
                const response = await apiFetch('news', 'action=publish', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: title,
                        author: author,
                        html: cleanedHtml, // Den bereinigten HTML-Text senden!
                        images: base64Images // Jetzt werden die Bilder für den GitHub Upload gesendet
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP Error ${response.status}`);
                }

                const resData = await response.json();
                
                if (resData.socialLog && resData.socialLog.length > 0) {
                    let logDetails = "";
                    let hasError = false;
                    resData.socialLog.forEach(log => {
                        if (log.includes("Fehler") || log.includes("Verbindungsfehler")) {
                            hasError = true;
                            logDetails += `\n❌ ${log}`;
                        } else {
                            logDetails += `\n✅ ${log}`;
                        }
                    });

                    if (hasError) {
                        showToast(`Bericht publiziert, aber Social Media fehlgeschlagen:${logDetails}`, "warning");
                    } else {
                        showToast(`Bericht und Social Media erfolgreich publiziert:${logDetails}`, "success");
                    }
                } else {
                    showToast("Bericht erfolgreich publiziert!", "success");
                }
                
                // Reset form
                document.getElementById('newsForm').reset();
                draftContainer.style.display = 'none';
                draftEditor.innerHTML = '';
                publishBtn.classList.add('d-none');
                if (previewContainer) {
                    previewContainer.style.display = 'none';
                    previewContainer.innerHTML = '';
                }
                icon.style.display = 'inline-block';
                text.style.display = 'block';
                base64Images = [];
                const docTextEl = document.getElementById('news-doc-text');
                if (docTextEl) {
                    docTextEl.innerText = "Klicken Sie hier, um eine Word-Datei (.docx) hochzuladen.";
                }
                window.switchNewsMode('ki');
                
            } catch (err) {
                console.error(err);
                showToast("Fehler beim Publizieren: " + err.message, "danger");
            } finally {
                publishBtn.disabled = false;
                generateBtn.disabled = false;
                btnText.classList.remove('d-none');
                spinner.classList.add('d-none');
            }
        });
    }

    // --- TAB-UMSCHALTER (KI vs DOKUMENT) - ZUVERLÄSSIG & DETERMINISTISCH ---
    window.switchNewsMode = function(mode) {
        const generateBtn = document.getElementById('news-generate-btn');
        const publishBtn = document.getElementById('news-publish-btn');
        const draftContainer = document.getElementById('news-draft-container');
        const keywordsTextarea = document.getElementById('news-keywords');
        const kiTab = document.getElementById('ki-tab');
        const docTab = document.getElementById('doc-tab');
        const kiPanel = document.getElementById('ki-panel');
        const docPanel = document.getElementById('doc-panel');
        const draftEditor = document.getElementById('news-draft-editor');

        if (mode === 'ki') {
            // Tab Buttons anpassen
            if (kiTab) {
                kiTab.classList.add('active', 'text-primary');
                kiTab.classList.remove('text-muted');
                kiTab.setAttribute('aria-selected', 'true');
            }
            if (docTab) {
                docTab.classList.remove('active', 'text-primary');
                docTab.classList.add('text-muted');
                docTab.setAttribute('aria-selected', 'false');
            }
            
            // Tab Pane 1 anzeigen, Tab Pane 2 ausblenden
            if (kiPanel) {
                kiPanel.classList.add('active', 'show');
                kiPanel.style.display = 'block';
            }
            if (docPanel) {
                docPanel.classList.remove('active', 'show');
                docPanel.style.display = 'none';
            }
            
            // KI-Generieren Button anzeigen
            if (generateBtn) generateBtn.classList.remove('d-none');
            
            // Publizieren-Button nur zeigen wenn bereits Text im Entwurf vorhanden ist
            if (publishBtn) {
                if (draftEditor && draftEditor.innerHTML.trim() !== '') {
                    publishBtn.classList.remove('d-none');
                } else {
                    publishBtn.classList.add('d-none');
                }
            }
            
            // Im KI-Modus: Stichworte sind Pflicht
            if (keywordsTextarea) keywordsTextarea.setAttribute('required', 'true');
        } else {
            // Tab Buttons anpassen
            if (docTab) {
                docTab.classList.add('active', 'text-primary');
                docTab.classList.remove('text-muted');
                docTab.setAttribute('aria-selected', 'true');
            }
            if (kiTab) {
                kiTab.classList.remove('active', 'text-primary');
                kiTab.classList.add('text-muted');
                kiTab.setAttribute('aria-selected', 'false');
            }

            // Tab Pane 2 anzeigen, Tab Pane 1 ausblenden
            if (docPanel) {
                docPanel.classList.add('active', 'show');
                docPanel.style.display = 'block';
            }
            if (kiPanel) {
                kiPanel.classList.remove('active', 'show');
                kiPanel.style.display = 'none';
            }

            // KI-Generieren Button im Fertigtext-Modus ausblenden
            if (generateBtn) generateBtn.classList.add('d-none');
            
            // Im Fertigtext-Modus den Editor direkt einblenden für Strg+V oder Word-Import
            if (draftContainer) draftContainer.style.display = 'block';

            // Publizieren-Button anzeigen falls schon Text vorhanden ist
            if (publishBtn) {
                if (draftEditor && draftEditor.innerHTML.trim() !== '') {
                    publishBtn.classList.remove('d-none');
                } else {
                    publishBtn.classList.add('d-none');
                }
            }
            
            // Stichworte im Dokumenten-Modus nicht verpflichtend
            if (keywordsTextarea) keywordsTextarea.removeAttribute('required');
        }
    };

    // Zusätzliche Event-Listener für saubere Tab-Klicks registrieren
    const kiTabBtn = document.getElementById('ki-tab');
    const docTabBtn = document.getElementById('doc-tab');
    if (kiTabBtn) {
        kiTabBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchNewsMode('ki');
        });
    }
    if (docTabBtn) {
        docTabBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchNewsMode('doc');
        });
    }

    // Initialisierungs-Helfer beim Aufruf des Moduls
    window.initNewsView = function() {
        const docTab = document.getElementById('doc-tab');
        const isDocActive = docTab && docTab.classList.contains('active');
        window.switchNewsMode(isDocActive ? 'doc' : 'ki');

        const modelSelect = document.getElementById('news-model');
        const modelDesc = document.getElementById('news-model-desc');
        if (modelSelect && modelSelect.options.length <= 3 && typeof window.initDynamicModels === 'function') {
            window.initDynamicModels(modelSelect, modelDesc, 'gemini-2.5-flash', 'news');
        }
    };

    // Live-Überwachung des Editors für den Veröffentlichen-Button
    const editorEl = document.getElementById('news-draft-editor');
    if (editorEl) {
        editorEl.addEventListener('input', () => {
            const pubBtn = document.getElementById('news-publish-btn');
            const docTabBtn = document.getElementById('doc-tab');
            const isDocMode = docTabBtn && docTabBtn.classList.contains('text-primary');
            if (pubBtn && isDocMode) {
                if (editorEl.innerText.trim() !== '') {
                    pubBtn.classList.remove('d-none');
                } else {
                    pubBtn.classList.add('d-none');
                }
            }
        });
    }

    // --- NEU: DOKUMENT UPLOAD (PDF / WORD) ---
    const docInput = document.getElementById('news-doc-file');
    const docSpinner = document.getElementById('news-doc-spinner');
    const docIcon = document.getElementById('news-doc-icon');
    const docTextEl = document.getElementById('news-doc-text');
    const titleInput = document.getElementById('news-title');

    if (docInput) {
        docInput.addEventListener('change', async function(e) {
            const file = e.target.files[0];
            if (!file) return;

            const filename = file.name;
            const lowerName = filename.toLowerCase();

            // Check if .doc (old Word format)
            if (lowerName.endsWith('.doc')) {
                showToast("Das alte Word-Format (.doc) wird nicht unterstützt. Bitte speichere die Datei in Word als '.docx' ab.", "warning");
                docInput.value = "";
                return;
            }

            // Reject PDF explicitly with explanatory note
            if (lowerName.endsWith('.pdf')) {
                showToast("PDF-Dateien werden nicht unterstützt, da PDFs keine Formatierungen (Fett, Kursiv, Absätze) übernehmen. Bitte verwende Word (.docx) oder kopiere den Text direkt per Strg+V ein.", "warning");
                docInput.value = "";
                return;
            }

            if (!lowerName.endsWith('.docx')) {
                showToast("Nur Word-Dateien (.docx) sind erlaubt. Alternativ kannst du den Text unten direkt per Strg+V einfügen.", "warning");
                docInput.value = "";
                return;
            }

            // Show loading state
            if (docSpinner) docSpinner.classList.remove('d-none');
            if (docIcon) docIcon.style.display = 'none';
            if (docTextEl) docTextEl.innerText = "Lese Word-Datei aus...";

            try {
                // Extract client-side via Mammoth mit Erhalt von Fett, Kursiv, Überschriften, Aufzählungen
                const finalHtml = await extractHtmlFromDocx(file);
                const plainTextForTitle = finalHtml.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

                if (!finalHtml || finalHtml.trim() === "") {
                    throw new Error("Es konnte kein Text aus der Word-Datei extrahiert werden.");
                }

                const draftEditor = document.getElementById('news-draft-editor');
                const draftContainer = document.getElementById('news-draft-container');
                const publishBtn = document.getElementById('news-publish-btn');

                if (draftEditor && draftContainer) {
                    draftEditor.innerHTML = finalHtml;
                    draftContainer.style.display = 'block';
                    
                    // Show publish button directly since the document text is finished
                    if (publishBtn) publishBtn.classList.remove('d-none');
                }

                // Try to suggest a title if the title input is empty
                if (titleInput && (!titleInput.value || titleInput.value.trim() === "")) {
                    const suggestedTitle = suggestTitleFromText(plainTextForTitle);
                    if (suggestedTitle) {
                        titleInput.value = suggestedTitle;
                        showToast("Word-Text erfolgreich mit Formatierung eingelesen! Titel vorgeschlagen.", "success");
                    } else {
                        showToast("Word-Text erfolgreich mit Formatierung eingelesen!", "success");
                    }
                } else {
                    showToast("Word-Text erfolgreich mit Formatierung eingelesen!", "success");
                }

            } catch (err) {
                console.error("Dokument-Auslese Fehler:", err);
                showToast("Fehler beim Einlesen der Word-Datei: " + err.message, "danger");
            } finally {
                // Clear loading state
                if (docSpinner) docSpinner.classList.add('d-none');
                if (docIcon) docIcon.style.display = 'inline-block';
                if (docTextEl) {
                    const draftEditor = document.getElementById('news-draft-editor');
                    if (draftEditor && draftEditor.innerHTML.trim() !== "") {
                        docTextEl.innerHTML = `Eingelesen: <strong class="text-success">${escapeHtml(filename)}</strong>. Erneut klicken zum Ändern.`;
                    } else {
                        docTextEl.innerText = "Klicken Sie hier, um eine Word-Datei (.docx) hochzuladen.";
                    }
                }
                docInput.value = "";
            }
        });
    }

    // Helper functions for Word extraction & title suggestion
    function extractHtmlFromDocx(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                if (typeof mammoth === "undefined") {
                    reject(new Error("Die Mammoth.js-Bibliothek ist nicht geladen."));
                    return;
                }
                mammoth.convertToHtml({ arrayBuffer: arrayBuffer })
                    .then(function(result) {
                        resolve(result.value || "");
                    })
                    .catch(function(err) {
                        reject(new Error("Fehler beim Konvertieren der Word-Datei: " + err.message));
                    });
            };
            reader.onerror = function() {
                reject(new Error("Fehler beim Lesen der Datei vom Dateisystem."));
            };
            reader.readAsArrayBuffer(file);
        });
    }

    function suggestTitleFromText(text) {
        if (!text) return "";
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        for (let i = 0; i < Math.min(4, lines.length); i++) {
            const line = lines[i];
            // Skip dates (e.g. 29.06.2026 or Thun 29.06.2026)
            if (/^\d{1,2}\.\d{1,2}\.\d{2,4}$/.test(line) || 
                /^[A-Za-z]+ \d{1,2}\.\d{1,2}\.\d{2,4}$/.test(line) ||
                /^\d{4}-\d{2}-\d{2}$/.test(line)) {
                continue;
            }
            if (line.length >= 8 && line.length <= 120) {
                return line;
            }
        }
        return "";
    }

    // --- NEU: RICHTEXT FORMATIERUNG IM EDITOR ---
    window.formatDoc = function(cmd, value = null) {
        if (cmd === 'createLink') {
            const url = prompt('URL für den Link eingeben (z. B. https://example.com):');
            if (url) {
                // Ensure protocol is present
                let targetUrl = url.trim();
                if (!/^https?:\/\//i.test(targetUrl) && !/^\//.test(targetUrl)) {
                    targetUrl = 'https://' + targetUrl;
                }
                document.execCommand(cmd, false, targetUrl);
            }
        } else {
            document.execCommand(cmd, false, value);
        }
        
        // Editor wieder fokussieren
        const editor = document.getElementById('news-draft-editor');
        if (editor) {
            editor.focus();
        }
    };

    // Hilfsfunktion: Bereinigt HTML vor dem Upload (normalisiert Divs zu Paragraph-Tags und regelt Zeilenumbrüche)
    function cleanHtmlContent(html) {
        if (!html) return "";
        let clean = html.trim();
        
        // Divs (von Chrome/Edge) zu Paragraphen
        clean = clean.replace(/<div[^>]*>/gi, '<p>').replace(/<\/div>/gi, '</p>');
        
        // Mehrfache brs (von Firefox) zu Paragraphen-Grenzen konvertieren
        clean = clean.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>');
        
        // Einzelne Brs am Ende von Paragraphen entfernen
        clean = clean.replace(/<br\s*\/?>\s*<\/p>/gi, '</p>');
        
        // Leere Absätze löschen (z.B. <p></p>, <p><br></p>, <p>&nbsp;</p>)
        clean = clean.replace(/<p>\s*(<br\s*\/?>|&nbsp;)?\s*<\/p>/gi, '');
        
        return clean;
    }
});
