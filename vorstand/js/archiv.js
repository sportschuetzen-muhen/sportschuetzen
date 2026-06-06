/**
 * PROTOKOLL-ARCHIV & KI-ASSISTENT MODULE
 * Sportschützen Muhen Portal
 * 
 * Bietet eine intelligente, semantische Suche in Vereins- und Vorstandsprotokollen.
 * Nutzt Cloudflare Workers AI (Llama 3 & BGE-M3) sowie D1 und Vectorize.
 */

// Globale Initialisierung, falls benötigt
document.addEventListener("DOMContentLoaded", () => {
    // Da navTo() dynamisch gesteuert wird, klinken wir uns in den Render-Zyklus ein
    const originalNavTo = window.navTo;
    window.navTo = function(viewId, element) {
        if (typeof originalNavTo === "function") {
            originalNavTo(viewId, element);
        }
        if (viewId === 'archiv') {
            initArchiv();
        }
    };
});

function initArchiv() {
    const container = document.getElementById("view-archiv");
    if (!container) return;

    // Nur neu aufbauen, falls noch nicht gerendert
    if (container.querySelector(".archiv-wrapper")) {
        return;
    }

    // HTML-Struktur mit Premium-Glassmorphismus und modernem Grid
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4">
            <h2 class="fw-bold text-primary mb-0" style="letter-spacing: -0.5px;">
                <i class="fas fa-archive me-2 text-primary"></i>Protokoll-Archiv & KI-Assistent
            </h2>
            <div class="badge bg-primary-light text-primary px-3 py-2 rounded-pill fw-semibold" id="archiv-badge">
                <i class="fas fa-robot me-1"></i> Cloudflare Workers AI
            </div>
        </div>

        <div class="archiv-wrapper row g-4">
            <!-- LINKE SPALTE: CHATBOT-INTERFACE -->
            <div class="col-lg-8">
                <div class="card border-0 shadow-lg p-0 overflow-hidden" style="background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(12px); border-radius: 20px;">
                    <!-- Chat Header -->
                    <div class="p-3 border-bottom d-flex align-items-center justify-content-between" style="background: linear-gradient(135deg, var(--primary), var(--primary-hover)); color: white;">
                        <div class="d-flex align-items-center">
                            <div class="position-relative me-3">
                                <div class="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
                                    <i class="fas fa-bullseye fa-lg text-primary animate-pulse"></i>
                                </div>
                                <span class="position-absolute bottom-0 end-0 bg-success border border-white border-2 rounded-circle" style="width: 12px; height: 12px;"></span>
                            </div>
                            <div>
                                <h6 class="mb-0 fw-bold">Vereins-Archivar</h6>
                                <small class="opacity-75">Durchsucht alle Protokolle & GV-Beschlüsse</small>
                            </div>
                        </div>
                        <button class="btn btn-sm btn-link text-white opacity-75 hover-opacity-100 text-decoration-none" onclick="clearChat()">
                            <i class="fas fa-trash-alt me-1"></i> Verlauf leeren
                        </button>
                    </div>

                    <!-- Chat Messages Area -->
                    <div id="chat-messages-container" class="p-4 overflow-y-auto" style="height: 480px; background: rgba(248, 250, 252, 0.5);">
                        <div class="chat-message bot-msg d-flex mb-3">
                            <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                                <i class="fas fa-robot fa-xs"></i>
                            </div>
                            <div class="msg-bubble p-3 rounded-4 shadow-sm" style="background: white; border: 1px solid var(--border); max-width: 80%; border-top-left-radius: 4px;">
                                <p class="mb-0 small fw-medium">Grüezi! Ich bin euer digitaler Archiv-Assistent. Ich kann alle eingelesenen GV- und Vorstandsprotokolle nach Stichworten, Beschlüssen oder geschichtlichen Fragen durchsuchen.</p>
                                <hr class="my-2 opacity-25">
                                <p class="mb-0 small text-muted"><strong>Tipp:</strong> Klicke unten auf eine der Beispielfragen oder tippe deine eigene Frage ein.</p>
                            </div>
                        </div>
                    </div>

                    <!-- Schnellwahltasten / Suggestions -->
                    <div class="px-4 py-2 border-top bg-light d-flex flex-wrap gap-2 align-items-center">
                        <span class="small text-muted fw-bold me-1"><i class="fas fa-lightbulb me-1"></i>Beispiele:</span>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-3 fs-7" onclick="askPreset('Wer ist aktuell im Vorstand vertreten?')">Wer ist im Vorstand?</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-3 fs-7" onclick="askPreset('Wann wurde das Schützenhaus renoviert?')">Renovation Schützenhaus</button>
                        <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-3 fs-7" onclick="askPreset('Wie hoch ist der aktuelle Mitgliederbeitrag?')">Mitgliederbeitrag</button>
                    </div>

                    <!-- Chat Input Area -->
                    <div class="p-3 border-top bg-white">
                        <div class="input-group">
                            <input type="text" id="archiv-chat-input" class="form-control border-end-0 py-2.5 px-3 rounded-start-pill" placeholder="Stelle eine Frage zum Vereinsarchiv..." style="border: 1px solid var(--border);" onkeydown="handleChatKey(event)">
                            <button class="btn btn-primary px-4 rounded-end-pill d-flex align-items-center" onclick="sendUserMessage()" id="archiv-send-btn">
                                <span>Senden</span> <i class="fas fa-paper-plane ms-2"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- RECHTE SPALTE: INGESTION (PROTOKOLLE EINLESEN) -->
            <div class="col-lg-4">
                <div class="card border-0 shadow-lg p-4 h-100" style="background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(12px); border-radius: 20px;">
                    <h5 class="fw-bold text-primary mb-3"><i class="fas fa-cloud-upload-alt me-2"></i>Neues Protokoll einlesen</h5>
                    <p class="small text-muted mb-4">Hier kannst du Protokolle oder Beschlüsse in die KI einlesen. Der Text wird automatisch zerkleinert, vektorisiert und in der Cloudflare Vectorize-Datenbank indexiert.</p>

                    <form id="ingest-form" onsubmit="handleIngest(event)">
                        <div class="mb-3">
                            <label class="form-label small fw-bold text-muted">Dokumentname</label>
                            <input type="text" id="ingest-doc-name" class="form-control rounded-3" placeholder="z. B. GV_Protokoll_2025.pdf" required>
                        </div>

                        <div class="row">
                            <div class="col-6 mb-3">
                                <label class="form-label small fw-bold text-muted">Datum</label>
                                <input type="date" id="ingest-doc-date" class="form-control rounded-3" required>
                                <div id="date-hint" class="form-text text-warning small d-none mt-1"><i class="fas fa-exclamation-triangle"></i> Aus Dateiname erkannt. Bitte prüfen!</div>
                            </div>
                            <div class="col-6 mb-3">
                                <label class="form-label small fw-bold text-muted">Kategorie</label>
                                <select id="ingest-doc-cat" class="form-select rounded-3">
                                    <option value="gv">GV Protokoll</option>
                                    <option value="vorstand">Vorstand</option>
                                    <option value="sonstiges">Sonstiges</option>
                                </select>
                            </div>
                        </div>

                        <div class="mb-4">
                            <label class="form-label small fw-bold text-muted">Protokoll-Text</label>
                            
                            <div class="d-flex gap-2 mb-2">
                                <label for="ingest-pdf-file" class="btn btn-sm btn-outline-primary flex-grow-1 d-flex align-items-center justify-content-center">
                                    <i class="fas fa-file-import me-2"></i> Einzel-Upload (PDF / Word)
                                    <span class="spinner-border spinner-border-sm ms-2 d-none" id="pdf-spinner" role="status" aria-hidden="true"></span>
                                </label>
                                <input type="file" id="ingest-pdf-file" accept=".pdf,.docx,.doc" style="display:none" onchange="handlePdfUpload(event)">

                                <label for="ingest-batch-file" class="btn btn-sm btn-outline-warning flex-grow-1 d-flex align-items-center justify-content-center" title="Mehrere PDFs oder Word-Dateien auswählen">
                                    <i class="fas fa-layer-group me-2"></i> Massen-Upload (PDF / Word)
                                    <span class="spinner-border spinner-border-sm ms-2 d-none" id="batch-spinner" role="status" aria-hidden="true"></span>
                                </label>
                                <input type="file" id="ingest-batch-file" accept=".pdf,.docx,.doc" multiple style="display:none" onchange="handleBatchUpload(event)">
                            </div>
                            
                            <textarea id="ingest-doc-text" class="form-control rounded-3 font-monospace" rows="10" placeholder="Kopiere den Text des Protokolls hier hinein ODER lade oben ein PDF/Word-Dokument hoch..." style="font-size: 0.85rem;" required></textarea>
                            <div class="form-text small text-muted">Achte darauf, dass alle wichtigen Beschlüsse, Zahlen und Namen im Text enthalten sind. Du kannst den Text hier jederzeit anpassen.</div>
                        </div>

                        <div class="d-grid">
                            <button type="submit" class="btn btn-success py-2.5 fw-bold rounded-3 shadow-sm d-flex align-items-center justify-content-center" id="ingest-submit-btn">
                                <i class="fas fa-cogs me-2"></i> Protokoll indexieren
                            </button>
                        </div>
                    </form>

                    <!-- Ingestion Status / Progress -->
                    <div id="ingest-progress-container" class="mt-4 p-3 border rounded-3 bg-light d-none">
                        <div class="d-flex align-items-center justify-content-between mb-2">
                            <span class="small fw-bold text-muted" id="ingest-status-text">Indexiere Daten...</span>
                            <div class="spinner-border spinner-border-sm text-success" role="status"></div>
                        </div>
                        <div class="progress" style="height: 6px;">
                            <div class="progress-bar progress-bar-striped progress-bar-animated bg-success" role="progressbar" style="width: 100%"></div>
                        </div>
                        <small class="text-muted d-block mt-2" style="font-size: 0.75rem;">Dies kann einen Moment dauern. Die KI erzeugt Vektor-Embeddings für jeden Abschnitt.</small>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Standarddatum für Upload auf heute setzen
    const today = new Date().toISOString().split('T')[0];
    document.getElementById("ingest-doc-date").value = today;
}

// === PRESETS / BEISPIELFRAGEN ===
function askPreset(question) {
    const input = document.getElementById("archiv-chat-input");
    if (input) {
        input.value = question;
        sendUserMessage();
    }
}

// === VERLAUF LEEREN ===
function clearChat() {
    const chatContainer = document.getElementById("chat-messages-container");
    if (chatContainer) {
        chatContainer.innerHTML = `
            <div class="chat-message bot-msg d-flex mb-3">
                <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                    <i class="fas fa-robot fa-xs"></i>
                </div>
                <div class="msg-bubble p-3 rounded-4 shadow-sm" style="background: white; border: 1px solid var(--border); max-width: 80%; border-top-left-radius: 4px;">
                    <p class="mb-0 small fw-medium">Verlauf wurde geleert. Wie kann ich dir heute weiterhelfen?</p>
                </div>
            </div>
        `;
    }
}

// === TASTENDRUCK ABFANGEN ===
function handleChatKey(event) {
    if (event.key === "Enter") {
        event.preventDefault();
        sendUserMessage();
    }
}

// === FRAGE ABSENDEN (API CALL) ===
async function sendUserMessage() {
    const input = document.getElementById("archiv-chat-input");
    const chatContainer = document.getElementById("chat-messages-container");
    const sendBtn = document.getElementById("archiv-send-btn");

    if (!input || !input.value.trim()) return;

    const question = input.value.trim();
    input.value = ""; // Eingabefeld sofort leeren

    // 1. Benutzer-Nachricht im Chat einblenden
    const userMsgHtml = `
        <div class="chat-message user-msg d-flex mb-3 justify-content-end">
            <div class="msg-bubble p-3 rounded-4 shadow-sm text-white" style="background: linear-gradient(135deg, var(--primary), var(--primary-hover)); max-width: 80%; border-top-right-radius: 4px;">
                <p class="mb-0 small fw-medium">${escapeHtml(question)}</p>
            </div>
            <div class="avatar-small ms-2 bg-secondary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0; font-size: 0.75rem; font-weight: bold;">
                Ich
            </div>
        </div>
    `;
    chatContainer.insertAdjacentHTML("beforeend", userMsgHtml);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // 2. Tipp-Animation für die KI einblenden
    const botTypingId = `typing-${Date.now()}`;
    const botTypingHtml = `
        <div class="chat-message bot-msg d-flex mb-3" id="${botTypingId}">
            <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                <i class="fas fa-robot fa-xs"></i>
            </div>
            <div class="msg-bubble p-3 rounded-4 shadow-sm" style="background: white; border: 1px solid var(--border); max-width: 80%; border-top-left-radius: 4px;">
                <div class="d-flex align-items-center gap-1 py-1">
                    <span class="spinner-grow spinner-grow-sm text-muted" style="animation-duration: 0.7s;"></span>
                    <span class="spinner-grow spinner-grow-sm text-muted" style="animation-duration: 0.7s; animation-delay: 0.2s;"></span>
                    <span class="spinner-grow spinner-grow-sm text-muted" style="animation-duration: 0.7s; animation-delay: 0.4s;"></span>
                </div>
            </div>
        </div>
    `;
    chatContainer.insertAdjacentHTML("beforeend", botTypingHtml);
    chatContainer.scrollTop = chatContainer.scrollHeight;

    // Input sperren
    input.disabled = true;
    sendBtn.disabled = true;

    try {
        // 3. API Fetch an den Cloudflare Worker
        const res = await apiFetch('archiv', { action: 'ask' }, {
            method: 'POST',
            body: JSON.stringify({ question: question })
        });

        const data = await res.json();

        // Tipp-Animation entfernen
        const typingEl = document.getElementById(botTypingId);
        if (typingEl) typingEl.remove();

        if (data.success) {
            // 4. Antwort der KI rendern
            let sourcesHtml = "";
            if (data.sources && data.sources.length > 0) {
                const uniqueId = `sources-${Date.now()}`;
                sourcesHtml = `
                    <div class="mt-3 pt-2 border-top">
                        <span class="d-block small text-muted fw-bold mb-2">
                            <i class="fas fa-bookmark me-1 text-primary"></i> Gelesene Textpassagen (Relevanz):
                        </span>
                        <div class="accordion accordion-flush" id="${uniqueId}">
                            ${data.sources.map((src, index) => {
                                const collapseId = `${uniqueId}-collapse-${index}`;
                                const relevance = Math.round(src.similarity * 100);
                                const badgeClass = relevance > 80 ? 'bg-success-subtle text-success border-success-subtle' : 
                                                   relevance > 50 ? 'bg-warning-subtle text-warning border-warning-subtle' : 
                                                                    'bg-secondary-subtle text-secondary border-secondary-subtle';
                                return `
                                    <div class="accordion-item border-0 bg-transparent mb-1">
                                        <h2 class="accordion-header">
                                            <button class="accordion-button collapsed py-1.5 px-2 bg-light rounded text-secondary fs-8 border d-flex justify-content-between align-items-center w-100" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}" aria-expanded="false" style="box-shadow: none; font-size: 0.775rem;">
                                                <span class="text-truncate" style="max-width: 75%;"><i class="fas fa-file-alt me-1 text-primary"></i> <strong>${escapeHtml(src.document_name)}</strong> (${escapeHtml(src.protocol_date)})</span>
                                                <span class="badge border ${badgeClass} ms-auto me-2">${relevance}%</span>
                                            </button>
                                        </h2>
                                        <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#${uniqueId}">
                                            <div class="accordion-body p-2 bg-white border border-top-0 rounded-bottom fs-8 text-muted font-monospace" style="white-space: pre-wrap; line-height: 1.45; font-size: 0.75rem; max-height: 180px; overflow-y: auto;">
                                                ${escapeHtml(src.content)}
                                                <div class="mt-2 pt-2 border-top text-end">
                                                    <button class="btn btn-xs btn-outline-primary py-1 px-2 fw-semibold" onclick="openOriginalPdf('${escapeHtml(src.document_name)}', this)" style="font-size: 0.7rem; border-radius: 4px;">
                                                        <i class="fas fa-file-pdf me-1 text-danger"></i> Original-PDF in Google Drive öffnen
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join("")}
                        </div>
                    </div>
                `;
            }

            const botResponseHtml = `
                <div class="chat-message bot-msg d-flex mb-3">
                    <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                        <i class="fas fa-robot fa-xs"></i>
                    </div>
                    <div class="msg-bubble p-3 rounded-4 shadow-sm" style="background: white; border: 1px solid var(--border); max-width: 80%; border-top-left-radius: 4px;">
                        <div class="markdown-body small fw-medium" style="line-height: 1.5; white-space: pre-wrap;">${escapeHtml(data.answer)}</div>
                        ${sourcesHtml}
                    </div>
                </div>
            `;
            chatContainer.insertAdjacentHTML("beforeend", botResponseHtml);
        } else {
            // Fehler rendern
            const errorHtml = `
                <div class="chat-message bot-msg d-flex mb-3">
                    <div class="avatar-small me-2 bg-danger text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                        <i class="fas fa-exclamation-triangle fa-xs"></i>
                    </div>
                    <div class="msg-bubble p-3 rounded-4 shadow-sm border border-danger-subtle bg-danger-subtle text-danger" style="max-width: 80%; border-top-left-radius: 4px;">
                        <p class="mb-0 small fw-bold">Fehler beim Laden der Antwort</p>
                        <p class="mb-0 small">${escapeHtml(data.error || "Unbekannter Fehler im Cloudflare Worker.")}</p>
                    </div>
                </div>
            `;
            chatContainer.insertAdjacentHTML("beforeend", errorHtml);
        }

    } catch (err) {
        console.error("❌ Archiv Chat Fehler:", err);
        const typingEl = document.getElementById(botTypingId);
        if (typingEl) typingEl.remove();

        const errorHtml = `
            <div class="chat-message bot-msg d-flex mb-3">
                <div class="avatar-small me-2 bg-danger text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                    <i class="fas fa-wifi fa-xs"></i>
                </div>
                <div class="msg-bubble p-3 rounded-4 shadow-sm border border-danger-subtle bg-danger-subtle text-danger" style="max-width: 80%; border-top-left-radius: 4px;">
                    <p class="mb-0 small fw-bold">Verbindungsfehler</p>
                    <p class="mb-0 small">${escapeHtml(err.message)}</p>
                </div>
            </div>
        `;
        chatContainer.insertAdjacentHTML("beforeend", errorHtml);
    }

    chatContainer.scrollTop = chatContainer.scrollHeight;
    input.disabled = false;
    sendBtn.disabled = false;
    input.focus();
}

// === DOKUMENT INDEXIEREN (INGESTION) ===
async function handleIngest(event) {
    event.preventDefault();

    const submitBtn = document.getElementById("ingest-submit-btn");
    const progressContainer = document.getElementById("ingest-progress-container");
    const statusText = document.getElementById("ingest-status-text");

    const docName = document.getElementById("ingest-doc-name").value.trim();
    const docDate = document.getElementById("ingest-doc-date").value;
    const docCat = document.getElementById("ingest-doc-cat").value;
    const docText = document.getElementById("ingest-doc-text").value.trim();

    if (!docName || !docText) {
        showError("Bitte alle erforderlichen Felder ausfüllen.");
        return;
    }

    // UI sperren & Ladeanzeige einblenden
    submitBtn.disabled = true;
    progressContainer.classList.remove("d-none");
    statusText.innerText = "Text wird zerkleinert und Vektoren erzeugt...";

    try {
        const res = await apiFetch('archiv', { action: 'ingest' }, {
            method: 'POST',
            body: JSON.stringify({
                documentName: docName,
                date: docDate,
                category: docCat,
                text: docText
            })
        });

        const data = await res.json();

        if (data.success) {
            showSuccess(data.message || "Dokument erfolgreich indexiert!");
            // Formular zurücksetzen
            document.getElementById("ingest-doc-name").value = "";
            document.getElementById("ingest-doc-text").value = "";
            const dateHint = document.getElementById("date-hint");
            if (dateHint) dateHint.classList.add("d-none");
        } else {
            showError("Fehler beim Indexieren: " + (data.error || "Unbekannter Fehler."));
        }

    } catch (err) {
        console.error("❌ Ingestion Fehler:", err);
        showError("Indexierungs-Fehler: " + err.message);
    }

    submitBtn.disabled = false;
    progressContainer.classList.add("d-none");
}

// === PDF/WORD UPLOAD & OCR ===
async function handlePdfUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const lowerName = file.name.toLowerCase();
    if (lowerName.endsWith('.doc')) {
        showError("Fehler: Das alte Word-Format (.doc) wird aus Kompatibilitätsgründen nicht direkt unterstützt. Bitte öffne die Datei in Word, speichere sie als '.docx' (modernes Word-Format) oder als '.pdf' ab und lade sie dann erneut hoch.");
        event.target.value = "";
        return;
    }

    if (!lowerName.endsWith('.pdf') && !lowerName.endsWith('.docx')) {
        showError("Fehler: Es werden aktuell nur PDF-Dateien und moderne Word-Dokumente (.docx) unterstützt.");
        event.target.value = "";
        return;
    }

    const textArea = document.getElementById("ingest-doc-text");
    const spinner = document.getElementById("pdf-spinner");
    const docName = document.getElementById("ingest-doc-name");
    const progressContainer = document.getElementById("ingest-progress-container");
    const statusText = document.getElementById("ingest-status-text");
    const progressBar = progressContainer ? progressContainer.querySelector(".progress-bar") : null;

    if (progressContainer) {
        progressContainer.classList.remove("d-none");
        statusText.innerText = `Lese Datei aus: ${file.name}`;
        if (progressBar) {
            progressBar.style.width = `50%`;
            progressBar.classList.add("progress-bar-striped", "progress-bar-animated");
        }
    }
    
    spinner.classList.remove("d-none");
    if (lowerName.endsWith('.docx')) {
        textArea.value = "🔄 Word-Dokument wird direkt im Browser ausgelesen...";
    } else {
        textArea.value = "🔄 KI liest das PDF aus, bitte einen Moment Geduld...\n\nDies kann je nach Grösse des PDFs 10-20 Sekunden dauern...";
    }
    document.querySelector('label[for="ingest-pdf-file"]').style.pointerEvents = "none";
    document.querySelector('label[for="ingest-pdf-file"]').style.opacity = "0.5";
    
    // Dateinamen übernehmen, wenn noch leer
    if (!docName.value) {
        docName.value = file.name;
    }

    // Versuche das Datum aus dem Dateinamen zu extrahieren
    const extractedDate = extractDateFromFilename(file.name);
    const dateHint = document.getElementById("date-hint");
    
    if (extractedDate) {
        document.getElementById("ingest-doc-date").value = extractedDate;
        if (dateHint) {
            dateHint.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Aus Dateiname erkannt. Bitte prüfen!';
            dateHint.classList.remove("d-none");
        }
    } else {
        if (dateHint) dateHint.classList.add("d-none");
    }

    try {
        let extractedText = "";

        if (lowerName.endsWith('.docx')) {
            // Word-Datei parsen
            extractedText = await extractTextFromDocx(file);
        } else {
            // PDF via Cloudflare parsen
            // 1. Datei lokal lesen (Promise-basiert für sauberes Catching!)
            const base64Pdf = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = e => resolve(e.target.result.split(',')[1]);
                reader.onerror = () => reject(new Error("Fehler beim lokalen Lesen der PDF-Datei."));
                reader.readAsDataURL(file);
            });

            // 2. Text extrahieren (via Gemini)
            const response = await apiFetch('news', 'action=extract_pdf', {
                method: 'POST',
                body: JSON.stringify({
                    pdfData: base64Pdf
                })
            });

            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || `HTTP Error ${response.status}`);
            }

            const data = await response.json();
            extractedText = data.text;
            
            // Falls die KI im Text ein Datum gefunden hat, übernehmen wir das (überschreibt das Dateinamen-Datum)
            if (data.date) {
                document.getElementById("ingest-doc-date").value = data.date;
                if (dateHint) {
                    dateHint.innerHTML = '<i class="fas fa-magic"></i> Datum direkt im PDF-Text gefunden! Bitte kurz prüfen.';
                    dateHint.classList.remove("d-none");
                }
            }
        }
        
        // Text in das Textfeld einfügen
        textArea.value = extractedText;
        
        if (progressBar) progressBar.style.width = `100%`;
        showSuccess("Dokument erfolgreich ausgelesen! Du kannst den Text jetzt überprüfen.");

    } catch (err) {
        console.error("❌ Dokument-Auslese Fehler:", err);
        const formattedErr = lowerName.endsWith('.docx') ? `• ${file.name}: ${err.message}` : formatOcrError(err, file.name);
        showError(formattedErr);
        textArea.value = "";
        textArea.placeholder = "Kopiere den Text des Protokolls hier hinein ODER lade oben ein PDF/Word-Dokument hoch...";
        if (progressBar) progressBar.style.width = `0%`;
    } finally {
        spinner.classList.add("d-none");
        document.querySelector('label[for="ingest-pdf-file"]').style.pointerEvents = "auto";
        document.querySelector('label[for="ingest-pdf-file"]').style.opacity = "1";
        
        // Progress Container nach einer kurzen Verzögerung ausblenden
        if (progressContainer) {
            setTimeout(() => {
                progressContainer.classList.add("d-none");
            }, 1000);
        }
        
        // Input resetten, damit selbes File nochmal hochgeladen werden kann
        event.target.value = "";
    }
}

// === BATCH UPLOAD (STAPELVERARBEITUNG) ===
async function handleBatchUpload(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Filtere nach PDF- und DOCX-Dateien und melde unzulässige Formate
    const validFiles = [];
    const invalidFiles = [];
    let docFilesCount = 0;

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const lowerName = file.name.toLowerCase();
        if (lowerName.endsWith('.pdf') || lowerName.endsWith('.docx')) {
            validFiles.push(file);
        } else if (lowerName.endsWith('.doc')) {
            docFilesCount++;
            invalidFiles.push(file.name);
        } else {
            invalidFiles.push(file.name);
        }
    }

    if (validFiles.length === 0) {
        if (docFilesCount > 0) {
            showError("Fehler: Keine gültigen PDF- oder DOCX-Dateien ausgewählt. Das alte Word-Format (.doc) wird aus Kompatibilitätsgründen nicht direkt unterstützt. Bitte öffne die Datei in Word und speichere sie als '.docx' (modernes Word-Format) oder als '.pdf' ab, bevor du sie hochlädst.");
        } else {
            showError("Fehler: Keine gültigen PDF- oder DOCX-Dateien ausgewählt. Es werden nur .pdf und .docx Dateien unterstützt.");
        }
        event.target.value = "";
        return;
    }

    if (invalidFiles.length > 0) {
        if (docFilesCount > 0) {
            showError(`Hinweis: ${invalidFiles.length} Datei(en) wurden ignoriert, da sie kein unterstütztes Format haben (nur PDF oder DOCX erlaubt). Davon ${docFilesCount} alte .doc-Dateien.`, 8000);
        } else {
            showError(`Hinweis: ${invalidFiles.length} Datei(en) wurden ignoriert, da sie keine PDF- oder DOCX-Dateien sind.`, 6000);
        }
    }

    const spinner = document.getElementById("batch-spinner");
    const progressContainer = document.getElementById("ingest-progress-container");
    const statusText = document.getElementById("ingest-status-text");
    const docCat = document.getElementById("ingest-doc-cat").value;
    const defaultDate = document.getElementById("ingest-doc-date").value;
    const progressBar = progressContainer.querySelector(".progress-bar");

    spinner.classList.remove("d-none");
    progressContainer.classList.remove("d-none");
    document.getElementById("ingest-submit-btn").disabled = true;

    let successCount = 0;
    let failCount = 0;
    let failedFiles = [];

    for (let i = 0; i < validFiles.length; i++) {
        const file = validFiles[i];
        const lowerName = file.name.toLowerCase();
        
        statusText.innerText = `Verarbeite Datei ${i + 1} von ${validFiles.length}: ${file.name}`;
        progressBar.style.width = `${Math.round((i / validFiles.length) * 100)}%`;

        try {
            let extractedText = "";
            let fileDate = defaultDate;

            if (lowerName.endsWith('.docx')) {
                // Word-Datei parsen
                extractedText = await extractTextFromDocx(file);
                fileDate = extractDateFromFilename(file.name) || defaultDate;
            } else {
                // PDF-Datei parsen
                // 1. Datei lokal lesen
                const base64Pdf = await new Promise((resolve, reject) => {
                    const reader = new FileReader();
                    reader.onload = e => resolve(e.target.result.split(',')[1]);
                    reader.onerror = reject;
                    reader.readAsDataURL(file);
                });

                // 2. Text extrahieren (via Gemini)
                const ocrRes = await apiFetch('news', 'action=extract_pdf', {
                    method: 'POST',
                    body: JSON.stringify({ pdfData: base64Pdf })
                });

                if (!ocrRes.ok) {
                    const errData = await ocrRes.json().catch(() => ({}));
                    throw new Error(`OCR Fehlgeschlagen: ${errData.error || ocrRes.status}`);
                }
                const ocrData = await ocrRes.json();
                extractedText = ocrData.text;

                // KI-Datum bevorzugen, dann Dateiname-Datum, dann Standarddatum
                fileDate = ocrData.date || extractDateFromFilename(file.name) || defaultDate;
            }

            const ingestRes = await apiFetch('archiv', { action: 'ingest' }, {
                method: 'POST',
                body: JSON.stringify({
                    documentName: file.name,
                    date: fileDate,
                    category: docCat,
                    text: extractedText
                })
            });

            const ingestData = await ingestRes.json();
            if (ingestData.success) {
                successCount++;
            } else {
                failCount++;
                console.error(`Indexierung fehlgeschlagen für ${file.name}:`, ingestData.error);
                failedFiles.push(`• ${file.name}: Indexierung fehlgeschlagen: ${ingestData.error || 'Unbekannt'}`);
            }

        } catch (err) {
            console.error(`Fehler bei ${file.name}:`, err);
            const formattedErr = lowerName.endsWith('.docx') ? `• ${file.name}: ${err.message}` : formatOcrError(err, file.name);
            failedFiles.push(formattedErr);
            failCount++;
        }
    }

    progressBar.style.width = `100%`;
    spinner.classList.add("d-none");
    document.getElementById("ingest-submit-btn").disabled = false;
    
    // Status anzeigen
    setTimeout(() => {
        progressContainer.classList.add("d-none");
        if (failCount === 0) {
            showSuccess(`Alle ${successCount} Dokumente wurden erfolgreich verarbeitet und archiviert!`);
        } else {
            const errorTitle = `Archivierung abgeschlossen: ${successCount} erfolgreich, ${failCount} fehlgeschlagen.\n\nFolgende Fehler sind aufgetreten:\n`;
            const errorBody = failedFiles.join("\n");
            showError(errorTitle + errorBody, 10000); // Zeige den Fehler für 10 Sekunden an
        }
    }, 2000);

    // Input reset
    event.target.value = "";
}

// === ORIGINAL-PDF IN GOOGLE DRIVE ÖFFNEN ===
async function openOriginalPdf(filename, btn) {
    if (!filename) return;
    const originalContent = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true" style="width: 10px; height: 10px;"></span> Lade PDF...`;

    try {
        const res = await apiFetch('archiv', { action: 'getPdfLink', filename: filename });
        const data = await res.json();
        
        if (data.success && data.url) {
            window.open(data.url, '_blank');
        } else {
            showError(data.error || "Die PDF-Datei konnte auf Google Drive nicht gefunden werden. Bitte stelle sicher, dass sie im Google Drive 'Vorstand'-Ordner abgelegt ist.");
        }
    } catch (err) {
        console.error("❌ PDF-Link Fehler:", err);
        showError("Fehler beim Abrufen des PDF-Links: " + err.message);
    }

    btn.disabled = false;
    btn.innerHTML = originalContent;
}



// Hilfsfunktion: Datum aus Dateinamen extrahieren
function extractDateFromFilename(filename) {
    // 1. Format: DD.MM.YYYY oder DD-MM-YYYY oder DD_MM_YYYY
    const dmyMatch = filename.match(/(\d{1,2})[\.\-\_](\d{1,2})[\.\-\_](\d{4})/);
    if (dmyMatch) {
        let day = dmyMatch[1].padStart(2, '0');
        let month = dmyMatch[2].padStart(2, '0');
        let year = dmyMatch[3];
        return `${year}-${month}-${day}`;
    }

    // 2. Format: YYYY-MM-DD oder YYYY_MM_DD
    const ymdMatch = filename.match(/(\d{4})[\.\-\_](\d{1,2})[\.\-\_](\d{1,2})/);
    if (ymdMatch) {
        let year = ymdMatch[1];
        let month = ymdMatch[2].padStart(2, '0');
        let day = ymdMatch[3].padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // 3. Format: YYYYMMDD (z.B. 20110207)
    const ymdCompactMatch = filename.match(/(19|20)(\d{2})(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])/);
    if (ymdCompactMatch) {
        let year = ymdCompactMatch[1] + ymdCompactMatch[2];
        let month = ymdCompactMatch[3];
        let day = ymdCompactMatch[4];
        return `${year}-${month}-${day}`;
    }

    // 4. Nur ein Jahr (YYYY) - Setzt als Datum den 1. Januar dieses Jahres
    const yearMatch = filename.match(/(?:^|[^0-9])(19\d{2}|20\d{2})(?:[^0-9]|$)/);
    if (yearMatch) {
        return `${yearMatch[1]}-01-01`;
    }

    return null; // Kein Datum gefunden
}

// Hilfsfunktion: Fehler für OCR/Extraktion einheitlich formatieren und verständlich übersetzen
function formatOcrError(err, filename) {
    let msg = err.message || String(err);
    
    // Versuche, ein verschachteltes JSON-Objekt im Fehlertext zu finden
    if (msg.includes('{')) {
        try {
            const jsonPart = msg.substring(msg.indexOf('{'));
            const parsed = JSON.parse(jsonPart);
            if (parsed.error && parsed.error.message) {
                msg = parsed.error.message;
                const code = parsed.error.code;
                if (code === 429) {
                    return `• ${filename}: Tageslimit der KI-Anfragen erreicht (Quota Exceeded). Bitte versuche es morgen wieder!`;
                }
                if (code === 503 || parsed.error.status === 'UNAVAILABLE') {
                    return `• ${filename}: Die Gemini-KI ist aktuell überlastet (503 Service Unavailable). Bitte versuche es gleich noch einmal.`;
                }
            }
        } catch (e) {
            // Falls Parsen fehlschlägt, weitergehen
        }
    }
    
    if (msg.includes("429") || msg.includes("quota") || msg.includes("Quota exceeded") || msg.includes("RESOURCE_EXHAUSTED")) {
        return `• ${filename}: Tageslimit der KI-Anfragen erreicht. Bitte versuche es morgen wieder!`;
    }
    if (msg.includes("503") || msg.includes("overload") || msg.includes("UNAVAILABLE")) {
        return `• ${filename}: Die Gemini-KI ist aktuell überlastet. Bitte versuche es gleich noch einmal.`;
    }
    if (msg.includes("Keine PDF-Daten") || msg.includes("No PDF data")) {
        return `• ${filename}: Keine lesbaren PDF-Daten gefunden. Ist das PDF eventuell leer oder beschädigt?`;
    }
    
    return `• ${filename}: ${msg}`;
}

// Hilfsfunktion: Text aus einer Word-Datei (.docx) auslesen via Mammoth.js
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
                    const text = result.value || "";
                    resolve(text.trim());
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
