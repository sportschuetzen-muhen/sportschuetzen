// Galerie Manager - Gesichtserkennung & EXIF Tagging
let faceApiLoaded = false;
let currentImageElement = null;
let currentDetections = [];
let faceTags = []; // Array von { box, name, descriptor }
let originalBase64 = null;
let currentFileIndex = 0;
let filesQueue = [];
let knownFaces = []; // Array of faceapi.LabeledFaceDescriptors
let faceMatcher = null;
let mitgliederList = [];

async function initGalerieManager() {
    const container = document.getElementById('galerie-container');
    container.innerHTML = `
        <div class="row">
            <div class="col-md-12 mb-3" id="galerie-upload-area">
                <div class="card p-4 text-center shadow-sm" id="galerie-dropzone" style="border: 2px dashed #3b82f6; cursor: pointer; background: #f8fafc;">
                    <i class="fas fa-cloud-upload-alt fa-3x text-primary mb-2"></i>
                    <h5>Bilder hochladen & für Vereins-Immich taggen</h5>
                    <p class="text-muted small mb-3">Klicke hier oder ziehe mehrere JPEG-Bilder hinein</p>
                    <div class="d-flex justify-content-center gap-2">
                        <a href="https://immich-muhen.danfamily.uk" target="_blank" rel="noopener noreferrer" 
                           class="btn btn-outline-primary btn-sm rounded-pill px-3 shadow-xs" onclick="event.stopPropagation()">
                            <i class="fas fa-images me-1"></i> Direkt zu Immich Alben & Personen ↗
                        </a>
                    </div>
                    <input type="file" id="galerie-file-input" class="d-none" accept="image/jpeg, image/jpg" multiple>
                </div>
            </div>
            
            <div class="col-md-3 d-none" id="galerie-queue-sidebar">
                <div class="card shadow-sm border-0 h-100">
                    <div class="card-header bg-white border-bottom">
                        <h6 class="mb-0">Warteschlange (<span id="queue-count">0</span>)</h6>
                    </div>
                    <div class="card-body p-2" id="queue-list" style="overflow-y: auto; max-height: 50vh;">
                    </div>
                    <div class="card-footer bg-white border-top p-2 d-flex flex-column gap-2">
                        <button class="btn btn-primary w-100 btn-sm fw-bold" onclick="uploadAllToImmich()">🚀 Alle in Immich hochladen & taggen</button>
                        <button class="btn btn-outline-secondary w-100 btn-sm" onclick="downloadAllTags()">📥 Lokale ZIP laden</button>
                    </div>
                </div>
            </div>

            <div class="col-md-9 d-none" id="galerie-workspace-area">
                <!-- Immich Tag-Auswahl für Vereins-Fotos -->
                <div class="card shadow-sm border-0 mb-3 bg-light">
                    <div class="card-header bg-white border-bottom py-2">
                        <h6 class="mb-0 fw-bold text-primary"><i class="fas fa-tags me-2"></i>Immich Vereins-Tags zuweisen</h6>
                    </div>
                    <div class="card-body p-3">
                        <div class="row g-2">
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">📅 Jahr</label>
                                <select id="immich-tag-jahr" class="form-select form-select-sm">
                                    <option value="">-- Jahr wählen --</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">🏆 Anlass</label>
                                <select id="immich-tag-anlass" class="form-select form-select-sm">
                                    <option value="">-- Anlass wählen --</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">🎯 Tätigkeit</label>
                                <select id="immich-tag-taetigkeit" class="form-select form-select-sm">
                                    <option value="">-- Tätigkeit wählen --</option>
                                </select>
                            </div>
                            <div class="col-md-3">
                                <label class="form-label small fw-bold mb-1">🌐 Status / Sichtbarkeit</label>
                                <select id="immich-tag-status" class="form-select form-select-sm">
                                    <option value="">-- Status wählen --</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="card shadow-sm border-0 mb-3">
                    <div class="card-body p-2 text-center" style="background: #f1f5f9;">
                        <div style="display: inline-block; position: relative;">
                            <img id="galerie-image" class="img-fluid rounded" style="max-height: 55vh;">
                            <canvas id="galerie-canvas" class="position-absolute top-0 start-0 w-100 h-100" style="pointer-events: none;"></canvas>
                        </div>
                    </div>
                    <div class="card-footer bg-white d-flex justify-content-between align-items-center">
                        <button class="btn btn-outline-secondary btn-sm" onclick="prevImage()">⬅️ Zurück</button>
                        <span class="fw-bold" id="current-image-name">Bild 1</span>
                        <button class="btn btn-outline-secondary btn-sm" onclick="nextImage()">Weiter ➡️</button>
                    </div>
                </div>
                
                <div class="card shadow-sm border-0">
                    <div class="card-body d-flex justify-content-between align-items-center flex-wrap gap-2">
                        <div>
                            <h6 class="mb-1">Erkannte Personen:</h6>
                            <div id="galerie-tags-list" class="d-flex flex-wrap gap-2"></div>
                        </div>
                        <div class="d-flex gap-2">
                            <button class="btn btn-primary btn-sm fw-bold" onclick="uploadCurrentToImmich()">🚀 In Vereins-Immich hochladen</button>
                            <button class="btn btn-outline-secondary btn-sm" onclick="saveExifAndDownloadCurrent()">💾 Lokale Kopie speichern</button>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Modal für Namenseingabe -->
        <div class="modal fade" id="nameModal" tabindex="-1">
            <div class="modal-dialog modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">Person auswählen</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="input-group mb-3">
                            <input type="text" id="face-name-input" class="form-control" placeholder="Neue Person eintragen...">
                            <button class="btn btn-primary" onclick="saveNewFaceName()">Hinzufügen</button>
                        </div>
                        <hr>
                        <h6>Oder Mitglied anklicken:</h6>
                        <input type="text" id="member-search" class="form-control form-control-sm mb-2" placeholder="Mitglied suchen..." onkeyup="filterMembers()">
                        <div id="members-list-container" class="list-group list-group-flush">
                            <!-- Gefüllt per JS -->
                        </div>
                    </div>
                </div>
            </div>
        </div>
    `;

    setupGalerieEvents();
    loadMembersForList();
    loadImmichTagsForSelector();
}

let availableImmichTags = [];

async function loadImmichTagsForSelector() {
    try {
        const res = await apiFetch('immich', 'action=getTags');
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.tags) {
                availableImmichTags = data.tags;
                populateImmichTagDropdowns();
            }
        }
    } catch (e) {
        console.error("Konnte Immich-Tags nicht laden:", e);
    }
}

function populateImmichTagDropdowns() {
    const jahrSelect = document.getElementById('immich-tag-jahr');
    const anlassSelect = document.getElementById('immich-tag-anlass');
    const taetigkeitSelect = document.getElementById('immich-tag-taetigkeit');
    const statusSelect = document.getElementById('immich-tag-status');

    if (!jahrSelect) return;

    // Clear options
    jahrSelect.innerHTML = '<option value="">-- Jahr wählen --</option>';
    anlassSelect.innerHTML = '<option value="">-- Anlass wählen --</option>';
    taetigkeitSelect.innerHTML = '<option value="">-- Tätigkeit wählen --</option>';
    statusSelect.innerHTML = '<option value="">-- Status wählen --</option>';

    // Find parent tag IDs
    const jahrParent = availableImmichTags.find(t => t.value === 'Jahr');
    const anlassParent = availableImmichTags.find(t => t.value === 'Anlass');
    const taetigkeitParent = availableImmichTags.find(t => t.value === 'Tätigkeit');
    const statusParent = availableImmichTags.find(t => t.value === 'Status & Datenschutz');

    availableImmichTags.forEach(t => {
        if (t.parentId === (jahrParent?.id) || (t.value.match(/^(199\d|20[0-2]\d)$/))) {
            jahrSelect.innerHTML += `<option value="${t.id}">${t.value}</option>`;
        } else if (t.parentId === (anlassParent?.id)) {
            anlassSelect.innerHTML += `<option value="${t.id}">${t.value}</option>`;
        } else if (t.parentId === (taetigkeitParent?.id)) {
            taetigkeitSelect.innerHTML += `<option value="${t.id}">${t.value}</option>`;
        } else if (t.parentId === (statusParent?.id)) {
            statusSelect.innerHTML += `<option value="${t.id}">${t.value}</option>`;
        }
    });
}

function getSelectedImmichTagIds() {
    const tagIds = [];
    ['immich-tag-jahr', 'immich-tag-anlass', 'immich-tag-taetigkeit', 'immich-tag-status'].forEach(id => {
        const el = document.getElementById(id);
        if (el && el.value) tagIds.push(el.value);
    });
    return tagIds;
}

async function uploadCurrentToImmich() {
    if (!originalBase64 || !filesQueue[currentFileIndex]) return;
    const qItem = filesQueue[currentFileIndex];
    const tagIds = getSelectedImmichTagIds();

    showToast(`Lade ${qItem.file.name} in Vereins-Immich hoch...`, "info");

    try {
        const res = await apiFetch('immich', 'action=uploadAsset', {
            method: 'POST',
            body: JSON.stringify({
                filename: qItem.file.name,
                base64Data: originalBase64,
                tagIds: tagIds
            })
        });

        const data = await res.json();
        if (data.success) {
            showToast(` Erfogreich in Immich hochgeladen & getaggt! (ID: ${data.assetId.substring(0, 8)})`, "success");
        } else {
            throw new Error(data.error || "Upload fehlgeschlagen");
        }
    } catch (e) {
        console.error("Immich Upload Fehler:", e);
        showToast(`Fehler beim Upload: ${e.message}`, "danger");
    }
}

async function uploadAllToImmich() {
    if (filesQueue.length === 0) return;
    const tagIds = getSelectedImmichTagIds();
    showToast(`Starte Immich Batch-Upload für ${filesQueue.length} Bilder...`, "info");

    let successCount = 0;
    for (let i = 0; i < filesQueue.length; i++) {
        const qItem = filesQueue[i];
        if (!qItem.base64) {
            await new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = (e) => { qItem.base64 = e.target.result; resolve(); };
                reader.readAsDataURL(qItem.file);
            });
        }

        try {
            const res = await apiFetch('immich', 'action=uploadAsset', {
                method: 'POST',
                body: JSON.stringify({
                    filename: qItem.file.name,
                    base64Data: qItem.base64,
                    tagIds: tagIds
                })
            });
            const data = await res.json();
            if (data.success) successCount++;
        } catch (e) {
            console.error(`Fehler bei ${qItem.file.name}:`, e);
        }
    }

    showToast(`🎉 ${successCount} von ${filesQueue.length} Bildern in Immich hochgeladen & getaggt!`, "success");
}

async function loadFaceApiModels() {
    if (faceApiLoaded) return;
    showToast("Lade KI-Modelle (Erkennung & Identifikation)...", "info");
    try {
        const MODEL_URL = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights';
        // Wir brauchen Landmark und Recognition für die Wiedererkennung
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        
        // Gesichter aus dem Langzeitgedächtnis (Backend) laden
        await loadSavedFaceModels();
        
        faceApiLoaded = true;
        showToast("KI-Modelle & Langzeitgedächtnis geladen!", "success");
    } catch (e) {
        console.error("Fehler beim Laden von face-api.js Modellen", e);
        showToast("Fehler beim Laden der Erkennungs-KI.", "danger");
    }
}

async function loadSavedFaceModels() {
    try {
        const res = await apiFetch('faces', 'action=get', {
            method: 'POST',
            body: JSON.stringify({})
        });
        
        if (res.ok) {
            const data = await res.json();
            if (data.success && data.faces) {
                // Gesichter wiederherstellen
                knownFaces = data.faces.map(f => {
                    // Die Descriptoren wurden als normale Arrays gespeichert
                    const descriptors = f.descriptors.map(d => new Float32Array(d));
                    return new faceapi.LabeledFaceDescriptors(f.label, descriptors);
                });
                console.log(`${knownFaces.length} Gesichter aus dem Langzeitgedächtnis geladen.`);
            }
        }
    } catch(e) {
        console.error("Konnte Gesichter nicht laden:", e);
    }
}

function setupGalerieEvents() {
    const dropzone = document.getElementById('galerie-dropzone');
    const fileInput = document.getElementById('galerie-file-input');

    dropzone.addEventListener('click', () => {
        if (!faceApiLoaded) loadFaceApiModels();
        fileInput.click();
    });

    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--primary)';
        dropzone.style.background = 'var(--primary-light)';
    });

    dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border)';
        dropzone.style.background = 'transparent';
    });

    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.style.borderColor = 'var(--border)';
        dropzone.style.background = 'transparent';
        if (!faceApiLoaded) loadFaceApiModels();
        
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleMultipleUploads(e.dataTransfer.files);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleMultipleUploads(e.target.files);
        }
    });
}

function handleMultipleUploads(files) {
    let newFiles = [];
    for (let i = 0; i < files.length; i++) {
        if (files[i].type.match('image/jpeg')) {
            newFiles.push({ file: files[i], base64: null, tags: [] });
        }
    }
    
    if (newFiles.length === 0) {
        showToast("Bitte lade JPEG-Bilder hoch.", "warning");
        return;
    }

    filesQueue = filesQueue.concat(newFiles);
    
    document.getElementById('galerie-upload-area').classList.add('d-none');
    document.getElementById('galerie-queue-sidebar').classList.remove('d-none');
    document.getElementById('galerie-workspace-area').classList.remove('d-none');
    
    updateQueueUI();
    if (filesQueue.length === newFiles.length) {
        // Erstes Bild laden, wenn vorher leer
        loadImageFromQueue(0);
    }
}

function updateQueueUI() {
    document.getElementById('queue-count').innerText = filesQueue.length;
    const list = document.getElementById('queue-list');
    list.innerHTML = '';
    
    filesQueue.forEach((qItem, idx) => {
        const isActive = idx === currentFileIndex;
        const tagCount = qItem.tags.filter(t => t.name).length;
        list.innerHTML += `
            <div class="p-2 mb-1 rounded cursor-pointer ${isActive ? 'bg-primary text-white' : 'bg-light text-dark'}" 
                 onclick="loadImageFromQueue(${idx})" style="cursor: pointer; font-size: 0.85rem;">
                <div class="text-truncate fw-bold">${qItem.file.name}</div>
                <div class="small">${tagCount} Tags gespeichert</div>
            </div>
        `;
    });
}

function prevImage() {
    if (currentFileIndex > 0) loadImageFromQueue(currentFileIndex - 1);
}

function nextImage() {
    if (currentFileIndex < filesQueue.length - 1) loadImageFromQueue(currentFileIndex + 1);
}

function loadImageFromQueue(index) {
    // Speichere aktuelle Tags bevor wir wechseln
    if (filesQueue[currentFileIndex] && faceTags.length > 0) {
        filesQueue[currentFileIndex].tags = JSON.parse(JSON.stringify(faceTags));
    }

    currentFileIndex = index;
    const qItem = filesQueue[index];
    document.getElementById('current-image-name').innerText = qItem.file.name;
    updateQueueUI();

    if (qItem.base64) {
        originalBase64 = qItem.base64;
        displayAndDetect(originalBase64, qItem.tags);
    } else {
        const reader = new FileReader();
        reader.onload = async (e) => {
            qItem.base64 = e.target.result;
            originalBase64 = qItem.base64;
            displayAndDetect(originalBase64, qItem.tags);
        };
        reader.readAsDataURL(qItem.file);
    }
}

async function displayAndDetect(base64, existingTags) {
    const imgEl = document.getElementById('galerie-image');
    imgEl.src = base64;
    
    // Clear canvas
    const canvas = document.getElementById('galerie-canvas');
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    faceTags = [];
    updateTagsList();

    imgEl.onload = async () => {
        currentImageElement = imgEl;
        
        if (existingTags && existingTags.length > 0) {
            faceTags = JSON.parse(JSON.stringify(existingTags));
            // Zeichne Boxen basierend auf existierenden Koordinaten
            setTimeout(() => {
                const displaySize = { width: imgEl.width, height: imgEl.height };
                faceapi.matchDimensions(canvas, displaySize);
                drawFaces();
                updateTagsList();
            }, 100); // Kurz warten bis Layout stabil
        } else {
            await detectFaces();
        }
    };
}

async function detectFaces() {
    if (!faceApiLoaded) await loadFaceApiModels();
    
    showToast("Analysiere Gesichter...", "info");
    // Mit Landmarks und Deskriptoren für die Identifikation!
    currentDetections = await faceapi.detectAllFaces(currentImageElement).withFaceLandmarks().withFaceDescriptors();
    
    // Recreate Matcher if we have known faces
    if (knownFaces.length > 0) {
        faceMatcher = new faceapi.FaceMatcher(knownFaces, 0.5); // 0.5 = Striktheit
    } else {
        faceMatcher = null;
    }

    faceTags = currentDetections.map((det, index) => {
        let detectedName = null;
        if (faceMatcher) {
            const bestMatch = faceMatcher.findBestMatch(det.descriptor);
            if (bestMatch.label !== 'unknown') {
                detectedName = bestMatch.label;
                console.log("KI hat Gesicht erkannt:", detectedName);
            }
        }

        return {
            id: index,
            box: det.detection.box,
            descriptor: Array.from(det.descriptor), // Convert Float32Array to standard array for JSON
            name: detectedName
        };
    });
    
    // Auto-Save after auto-detection
    if (filesQueue[currentFileIndex]) {
        filesQueue[currentFileIndex].tags = faceTags;
        updateQueueUI();
    }

    const canvas = document.getElementById('galerie-canvas');
    const displaySize = { width: currentImageElement.width, height: currentImageElement.height };
    faceapi.matchDimensions(canvas, displaySize);
    
    drawFaces();
    updateTagsList();
    showToast(`${currentDetections.length} Gesichter gefunden!`, "success");
}

function drawFaces() {
    const canvas = document.getElementById('galerie-canvas');
    const img = document.getElementById('galerie-image');
    
    // Canvas Größe an das angezeigte Bild anpassen
    canvas.width = img.clientWidth;
    canvas.height = img.clientHeight;
    
    const displaySize = { width: img.clientWidth, height: img.clientHeight };
    faceapi.matchDimensions(canvas, displaySize);
    
    // Original-Detections resizen auf die Anzeige-Grösse
    const resizedDetections = faceapi.resizeResults(currentDetections, displaySize);
    
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    resizedDetections.forEach((det, i) => {
        // det ist bei withFaceLandmarks ein Objekt { detection, landmarks, ... }
        const box = det.detection.box;
        const tag = faceTags.find(t => t.id === i);
        if (!tag) return;
        
        // Aktualisiere die gespeicherte displayBox für den Klick-Event
        tag.displayBox = box;

        // Rahmen zeichnen
        ctx.strokeStyle = tag.name ? '#10b981' : '#f59e0b';
        ctx.lineWidth = 3;
        ctx.strokeRect(box.x, box.y, box.width, box.height);
        
        // Hintergrund für Text
        ctx.fillStyle = tag.name ? '#10b981' : '#f59e0b';
        ctx.fillRect(box.x, box.y - 25, box.width, 25);
        
        // Text
        ctx.fillStyle = '#ffffff';
        ctx.font = '14px sans-serif';
        const text = tag.name ? tag.name : 'Klicken zum Benennen';
        ctx.fillText(text, box.x + 5, box.y - 7);
    });
    
    document.getElementById('galerie-workspace-area').onclick = (e) => {
        const rect = img.getBoundingClientRect();
        
        // Klick in Anzeige-Koordinaten relativ zum Bild
        const clickX = e.clientX - rect.left;
        const clickY = e.clientY - rect.top;
        
        // Finde geklickte Box
        for (let i = 0; i < faceTags.length; i++) {
            const displayBox = faceTags[i].displayBox;
            if (!displayBox) continue;

            if (clickX >= displayBox.x && clickX <= displayBox.x + displayBox.width &&
                clickY >= displayBox.y && clickY <= displayBox.y + displayBox.height) {
                openNameModal(faceTags[i].id);
                break;
            }
        }
    };
}

let activeFaceId = null;
function openNameModal(faceId) {
    activeFaceId = faceId;
    document.getElementById('face-name-input').value = "";
    document.getElementById('member-search').value = "";
    filterMembers();
    new bootstrap.Modal(document.getElementById('nameModal')).show();
}

function saveNewFaceName() {
    const name = document.getElementById('face-name-input').value.trim();
    if (name) {
        assignNameAndLearn(name);
    }
}

function selectMember(name) {
    assignNameAndLearn(name);
}

function assignNameAndLearn(name) {
    const tag = faceTags[activeFaceId];
    tag.name = name;
    
    // Lerne dieses Gesicht für zukünftige Bilder!
    if (tag.descriptor) {
        const descArray = new Float32Array(tag.descriptor);
        // Prüfen, ob Person schon existiert
        let existingPerson = knownFaces.find(kf => kf.label === name);
        if (existingPerson) {
            existingPerson.descriptors.push(descArray);
        } else {
            knownFaces.push(new faceapi.LabeledFaceDescriptors(name, [descArray]));
        }
        showToast(`${name} für automatische Erkennung gemerkt!`, "info");
        
        // Asynchron ans Backend senden (Langzeitgedächtnis speichern)
        saveFaceModelsToBackend();
    }

    if (filesQueue[currentFileIndex]) {
        filesQueue[currentFileIndex].tags = faceTags;
        updateQueueUI();
    }

    drawFaces();
    updateTagsList();
    bootstrap.Modal.getInstance(document.getElementById('nameModal')).hide();
}

async function saveFaceModelsToBackend() {
    // LabeledFaceDescriptors umwandeln (Float32Array zu normalen Arrays)
    const exportableFaces = knownFaces.map(kf => ({
        label: kf.label,
        descriptors: kf.descriptors.map(d => Array.from(d))
    }));

    try {
        await apiFetch('faces', 'action=save', {
            method: 'POST',
            body: JSON.stringify({ faces: exportableFaces })
        });
        console.log("Gesichter im Langzeitgedächtnis gesichert.");
    } catch(e) {
        console.error("Konnte Gesichter nicht speichern:", e);
    }
}

function updateTagsList() {
    const list = document.getElementById('galerie-tags-list');
    list.innerHTML = '';
    
    const namedTags = faceTags.filter(t => t.name).map(t => t.name);
    if (namedTags.length === 0) {
        list.innerHTML = '<span class="text-muted small">Noch keine Personen benannt. Klicke auf die Rahmen im Bild.</span>';
        return;
    }
    
    namedTags.forEach(name => {
        list.innerHTML += `<span class="badge bg-primary fs-6">${name}</span>`;
    });
}

async function loadMembersForList() {
    try {
        const res = await apiFetch('mitglieder', 'action=getAll');
        if (res.ok) {
            const data = await res.json();
            if (data.data) {
                mitgliederList = data.data.map(m => `${m.FirstName || ''} ${m.LastName || ''}`.trim()).sort();
            }
        }
    } catch (e) {
        console.error("Fehler beim Laden der Mitgliederliste", e);
    }
}

function filterMembers() {
    const term = document.getElementById('member-search').value.toLowerCase();
    const container = document.getElementById('members-list-container');
    container.innerHTML = '';
    
    let filtered = mitgliederList.filter(m => m.toLowerCase().includes(term)).slice(0, 15); // max 15 anzeigen
    
    filtered.forEach(m => {
        container.innerHTML += `
            <button class="list-group-item list-group-item-action py-2" onclick="selectMember('${m}')">
                <i class="fas fa-user text-muted me-2"></i> ${m}
            </button>
        `;
    });
}

function injectExifTags(base64Image, namedTags) {
    if (namedTags.length === 0) return base64Image;
    try {
        let exifObj = piexif.load(base64Image);
        const tagsString = namedTags.join('; ');
        
        const xpKeywordsArray = [];
        for (let i = 0; i < tagsString.length; i++) {
            xpKeywordsArray.push(tagsString.charCodeAt(i));
            xpKeywordsArray.push(0);
        }
        xpKeywordsArray.push(0);
        xpKeywordsArray.push(0);

        exifObj["0th"][piexif.ImageIFD.XPKeywords] = xpKeywordsArray;
        exifObj["0th"][piexif.ImageIFD.ImageDescription] = tagsString;

        const exifbytes = piexif.dump(exifObj);
        return piexif.insert(exifbytes, base64Image);
    } catch (e) {
        console.error("EXIF Fehler", e);
        return base64Image;
    }
}

function saveExifAndDownloadCurrent() {
    if (!originalBase64) return;
    const namedTags = faceTags.filter(t => t.name).map(t => t.name);
    const newDataUrl = injectExifTags(originalBase64, namedTags);
    
    const a = document.createElement('a');
    a.href = newDataUrl;
    a.download = filesQueue[currentFileIndex].file.name.replace('.jpg', '_tagged.jpg');
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

// Skript zum Downloaden einer ZIP mit allen Bildern erfordert JSZip. 
// Da das ohne Library zu gross wäre, triggern wir für "Alle laden" einfach Einzeldownloads leicht verzögert:
async function downloadAllTags() {
    showToast("Starte Batch-Download...", "info");
    for (let i = 0; i < filesQueue.length; i++) {
        const qItem = filesQueue[i];
        const namedTags = qItem.tags.filter(t => t.name).map(t => t.name);
        
        if (qItem.base64 && namedTags.length > 0) {
            const newDataUrl = injectExifTags(qItem.base64, namedTags);
            const a = document.createElement('a');
            a.href = newDataUrl;
            a.download = qItem.file.name.replace('.jpg', '_tagged.jpg');
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Kleine Pause, damit der Browser nicht blockiert
            await new Promise(r => setTimeout(r, 500));
        }
    }
    showToast("Downloads abgeschlossen!", "success");
}

// Alt-Code entfernt

// Alte Funktionen (saveExifAndDownload, resetGalerie, loadMembersForDatalist) entfernt, da Queue-Logik verwendet wird.

// Global für navTo verfügbar machen
window.initGalerieManager = initGalerieManager;
