// News AI - Logik
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

    // --- NEU: TAB-UMSCHALTER (KI vs DOKUMENT) ---
    window.switchNewsMode = function(mode) {
        const generateBtn = document.getElementById('news-generate-btn');
        const publishBtn = document.getElementById('news-publish-btn');
        const draftContainer = document.getElementById('news-draft-container');
        const keywordsTextarea = document.getElementById('news-keywords');
        const kiTab = document.getElementById('ki-tab');
        const docTab = document.getElementById('doc-tab');

        if (mode === 'ki') {
            if (kiTab) {
                kiTab.classList.add('text-primary');
                kiTab.classList.remove('text-muted');
            }
            if (docTab) {
                docTab.classList.add('text-muted');
                docTab.classList.remove('text-primary');
            }
            
            // Show generate button
            if (generateBtn) generateBtn.classList.remove('d-none');
            
            // Hide publish button unless there is already content in the editor
            const draftEditor = document.getElementById('news-draft-editor');
            if (draftContainer && publishBtn) {
                if (draftContainer.style.display === 'none' || !draftEditor || draftEditor.innerHTML.trim() === '') {
                    publishBtn.classList.add('d-none');
                } else {
                    publishBtn.classList.remove('d-none');
                }
            }
            
            // Make keywords required in KI mode
            if (keywordsTextarea) keywordsTextarea.setAttribute('required', 'true');
        } else {
            if (docTab) {
                docTab.classList.add('text-primary');
                docTab.classList.remove('text-muted');
            }
            if (kiTab) {
                kiTab.classList.add('text-muted');
                kiTab.classList.remove('text-primary');
            }

            // Hide generate button (not needed for ready texts)
            if (generateBtn) generateBtn.classList.add('d-none');
            
            // Show publish button if there is text in the editor
            const draftEditor = document.getElementById('news-draft-editor');
            if (publishBtn) {
                if (draftEditor && draftEditor.innerHTML.trim() !== '') {
                    publishBtn.classList.remove('d-none');
                } else {
                    publishBtn.classList.add('d-none');
                }
            }
            
            // Keywords not required in Doc mode
            if (keywordsTextarea) keywordsTextarea.removeAttribute('required');
        }
    };

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
                showToast("Fehler: Das alte Word-Format (.doc) wird nicht direkt unterstützt. Bitte speichere die Datei in Word als '.docx' oder '.pdf' ab, bevor du sie hochlädst.", "warning");
                docInput.value = "";
                return;
            }

            if (!lowerName.endsWith('.docx') && !lowerName.endsWith('.pdf')) {
                showToast("Fehler: Nur PDF- oder Word-Dateien (.docx) sind erlaubt.", "warning");
                docInput.value = "";
                return;
            }

            // Show loading state
            if (docSpinner) docSpinner.classList.remove('d-none');
            if (docIcon) docIcon.style.display = 'none';
            if (docTextEl) docTextEl.innerText = "Lese Datei aus...";

            try {
                let extractedText = "";

                if (lowerName.endsWith('.docx')) {
                    // Extract client-side via Mammoth
                    extractedText = await extractTextFromDocx(file);
                } else if (lowerName.endsWith('.pdf')) {
                    // Extract server-side via Gemini API
                    const base64Pdf = await new Promise((resolve, reject) => {
                        const reader = new FileReader();
                        reader.onload = ev => resolve(ev.target.result.split(',')[1]);
                        reader.onerror = () => reject(new Error("Fehler beim lokalen Lesen der PDF-Datei."));
                        reader.readAsDataURL(file);
                    });

                    const response = await apiFetch('news', 'action=extract_pdf', {
                        method: 'POST',
                        body: JSON.stringify({ pdfData: base64Pdf })
                    });

                    if (!response.ok) {
                        const errData = await response.json().catch(() => ({}));
                        throw new Error(errData.error || `HTTP Error ${response.status}`);
                    }

                    const data = await response.json();
                    extractedText = data.text || "";
                }

                if (!extractedText || extractedText.trim() === "") {
                    throw new Error("Es konnte kein Text aus der Datei extrahiert werden.");
                }

                extractedText = extractedText.trim();

                // Format text into HTML paragraphs
                const paragraphs = extractedText.split('\n').map(p => p.trim()).filter(p => p !== '');
                const htmlText = paragraphs.map(p => `<p>${escapeHtml(p)}</p>`).join('');

                const draftEditor = document.getElementById('news-draft-editor');
                const draftContainer = document.getElementById('news-draft-container');
                const publishBtn = document.getElementById('news-publish-btn');

                if (draftEditor && draftContainer) {
                    draftEditor.innerHTML = htmlText;
                    draftContainer.style.display = 'block';
                    
                    // Show publish button directly since the document text is finished
                    if (publishBtn) publishBtn.classList.remove('d-none');
                }

                // Try to suggest a title if the title input is empty
                if (titleInput && (!titleInput.value || titleInput.value.trim() === "")) {
                    const suggestedTitle = suggestTitleFromText(extractedText);
                    if (suggestedTitle) {
                        titleInput.value = suggestedTitle;
                        showToast("Text erfolgreich eingelesen! Titel wurde automatisch vorgeschlagen.", "success");
                    } else {
                        showToast("Text erfolgreich eingelesen!", "success");
                    }
                } else {
                    showToast("Text erfolgreich eingelesen!", "success");
                }

            } catch (err) {
                console.error("Dokument-Auslese Fehler:", err);
                let userMsg = err.message;
                if (userMsg.includes("429") || userMsg.includes("quota") || userMsg.includes("Quota exceeded") || userMsg.includes("RESOURCE_EXHAUSTED")) {
                    userMsg = "Tageslimit der KI-Anfragen für PDF-Extraktion erreicht. Bitte wandle das PDF in Word (.docx) um oder versuche es morgen wieder.";
                }
                showToast("Fehler beim Einlesen des Dokuments: " + userMsg, "danger");
            } finally {
                // Clear loading state
                if (docSpinner) docSpinner.classList.add('d-none');
                if (docIcon) docIcon.style.display = 'inline-block';
                if (docTextEl) {
                    const draftEditor = document.getElementById('news-draft-editor');
                    if (draftEditor && draftEditor.innerHTML.trim() !== "") {
                        docTextEl.innerHTML = `Eingelesen: <strong class="text-success">${escapeHtml(filename)}</strong>. Erneut klicken zum Ändern.`;
                    } else {
                        docTextEl.innerText = "Klicken Sie hier, um eine PDF- oder Word-Datei hochzuladen.";
                    }
                }
                docInput.value = "";
            }
        });
    }

    // Helper functions for Word extraction & title suggestion
    function extractTextFromDocx(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                const arrayBuffer = e.target.result;
                if (typeof mammoth === "undefined") {
                    reject(new Error("Die Mammoth.js-Bibliothek ist nicht geladen."));
                    return;
                }
                mammoth.extractRawText({ arrayBuffer: arrayBuffer })
                    .then(function(result) {
                        resolve(result.value || "");
                    })
                    .catch(function(err) {
                        reject(new Error("Fehler beim Extrahieren des Texts aus der Word-Datei: " + err.message));
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
