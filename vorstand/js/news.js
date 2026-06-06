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
                
                const response = await apiFetch('news', 'action=generate', {
                    method: 'POST',
                    body: JSON.stringify({
                        keywords: keywords,
                        images: base64Images,
                        useImageContent: useImageContent
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
                if (err.message === 'QUOTA_EXCEEDED') {
                    showToast("Das Tageslimit für News-Berichte (Premium KI) ist leider erreicht. Bitte versuche es in 24 Stunden erneut.", "danger");
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
                        html: finalHtml, // Den manuell angepassten HTML-Text senden!
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
});
