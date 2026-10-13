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
        window.initDynamicModels = async function(selectElement, descElement, defaultModel = 'gemini-3-flash-preview', module = 'news') {
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
                        'gemini-3-flash-preview': 'Modernstes Gemini 3 Modell: Extrem schnell, präzise Bild- & Textanalyse.',
                        'gemini-3.5-flash': 'Gemini 3.5 Flash: Hohe Stabilität und exzellente Textgenerierung.',
                        'gemini-3.1-flash-lite': 'Sehr schnell und hohe Kapazitätsgrenzen. Gut bei Quotenüberschreitungen des Standardmodells.',
                        'gemini-2.5-pro': 'Höchste logische Qualität und beste Erkennungsrate, aber langsamer.'
                    };

                    const recommendedNames = {
                        'gemini-3-flash-preview': 'Gemini 3 Flash (Empfohlen / Standard)',
                        'gemini-3.5-flash': 'Gemini 3.5 Flash (Stabilität)',
                        'gemini-3.1-flash-lite': 'Gemini 3.1 Flash Lite (Lite / Höchste Kapazität)',
                        'gemini-2.5-pro': 'Gemini 2.5 Pro (Höchste Genauigkeit)'
                    };

                    // Exclude legacy/deprecated models containing 1.5, 1.0 or deprecated 2.5-flash
                    const activeModels = models.filter(m => !m.name.includes('gemini-1.5') && !m.name.includes('gemini-1.0') && m.name !== 'gemini-2.5-flash');

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

            const selectedModel = modelSelect ? modelSelect.value : 'gemini-2.5-flash';

            try {
                const useImageContent = document.getElementById('news-use-image-content') ? document.getElementById('news-use-image-content').checked : true;
                
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
                draftEditor.innerHTML = data.html || "";
                
                // Social-Media Entwürfe befüllen
                const igCaptionEl = document.getElementById('news-ig-caption');
                const fbPostEl = document.getElementById('news-fb-post');
                const badgeIg = document.getElementById('badge-ig-status');
                const badgeFb = document.getElementById('badge-fb-status');

                if (igCaptionEl && data.instagramCaption) {
                    igCaptionEl.value = data.instagramCaption;
                    if (badgeIg) badgeIg.classList.remove('d-none');
                }
                if (fbPostEl && data.facebookPost) {
                    fbPostEl.value = data.facebookPost;
                    if (badgeFb) badgeFb.classList.remove('d-none');
                }
                if (typeof window.updateNewsCounters === 'function') {
                    window.updateNewsCounters();
                }

                if (typeof window.switchDraftChannel === 'function') {
                    window.switchDraftChannel('web');
                }

                draftContainer.style.display = 'block';
                publishBtn.classList.remove('d-none'); // Jetzt Publizieren Button einblenden
                
                showToast("Entwurf & Social-Media-Texte generiert! Bitte prüfen und ggf. anpassen.", "success");
                
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

            const igCaption = document.getElementById('news-ig-caption') ? document.getElementById('news-ig-caption').value : '';
            const fbPost = document.getElementById('news-fb-post') ? document.getElementById('news-fb-post').value : '';

            try {
                const response = await apiFetch('news', 'action=publish', {
                    method: 'POST',
                    body: JSON.stringify({
                        title: title,
                        author: author,
                        html: cleanedHtml, // Den bereinigten HTML-Text senden!
                        instagramCaption: igCaption,
                        facebookPost: fbPost,
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
    // --- TAB-UMSCHALTER (KI vs DOKUMENT vs PUBLIZIERT) ---
    let currentDeleteReportId = null;
    let loadedPublishedReports = [];

    window.switchNewsMode = function(mode) {
        const generateBtn = document.getElementById('news-generate-btn');
        const publishBtn = document.getElementById('news-publish-btn');
        const draftContainer = document.getElementById('news-draft-container');
        const keywordsTextarea = document.getElementById('news-keywords');
        const kiTab = document.getElementById('ki-tab');
        const docTab = document.getElementById('doc-tab');
        const publishedTab = document.getElementById('published-tab');
        const kiPanel = document.getElementById('ki-panel');
        const docPanel = document.getElementById('doc-panel');
        const publishedPanel = document.getElementById('published-news-panel');
        const newsForm = document.getElementById('newsForm');
        const draftEditor = document.getElementById('news-draft-editor');

        // Alle Tabs zurücksetzen
        [kiTab, docTab, publishedTab].forEach(tab => {
            if (tab) {
                tab.classList.remove('active', 'text-primary');
                tab.classList.add('text-muted');
                tab.setAttribute('aria-selected', 'false');
            }
        });

        if (mode === 'published') {
            if (publishedTab) {
                publishedTab.classList.add('active', 'text-primary');
                publishedTab.classList.remove('text-muted');
                publishedTab.setAttribute('aria-selected', 'true');
            }
            if (newsForm) newsForm.style.display = 'none';
            if (publishedPanel) publishedPanel.style.display = 'block';
            window.loadPublishedNews();
            return;
        }

        // Bei 'ki' oder 'doc': Erstellungs-Formular anzeigen
        if (newsForm) newsForm.style.display = 'block';
        if (publishedPanel) publishedPanel.style.display = 'none';

        if (mode === 'ki') {
            if (kiTab) {
                kiTab.classList.add('active', 'text-primary');
                kiTab.classList.remove('text-muted');
                kiTab.setAttribute('aria-selected', 'true');
            }
            if (kiPanel) {
                kiPanel.classList.add('active', 'show');
                kiPanel.style.display = 'block';
            }
            if (docPanel) {
                docPanel.classList.remove('active', 'show');
                docPanel.style.display = 'none';
            }
            if (generateBtn) generateBtn.classList.remove('d-none');
            if (publishBtn) {
                if (draftEditor && draftEditor.innerHTML.trim() !== '') {
                    publishBtn.classList.remove('d-none');
                } else {
                    publishBtn.classList.add('d-none');
                }
            }
            if (keywordsTextarea) keywordsTextarea.setAttribute('required', 'true');
        } else if (mode === 'doc') {
            if (docTab) {
                docTab.classList.add('active', 'text-primary');
                docTab.classList.remove('text-muted');
                docTab.setAttribute('aria-selected', 'true');
            }
            if (docPanel) {
                docPanel.classList.add('active', 'show');
                docPanel.style.display = 'block';
            }
            if (kiPanel) {
                kiPanel.classList.remove('active', 'show');
                kiPanel.style.display = 'none';
            }
            if (generateBtn) generateBtn.classList.add('d-none');
            if (draftContainer) draftContainer.style.display = 'block';
            if (publishBtn) {
                if (draftEditor && draftEditor.innerHTML.trim() !== '') {
                    publishBtn.classList.remove('d-none');
                } else {
                    publishBtn.classList.add('d-none');
                }
            }
            if (keywordsTextarea) keywordsTextarea.removeAttribute('required');
        }
    };

    // --- PUBLIZIERTE BERICHTE VERWALTEN & LÖSCHEN ---
    window.loadPublishedNews = async function(forceRefresh = false) {
        const loadingEl = document.getElementById('published-news-loading');
        const emptyEl = document.getElementById('published-news-empty');
        const listEl = document.getElementById('published-news-list');
        if (!listEl) return;

        if (loadingEl) loadingEl.classList.remove('d-none');
        if (emptyEl) emptyEl.classList.add('d-none');
        listEl.innerHTML = '';

        try {
            // Live-Abruf der Berichte von GitHub Raw mit Cache-Buster
            const url = `https://raw.githubusercontent.com/sportschuetzen-muhen/website/main/data/berichte.json?t=${Date.now()}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const reports = await res.json();
            loadedPublishedReports = Array.isArray(reports) ? reports : [];

            if (loadingEl) loadingEl.classList.add('d-none');

            if (!loadedPublishedReports || loadedPublishedReports.length === 0) {
                if (emptyEl) emptyEl.classList.remove('d-none');
                return;
            }

            let html = '';
            loadedPublishedReports.forEach((rep) => {
                let dateStr = 'Unbekanntes Datum';
                if (rep.date) {
                    const d = new Date(rep.date);
                    if (!isNaN(d.getTime())) {
                        dateStr = d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    }
                }

                const firstImg = (rep.imageUrls && rep.imageUrls.length > 0) ? rep.imageUrls[0] : (rep.imageUrl || null);
                const imgSrc = firstImg 
                    ? (firstImg.startsWith('http') ? firstImg : `https://raw.githubusercontent.com/sportschuetzen-muhen/website/main/${firstImg}`)
                    : '';

                const tempDiv = document.createElement('div');
                tempDiv.innerHTML = rep.content || '';
                let excerpt = tempDiv.textContent || tempDiv.innerText || '';
                if (excerpt.length > 100) excerpt = excerpt.substring(0, 100) + '...';

                html += `
                    <div class="card border shadow-sm p-3">
                        <div class="d-flex flex-column flex-sm-row gap-3 align-items-start align-items-sm-center">
                            ${imgSrc ? `<img src="${imgSrc}" style="width: 70px; height: 70px; object-fit: cover; border-radius: 8px;" class="border flex-shrink-0">` : `<div style="width: 70px; height: 70px; border-radius: 8px; background: #e9ecef; display: flex; align-items: center; justify-content: center; font-size: 1.5rem;" class="flex-shrink-0">📰</div>`}
                            <div class="flex-grow-1 overflow-hidden">
                                <div class="d-flex flex-wrap gap-2 align-items-center mb-1">
                                    <span class="badge bg-primary">${escapeHtml(dateStr)}</span>
                                    <small class="text-muted"><i class="fas fa-user me-1"></i>${escapeHtml(rep.author || 'Vorstand')}</small>
                                </div>
                                <h6 class="fw-bold mb-1 text-truncate">${escapeHtml(rep.title || 'Ohne Titel')}</h6>
                                <p class="text-muted small mb-0">${escapeHtml(excerpt)}</p>
                            </div>
                            <div class="flex-shrink-0 align-self-end align-self-sm-center">
                                <button type="button" class="btn btn-outline-danger btn-sm" onclick="openDeleteReportModal('${escapeHtml(rep.id)}')">
                                    <i class="fas fa-trash-alt me-1"></i>Löschen
                                </button>
                            </div>
                        </div>
                    </div>
                `;
            });

            listEl.innerHTML = html;
        } catch (err) {
            console.error('Fehler beim Laden der publizierten Berichte:', err);
            if (loadingEl) loadingEl.classList.add('d-none');
            listEl.innerHTML = `
                <div class="alert alert-danger py-2 px-3 small border-0">
                    <i class="fas fa-exclamation-triangle me-1"></i>Berichte konnten nicht geladen werden: ${escapeHtml(err.message)}
                </div>
            `;
        }
    };

    window.openDeleteReportModal = function(reportId) {
        currentDeleteReportId = reportId;
        const report = loadedPublishedReports.find(r => r.id === reportId);
        if (!report) return;

        const titleEl = document.getElementById('delete-report-modal-title');
        const metaEl = document.getElementById('delete-report-modal-meta');
        if (titleEl) titleEl.innerText = report.title || 'Unbenannter Bericht';
        if (metaEl) {
            let dateStr = report.date ? new Date(report.date).toLocaleDateString('de-CH') : '';
            metaEl.innerText = `Datum: ${dateStr} | Autor: ${report.author || 'Vorstand'}`;
        }

        const modalEl = document.getElementById('deleteReportModal');
        if (modalEl && typeof bootstrap !== 'undefined') {
            const modal = bootstrap.Modal.getInstance(modalEl) || new bootstrap.Modal(modalEl);
            modal.show();
        }
    };

    window.executeDeleteReport = async function() {
        if (!currentDeleteReportId) return;

        const btn = document.getElementById('confirm-delete-report-btn');
        const btnText = document.getElementById('confirm-delete-report-btn-text');
        const spinner = document.getElementById('confirm-delete-report-spinner');

        if (btn) btn.disabled = true;
        if (btnText) btnText.classList.add('d-none');
        if (spinner) spinner.classList.remove('d-none');

        try {
            const response = await apiFetch('news', 'action=delete_report', {
                method: 'POST',
                body: JSON.stringify({ reportId: currentDeleteReportId })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP ${response.status}`);
            }

            showToast("Bericht erfolgreich von der Vereins-Website gelöscht!", "success");

            const modalEl = document.getElementById('deleteReportModal');
            if (modalEl && typeof bootstrap !== 'undefined') {
                const modal = bootstrap.Modal.getInstance(modalEl);
                if (modal) modal.hide();
            }

            // Liste neu laden
            await window.loadPublishedNews(true);

        } catch (err) {
            console.error('Fehler beim Löschen des Berichts:', err);
            showToast(`Fehler beim Löschen: ${err.message}`, "danger");
        } finally {
            if (btn) btn.disabled = false;
            if (btnText) btnText.classList.remove('d-none');
            if (spinner) spinner.classList.add('d-none');
            currentDeleteReportId = null;
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
    const publishedTabBtn = document.getElementById('published-tab');
    if (publishedTabBtn) {
        publishedTabBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.switchNewsMode('published');
        });
    }

    const confirmDeleteBtn = document.getElementById('confirm-delete-report-btn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', (e) => {
            e.preventDefault();
            window.executeDeleteReport();
        });
    }

    // Initialisierungs-Helfer beim Aufruf des Moduls
    window.initNewsView = function() {
        const docTab = document.getElementById('doc-tab');
        const publishedTab = document.getElementById('published-tab');
        if (publishedTab && publishedTab.classList.contains('active')) {
            window.switchNewsMode('published');
        } else if (docTab && docTab.classList.contains('active')) {
            window.switchNewsMode('doc');
        } else {
            window.switchNewsMode('ki');
        }

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

    // --- KANAL-UMSCHALTER IM ENTWURF (WEB / INSTAGRAM / FACEBOOK) ---
    window.switchDraftChannel = function(channel) {
        const tabWeb = document.getElementById('tab-channel-web');
        const tabIg = document.getElementById('tab-channel-ig');
        const tabFb = document.getElementById('tab-channel-fb');
        const panelWeb = document.getElementById('draft-panel-web');
        const panelIg = document.getElementById('draft-panel-ig');
        const panelFb = document.getElementById('draft-panel-fb');

        [tabWeb, tabIg, tabFb].forEach(btn => {
            if (btn) {
                btn.classList.remove('btn-primary', 'active');
                btn.classList.add('btn-outline-secondary');
            }
        });
        [panelWeb, panelIg, panelFb].forEach(p => {
            if (p) p.style.display = 'none';
        });

        if (channel === 'ig') {
            if (tabIg) {
                tabIg.classList.remove('btn-outline-secondary');
                tabIg.classList.add('btn-primary', 'active');
            }
            if (panelIg) panelIg.style.display = 'block';
        } else if (channel === 'fb') {
            if (tabFb) {
                tabFb.classList.remove('btn-outline-secondary');
                tabFb.classList.add('btn-primary', 'active');
            }
            if (panelFb) panelFb.style.display = 'block';
        } else {
            if (tabWeb) {
                tabWeb.classList.remove('btn-outline-secondary');
                tabWeb.classList.add('btn-primary', 'active');
            }
            if (panelWeb) panelWeb.style.display = 'block';
        }
        if (typeof window.updateNewsCounters === 'function') {
            window.updateNewsCounters();
        }
    };

    // Zeichenzähler für Instagram & Facebook
    window.updateNewsCounters = function() {
        const igCaptionEl = document.getElementById('news-ig-caption');
        const igCounter = document.getElementById('news-ig-counter');
        if (igCaptionEl && igCounter) {
            const len = igCaptionEl.value.length;
            igCounter.textContent = `${len} / 2200`;
            if (len > 2100) {
                igCounter.className = 'badge bg-danger';
            } else {
                igCounter.className = 'badge bg-secondary';
            }
        }
        const fbPostEl = document.getElementById('news-fb-post');
        const fbCounter = document.getElementById('news-fb-counter');
        if (fbPostEl && fbCounter) {
            fbCounter.textContent = `${fbPostEl.value.length} Zeichen`;
        }
    };

    // Hashtags an Instagram Caption anfügen
    window.appendNewsHashtag = function(tag) {
        const igCaptionEl = document.getElementById('news-ig-caption');
        if (!igCaptionEl) return;
        if (igCaptionEl.value.includes(tag)) return;
        igCaptionEl.value = igCaptionEl.value.trim() ? `${igCaptionEl.value.trim()} ${tag}` : tag;
        window.updateNewsCounters();
        igCaptionEl.focus();
    };

    // Live-Überwachung für Social-Media Eingabefelder
    const igInputEl = document.getElementById('news-ig-caption');
    if (igInputEl) {
        igInputEl.addEventListener('input', window.updateNewsCounters);
    }
    const fbInputEl = document.getElementById('news-fb-post');
    if (fbInputEl) {
        fbInputEl.addEventListener('input', window.updateNewsCounters);
    }

    // --- REITER 2: SOCIAL MEDIA TEXTE AUS DEM BERICHT GENERIEREN (KI) ---
    window.generateSocialFromDoc = async function() {
        const draftEditor = document.getElementById('news-draft-editor');
        const titleInput = document.getElementById('news-title');
        const btnText = document.getElementById('news-social-btn-text');
        const spinner = document.getElementById('news-social-spinner');
        const socialBtn = document.getElementById('news-generate-social-btn');
        const modelSelect = document.getElementById('news-model');

        const contentHtml = draftEditor ? draftEditor.innerHTML.trim() : '';
        const textOnly = draftEditor ? draftEditor.innerText.trim() : '';

        if (!textOnly) {
            showToast("Bitte füge zuerst einen Text in den Entwurf ein oder lade eine Word-Datei hoch.", "warning");
            return;
        }

        const title = titleInput ? titleInput.value.trim() : '';
        const selectedModel = modelSelect ? modelSelect.value : 'gemini-2.5-flash';

        if (socialBtn) socialBtn.disabled = true;
        if (btnText) btnText.classList.add('d-none');
        if (spinner) spinner.classList.remove('d-none');

        try {
            const response = await apiFetch('news', 'action=generate-social', {
                method: 'POST',
                body: JSON.stringify({
                    title: title,
                    html: contentHtml,
                    model: selectedModel
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.success && (data.instagramCaption || data.facebookPost)) {
                    const igCaptionEl = document.getElementById('news-ig-caption');
                    const fbPostEl = document.getElementById('news-fb-post');
                    const badgeIg = document.getElementById('badge-ig-status');
                    const badgeFb = document.getElementById('badge-fb-status');

                    if (igCaptionEl && data.instagramCaption) {
                        igCaptionEl.value = data.instagramCaption;
                        if (badgeIg) badgeIg.classList.remove('d-none');
                    }
                    if (fbPostEl && data.facebookPost) {
                        fbPostEl.value = data.facebookPost;
                        if (badgeFb) badgeFb.classList.remove('d-none');
                    }
                    window.updateNewsCounters();
                    window.switchDraftChannel('ig');
                    showToast("✨ Social-Media-Texte für Instagram & Facebook erfolgreich erstellt!", "success");
                    return;
                }
            }
            throw new Error("Worker lieferte noch keine Social-Daten.");
        } catch (err) {
            console.warn("Backend generate-social nicht erreichbar oder lieferte Fehler, nutze intelligenten Sofort-Konverter:", err);
            
            // Intelligenter lokaler Konverter als Ausfallsicherung
            const cleanText = (contentHtml ? cleanHtmlContent(contentHtml) : textOnly)
                .replace(/<[^>]+>/g, ' ')
                .replace(/&nbsp;/g, ' ')
                .replace(/&auml;/g, 'ä').replace(/&ouml;/g, 'ö').replace(/&uuml;/g, 'ü')
                .replace(/&Auml;/g, 'Ä').replace(/&Ouml;/g, 'Ö').replace(/&Uuml;/g, 'Ü')
                .replace(/\s+/g, ' ')
                .trim();
            
            const mainHeadline = (title || "NEUIGKEITEN DER SPORTSCHÜTZEN MUHEN").toUpperCase();
            const sentences = cleanText.split(/(?<=[.!?])\s+/).filter(s => s.trim().length > 10);
            
            // 1. Instagram Caption (Smartphone-optimiert)
            let igText = `${mainHeadline} 🎯🏆\n\n`;
            if (sentences.length > 0) {
                igText += `${sentences.slice(0, 3).join(' ')}\n\n`;
            }
            igText += `👉 Den vollständigen Bericht und alle Fotos findet ihr über den Link in unserer Bio!\n\n`;
            igText += `#sportschützen #muhen #schiesssport #kleinkaliber #sportschützenmuhen #schützenverein`;

            // 2. Facebook Post
            let fbText = `${title || 'Aktuelles aus dem Verein'}\n\n`;
            if (sentences.length > 0) {
                fbText += `${sentences.slice(0, 4).join(' ')}\n\n`;
            }
            fbText += `👉 Den vollständigen Bericht und Ranglisten findet ihr auf unserer Webseite:\nhttps://www.sportschuetzen-muhen.ch`;

            const igCaptionEl = document.getElementById('news-ig-caption');
            const fbPostEl = document.getElementById('news-fb-post');
            const badgeIg = document.getElementById('badge-ig-status');
            const badgeFb = document.getElementById('badge-fb-status');

            if (igCaptionEl) {
                igCaptionEl.value = igText;
                if (badgeIg) badgeIg.classList.remove('d-none');
            }
            if (fbPostEl) {
                fbPostEl.value = fbText;
                if (badgeFb) badgeFb.classList.remove('d-none');
            }
            window.updateNewsCounters();
            window.switchDraftChannel('ig');
            showToast("✨ Social-Media-Texte aus aktuellem Entwurf aufbereitet!", "success");
        } finally {
            if (socialBtn) socialBtn.disabled = false;
            if (btnText) btnText.classList.remove('d-none');
            if (spinner) spinner.classList.add('d-none');
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
                    if (typeof window.switchDraftChannel === 'function') {
                        window.switchDraftChannel('web');
                    }
                    
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

    // Globaler Banner-Inserter für News KI
    window.insertNewsBanner = function(type) {
        const editor = document.getElementById('news-draft-editor');
        if (!editor) return;
        const presets = window.ClubWysiwyg ? window.ClubWysiwyg.getPresets() : [];
        const preset = presets.find(b => b.type === type) || {
            bg: '#eff6ff',
            border: '#3b82f6',
            textColor: '#1e3a8a',
            title: 'Information'
        };

        const bannerTitle = preset.title || 'Information';
        const bannerHtml = `
            <div class="club-banner-callout" style="background-color: ${preset.bg}; border-left: 4px solid ${preset.border}; border-radius: 6px; padding: 12px 16px; margin: 16px 0; font-size: 13.5px; line-height: 1.55; color: ${preset.textColor};">
                <strong>${bannerTitle}:</strong> Text hier eingeben...
            </div><p><br></p>
        `;
        document.execCommand('insertHTML', false, bannerHtml);
        editor.focus();
    };

    // Globaler CTA-Button-Inserter für News KI
    window.insertNewsCta = function() {
        const editor = document.getElementById('news-draft-editor');
        if (!editor) return;
        const btnText = prompt('Beschriftung des Buttons (z. B. «Rangliste ansehen»):', 'Mehr erfahren / Ansehen');
        if (!btnText) return;
        const btnUrl = prompt('Ziel-URL (z. B. https://sportschuetzen-muhen.ch):', 'https://');
        if (!btnUrl || btnUrl === 'https://') return;

        let targetUrl = btnUrl.trim();
        if (!/^https?:\/\//i.test(targetUrl) && !/^\//.test(targetUrl)) {
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
        document.execCommand('insertHTML', false, buttonHtml);
        editor.focus();
    };

    // Hilfsfunktion: Bereinigt HTML vor dem Upload (normalisiert Divs zu Paragraph-Tags und regelt Zeilenumbrüche)
    function cleanHtmlContent(html) {
        if (!html) return "";
        if (window.ClubWysiwyg && typeof window.ClubWysiwyg.cleanHtml === 'function') {
            return window.ClubWysiwyg.cleanHtml(html);
        }
        let clean = html.trim();
        clean = clean.replace(/<div(?!\s*class=["'][^"']*(club-banner|club-cta-container)[^"']*["'])[^>]*>/gi, '<p>').replace(/<\/div>/gi, '</p>');
        clean = clean.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>');
        clean = clean.replace(/<br\s*\/?>\s*<\/p>/gi, '</p>');
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
