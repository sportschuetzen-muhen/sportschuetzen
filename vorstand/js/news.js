// News KI - Logik
document.addEventListener('DOMContentLoaded', () => {
    const fotoInput = document.getElementById('news-foto');
    const cameraInput = document.getElementById('news-foto-camera');
    const previewContainer = document.getElementById('news-preview-container');
    const countBadge = document.getElementById('news-foto-count');
    let base64Images = [];

    async function handleFilesSelected(filesList) {
        const files = Array.from(filesList || []);
        if (!files || files.length === 0) return;

        showToast(`${files.length} Foto(s) werden verarbeitet...`, "info");
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            try {
                const base64 = await resizeAndEncodeImage(file);
                base64Images.push(base64);
            } catch(err) {
                console.error("Fehler beim Verarbeiten des Bildes:", err);
            }
        }
        renderNewsPhotoPreviews();
    }

    if (fotoInput) {
        fotoInput.addEventListener('change', (e) => {
            handleFilesSelected(e.target.files);
            fotoInput.value = '';
        });
    }

    if (cameraInput) {
        cameraInput.addEventListener('change', (e) => {
            handleFilesSelected(e.target.files);
            cameraInput.value = '';
        });
    }

    function renderNewsPhotoPreviews() {
        if (!previewContainer) return;
        if (countBadge) {
            countBadge.textContent = `${base64Images.length} ${base64Images.length === 1 ? 'Foto' : 'Fotos'}`;
            countBadge.className = `badge ${base64Images.length > 0 ? 'bg-primary' : 'bg-secondary'}`;
        }

        if (base64Images.length === 0) {
            previewContainer.style.display = 'none';
            previewContainer.innerHTML = '';
            return;
        }

        previewContainer.style.display = 'flex';
        previewContainer.innerHTML = base64Images.map((b64, idx) => {
            const isCover = (idx === 0);
            return `
                <div class="col-6 col-md-4 col-lg-3">
                    <div class="card h-100 ${isCover ? 'border-primary border-2 shadow-sm' : 'border'}">
                        <div class="position-relative">
                            <img src="${b64}" class="card-img-top" style="height: 130px; object-fit: cover;" alt="Foto ${idx + 1}">
                            ${isCover ? '<span class="badge bg-primary position-absolute top-0 start-0 m-1 shadow-sm"><i class="fas fa-star me-1"></i>Titelbild</span>' : ''}
                            <button type="button" class="btn btn-sm btn-danger position-absolute top-0 end-0 m-1 py-0 px-2 shadow-sm" onclick="removeNewsPhoto(${idx})" title="Foto entfernen">
                                <i class="fas fa-trash-alt"></i>
                            </button>
                        </div>
                        <div class="card-body p-2 text-center bg-white">
                            ${isCover 
                                ? '<span class="text-primary fw-bold small"><i class="fas fa-check-circle me-1"></i>Aufmacher & IG</span>' 
                                : `<button type="button" class="btn btn-sm btn-outline-primary w-100 py-0 small" onclick="setCoverPhoto(${idx})" title="Als Aufmacher und Instagram-Bild festlegen">
                                    <i class="fas fa-star me-1"></i>Als Titelbild
                                   </button>`
                            }
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    window.setCoverPhoto = function(idx) {
        if (idx <= 0 || idx >= base64Images.length) return;
        const chosen = base64Images.splice(idx, 1)[0];
        base64Images.unshift(chosen);
        renderNewsPhotoPreviews();
        showToast("Titelbild geändert! Dieses Foto wird für Instagram und als Aufmacher verwendet.", "success");
    };

    window.removeNewsPhoto = function(idx) {
        if (idx < 0 || idx >= base64Images.length) return;
        base64Images.splice(idx, 1);
        renderNewsPhotoPreviews();
    };

    function resizeAndEncodeImage(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(event) {
                const img = new Image();
                img.onload = function() {
                    const canvas = document.createElement('canvas');
                    const MAX_DIM = 1200;
                    let width = img.width;
                    let height = img.height;

                    if (width > height) {
                        if (width > MAX_DIM) {
                            height = Math.round(height * (MAX_DIM / width));
                            width = MAX_DIM;
                        }
                    } else {
                        if (height > MAX_DIM) {
                            width = Math.round(width * (MAX_DIM / height));
                            height = MAX_DIM;
                        }
                    }

                    // Instagram-Kompatibilität für Seitenverhältnis (Min: 4:5 = 0.8, Max: 1.91:1)
                    // Smartphone-Fotos (z. B. 9:16) werden seitlich zentriert aufgefüllt
                    const currentRatio = width / height;
                    if (currentRatio < 0.8) {
                        const targetWidth = Math.round(height * 0.8);
                        canvas.width = targetWidth;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, targetWidth, height);
                        const offsetX = Math.round((targetWidth - width) / 2);
                        ctx.drawImage(img, offsetX, 0, width, height);
                    } else if (currentRatio > 1.91) {
                        const targetHeight = Math.round(width / 1.91);
                        canvas.width = width;
                        canvas.height = targetHeight;
                        const ctx = canvas.getContext('2d');
                        ctx.fillStyle = '#ffffff';
                        ctx.fillRect(0, 0, width, targetHeight);
                        const offsetY = Math.round((targetHeight - height) / 2);
                        ctx.drawImage(img, 0, offsetY, width, height);
                    } else {
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                    }
                    
                    resolve(canvas.toDataURL('image/jpeg', 0.85));
                };
                img.onerror = reject;
                img.src = event.target.result;
            };
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

        // Dynamische Modelle von Google abrufen (mit Session-Cache)
        window.initDynamicModels = async function(selectElement, descElement, defaultModel = 'gemini-2.5-flash', module = 'news') {
            try {
                let models = window._cachedGeminiModels;
                if (!models) {
                    const res = await apiFetch(module, 'action=list_models');
                    if (!res.ok) throw new Error("API request failed");
                    const data = await res.json();
                    if (data.success && data.models && data.models.length > 0) {
                        models = data.models;
                        window._cachedGeminiModels = models;
                    }
                }
                if (models && models.length > 0) {
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
                    const activeModels = models.filter(m => !m.name.includes('gemini-1.5') && !m.name.includes('gemini-1.0'));

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

        // Kein vorzeitiger Abruf bei DOMContentLoaded - lädt erst bei initNewsView (Lazy Loading)
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
            const cleanedHtml = cleanHtmlContent(finalHtml) || finalHtml;

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

            const postToWebsite = document.getElementById('news-post-website') ? document.getElementById('news-post-website').checked : true;
            const postToInstagram = document.getElementById('news-post-instagram') ? document.getElementById('news-post-instagram').checked : true;
            const postToFacebook = document.getElementById('news-post-facebook') ? document.getElementById('news-post-facebook').checked : true;

            try {
                const response = await apiFetch('news', 'action=publish', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: title,
                        author: author,
                        html: cleanedHtml, // Den bereinigten HTML-Text senden!
                        images: base64Images, // Jetzt werden die Bilder für den GitHub Upload gesendet
                        postToWebsite: postToWebsite,
                        postToInstagram: postToInstagram,
                        postToFacebook: postToFacebook
                    })
                });

                if (!response.ok) {
                    const errData = await response.json().catch(() => ({}));
                    throw new Error(errData.error || `HTTP Error ${response.status}`);
                }

                const resData = await response.json();
                
                // Detailliertes Veröffentlichungs-Protokoll rendern
                const resultBox = document.getElementById('news-publish-result');
                let hasError = false;

                if (resultBox) {
                    resultBox.classList.remove('d-none');
                    let htmlList = '';
                    
                    if (resData.socialLog && resData.socialLog.length > 0) {
                        resData.socialLog.forEach(log => {
                            const isErr = log.includes("Fehler") || log.includes("Verbindungsfehler");
                            const isDeact = log.includes("Deaktiviert") || log.includes("Übersprungen");
                            if (isErr) hasError = true;
                            const badge = isErr ? '<span class="badge bg-danger me-2">Fehler</span>' : (isDeact ? '<span class="badge bg-secondary me-2">Übersprungen</span>' : '<span class="badge bg-success me-2">Erfolgreich</span>');
                            htmlList += `<li class="list-group-item d-flex align-items-center">${badge}<span>${escapeHtml(log)}</span></li>`;
                        });
                    } else {
                        htmlList = '<li class="list-group-item text-success fw-bold">✅ Bericht erfolgreich verarbeitet.</li>';
                    }

                    resultBox.innerHTML = `
                        <div class="card border-${hasError ? 'warning' : 'success'} shadow-sm">
                            <div class="card-header bg-${hasError ? 'warning text-dark' : 'success text-white'} fw-bold d-flex justify-content-between align-items-center">
                                <span><i class="fas fa-bullhorn me-2"></i>Veröffentlichungs-Protokoll</span>
                                <button type="button" class="btn-close ${hasError ? '' : 'btn-close-white'}" onclick="document.getElementById('news-publish-result').classList.add('d-none')"></button>
                            </div>
                            <ul class="list-group list-group-flush">
                                ${htmlList}
                            </ul>
                        </div>
                    `;
                    resultBox.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }

                if (hasError) {
                    showToast("Bericht verarbeitet, aber Social-Media-Fehler aufgetreten. Siehe Protokoll.", "warning");
                } else {
                    showToast("Bericht erfolgreich publiziert!", "success");
                }
                
                // Formular & Bilder zurücksetzen
                document.getElementById('newsForm').reset();
                draftContainer.style.display = 'none';
                draftEditor.innerHTML = '';
                publishBtn.classList.add('d-none');
                base64Images = [];
                renderNewsPhotoPreviews();
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

    // --- SOCIAL MEDIA VERBINDUNGSTEST (INSTAGRAM & FACEBOOK) ---
    window.checkSocialMediaStatus = async function() {
        const btn = document.getElementById('news-check-social-btn');
        const infoDiv = document.getElementById('news-social-status-info');
        if (!infoDiv) return;

        if (btn) btn.disabled = true;
        infoDiv.classList.remove('d-none');
        infoDiv.innerHTML = '<div class="alert alert-info py-2 px-3 mb-0"><span class="spinner-border spinner-border-sm text-primary me-2"></span>Prüfe Meta-Verbindung (Instagram & Facebook)...</div>';

        try {
            const res = await apiFetch('news', 'action=test_social');
            if (!res.ok) throw new Error("HTTP Fehler " + res.status);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || "Unbekannter Fehler");

            const r = data.results;
            let html = '<div class="alert alert-secondary py-2 px-3 mb-0">';
            html += `<div><strong>Token-Status:</strong> ${r.metaTokenValid ? '<span class="text-success fw-bold">🟢 Gültig</span>' : '<span class="text-danger fw-bold">🔴 Ungültig / Abgelaufen</span>'}`;
            if (r.tokenExpires) {
                html += ` <small class="text-muted">(Ablauf: ${r.tokenExpires})</small>`;
            }
            html += '</div>';

            html += `<div class="mt-1"><strong>Instagram:</strong> `;
            if (r.instagram && r.instagram.connected) {
                html += `<span class="text-success fw-bold">🟢 Verbunden als @${escapeHtml(r.instagram.username || '')}</span> <span class="text-muted">(${escapeHtml(r.instagram.name || '')})</span>`;
            } else {
                html += `<span class="text-danger fw-bold">🔴 Nicht verbunden</span> <small class="text-danger">(${escapeHtml(r.instagram ? r.instagram.error || 'Fehler' : 'Keine Daten')})</small>`;
            }
            html += '</div>';

            html += `<div class="mt-1"><strong>Facebook:</strong> `;
            if (r.facebook && r.facebook.connected) {
                html += `<span class="text-success fw-bold">🟢 Verbunden mit Seite "${escapeHtml(r.facebook.name || '')}"</span>`;
            } else {
                html += `<span class="text-danger fw-bold">🔴 Nicht verbunden</span> <small class="text-danger">(${escapeHtml(r.facebook ? r.facebook.error || 'Fehler' : 'Keine Daten')})</small>`;
            }
            html += '</div>';

            html += '</div>';
            infoDiv.innerHTML = html;
        } catch (err) {
            infoDiv.innerHTML = `<div class="alert alert-danger py-2 px-3 mb-0">❌ Verbindungstest fehlgeschlagen: ${escapeHtml(err.message)}</div>`;
        } finally {
            if (btn) btn.disabled = false;
        }
    };
});
