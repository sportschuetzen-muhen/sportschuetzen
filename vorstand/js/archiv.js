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

    // HTML-Struktur mit Tabs & Modern Design
    container.innerHTML = `
        <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
            <div>
                <h2 class="fw-bold text-primary mb-1" style="letter-spacing: -0.5px;">
                    <i class="fas fa-box-archive me-2 text-primary"></i>Vereins-Archiv & KI
                </h2>
                <p class="text-muted small mb-0">Zentrales Vereinsarchiv mit Google Drive Anbindung & KI-Verarbeitung</p>
            </div>
            <div class="badge bg-primary-light text-primary px-3 py-2 rounded-pill fw-semibold" id="archiv-badge">
                <i class="fab fa-google-drive me-1 text-warning"></i> Drive + Paperless AI
            </div>
        </div>

        <!-- TAB NAVIGATION -->
        <ul class="nav nav-pills custom-tabs mb-4 p-1.5 rounded-pill bg-white shadow-sm border" style="max-width: max-content;">
            <li class="nav-item">
                <button class="nav-link fw-bold px-4 py-2.5 rounded-pill text-secondary" id="tab-btn-ki" onclick="switchArchivTab('ki')">
                    <i class="fas fa-robot me-2 text-primary"></i>KI-Archiv-Assistent
                </button>
            </li>
            <li class="nav-item">
                <button class="nav-link active fw-bold px-4 py-2.5 rounded-pill bg-primary text-white" id="tab-btn-gdrive" onclick="switchArchivTab('gdrive')">
                    <i class="fab fa-google-drive me-2 text-warning"></i>Google Drive Archiv
                </button>
            </li>
        </ul>

        <div class="archiv-wrapper">
            <!-- TAB 2: GOOGLE DRIVE ARCHIV (ORDNER-EXPLORER) -->
            <div id="archiv-tab-gdrive" class="tab-pane-content">
                <div class="card border-0 shadow-lg p-4 mb-4" style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(12px); border-radius: 20px;">
                    <div class="d-flex align-items-center justify-content-between flex-wrap gap-3 mb-3">
                        <div>
                            <h5 class="fw-bold text-primary mb-1">
                                <i class="fab fa-google-drive me-2 text-warning"></i>Google Drive Ordner-Explorer
                            </h5>
                            <small class="text-muted">Greife direkt auf die Vereinsdokumente und Protokolle im Google Drive zu.</small>
                        </div>
                        <div class="d-flex align-items-center gap-2">
                            <div class="btn-group btn-group-sm" role="group">
                                <input type="radio" class="btn-check" name="gdrive-view" id="gdrive-view-list" checked onchange="renderGDriveIframe()">
                                <label class="btn btn-outline-secondary px-3" for="gdrive-view-list"><i class="fas fa-list me-1"></i>Liste</label>

                                <input type="radio" class="btn-check" name="gdrive-view" id="gdrive-view-grid" onchange="renderGDriveIframe()">
                                <label class="btn btn-outline-secondary px-3" for="gdrive-view-grid"><i class="fas fa-th-large me-1"></i>Raster</label>
                            </div>
                            <button class="btn btn-sm btn-outline-primary rounded-3 px-3" onclick="openGDriveExternal()">
                                <i class="fas fa-external-link-alt me-1"></i> In Drive öffnen
                            </button>
                        </div>
                    </div>

                    <!-- INPUT FELD FÜR ORDNER-ID / LINK -->
                    <div class="p-3 rounded-3 bg-light border mb-4">
                        <label class="form-label small fw-bold text-muted mb-1">
                            <i class="fas fa-link me-1 text-primary"></i> Google Drive Ordner-ID oder Link konfigurieren
                        </label>
                        <div class="input-group">
                            <input type="text" id="gdrive-folder-input" class="form-control rounded-start-3" placeholder="z. B. 1a2b3c4d5e6f7... oder https://drive.google.com/drive/folders/..." style="font-size: 0.875rem;">
                            <button class="btn btn-primary px-4 fw-bold rounded-end-3" onclick="loadGDriveFolder()">
                                <i class="fas fa-sync-alt me-1"></i> Ordner laden & speichern
                            </button>
                        </div>
                        <div class="form-text small text-muted mt-1">
                            <i class="fas fa-info-circle text-info me-1"></i>
                            Kopiere einfach den Link deines Vereinsarchiv-Ordners aus Google Drive hier hinein. Der Ordner sollte auf <em>"Jeder mit dem Link kann ansehen"</em> freigegeben sein.
                        </div>
                    </div>

                    <!-- CONTAINER FÜR EMBEDDED IFRAME -->
                    <div id="gdrive-iframe-container" class="position-relative">
                        <div class="text-center p-5 text-muted">
                            <div class="spinner-border text-primary" role="status"></div>
                            <p class="mt-2 small">Lade Google Drive Ordner...</p>
                        </div>
                    </div>
                </div>
            </div>

            <!-- TAB 1: KI-ARCHIV-ASSISTENT (LIVE INTERFACE) -->
            <div id="archiv-tab-ki" class="tab-pane-content d-none">
                <div class="row g-4">
                    <!-- CHATBOT-INTERFACE -->
                    <div class="col-lg-12">
                        <div class="card border-0 shadow-lg p-0 overflow-hidden" style="background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(12px); border-radius: 20px;">
                            <!-- Chat Header -->
                            <div class="p-3 border-bottom d-flex align-items-center justify-content-between" style="background: linear-gradient(135deg, var(--primary), var(--primary-hover)); color: white;">
                                <div class="d-flex align-items-center">
                                    <div class="position-relative me-3">
                                        <div class="bg-white text-primary rounded-circle d-flex align-items-center justify-content-center" style="width: 44px; height: 44px; box-shadow: 0 4px 10px rgba(0,0,0,0.15);">
                                            <i class="fas fa-robot fa-lg text-primary animate-pulse"></i>
                                        </div>
                                        <span class="position-absolute bottom-0 end-0 bg-success border border-white border-2 rounded-circle" style="width: 12px; height: 12px;"></span>
                                    </div>
                                    <div>
                                        <h6 class="mb-0 fw-bold" id="archiv-ai-header-title">Vereins-Archivar (Groq & Supabase RAG)</h6>
                                        <small class="opacity-75" id="archiv-ai-header-subtitle">Volltext & KI-Suche in allen GV- & Vorstandsprotokollen</small>
                                    </div>
                                </div>
                                <div class="d-flex align-items-center gap-2">
                                    <button class="btn btn-sm btn-outline-light rounded-pill px-3 py-1 fs-8 text-white border-white-50" onclick="openArchivAiSettingsModal()" title="KI-Modell & Endpunkt anpassen">
                                        <i class="fas fa-cog me-1"></i> <span id="archiv-model-badge">qwen3.8-27b</span>
                                    </button>
                                    <button class="btn btn-sm btn-link text-white opacity-75 hover-opacity-100 text-decoration-none" onclick="clearChat()">
                                        <i class="fas fa-trash-alt me-1"></i> Verlauf leeren
                                    </button>
                                </div>
                            </div>

                            <!-- Chat Messages Area -->
                            <div id="chat-messages-container" class="p-4 overflow-y-auto" style="height: 480px; background: rgba(248, 250, 252, 0.5);">
                                <div class="chat-message bot-msg d-flex mb-3">
                                    <div class="avatar-small me-2 bg-primary text-white rounded-circle d-flex align-items-center justify-content-center" style="width: 32px; height: 32px; flex-shrink: 0;">
                                        <i class="fas fa-robot fa-xs"></i>
                                    </div>
                                    <div class="msg-bubble p-3 rounded-4 shadow-sm" style="background: white; border: 1px solid var(--border); max-width: 85%; border-top-left-radius: 4px;">
                                        <p class="mb-0 small fw-medium">Grüezi! Ich bin euer intelligenter KI-Archiv-Assistent. Ich durchsuche alle eingelesenen Protokolle und Dokumente mit <strong>Groq & Supabase Hybrid-RAG</strong>.</p>
                                        <hr class="my-2 opacity-25">

                                        <p class="mb-0 small text-muted"><strong>Tipp:</strong> Stelle eine Frage zu Beschlüssen, Personen, Jahreszahlen oder Verträgen des Vereins.</p>
                                    </div>
                                </div>
                            </div>

                            <!-- Schnellwahltasten / Suggestions -->
                            <div class="px-4 py-2 border-top bg-light d-flex flex-wrap gap-2 align-items-center">
                                <span class="small text-muted fw-bold me-1"><i class="fas fa-lightbulb me-1"></i>Beispiele:</span>
                                <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-3 fs-7" onclick="askPreset('Wer ist aktuell im Vorstand vertreten?')">Wer ist im Vorstand?</button>
                                <button class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-3 fs-7" onclick="askPreset('Was wurde bezüglich des Wasserschadens in der Schützenstube beschlossen?')">Wasserschaden Schützenstube</button>
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
                </div>
            </div>
        </div>
    `;

    // Standard-Tab laden (Google Drive)
    switchArchivTab('gdrive');
    loadArchivAiConfig();
}

// === TAB SWITCHER & GOOGLE DRIVE VIEWER LOGIK ===
function switchArchivTab(tabName) {
    const tabKi = document.getElementById("archiv-tab-ki");
    const tabGdrive = document.getElementById("archiv-tab-gdrive");
    const btnKi = document.getElementById("tab-btn-ki");
    const btnGdrive = document.getElementById("tab-btn-gdrive");

    if (tabName === 'gdrive') {
        if (tabKi) tabKi.classList.add("d-none");
        if (tabGdrive) tabGdrive.classList.remove("d-none");
        if (btnKi) {
            btnKi.classList.remove("active", "bg-primary", "text-white");
            btnKi.classList.add("text-secondary");
        }
        if (btnGdrive) {
            btnGdrive.classList.add("active", "bg-primary", "text-white");
            btnGdrive.classList.remove("text-secondary");
        }
        initGDriveViewer();
    } else {
        if (tabGdrive) tabGdrive.classList.add("d-none");
        if (tabKi) tabKi.classList.remove("d-none");
        if (btnGdrive) {
            btnGdrive.classList.remove("active", "bg-primary", "text-white");
            btnGdrive.classList.add("text-secondary");
        }
        if (btnKi) {
            btnKi.classList.add("active", "bg-primary", "text-white");
            btnKi.classList.remove("text-secondary");
        }
    }
}

function extractGDriveFolderId(input) {
    if (!input) return "";
    input = input.trim();
    const match = input.match(/\/folders\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
        return match[1];
    }
    const matchQuery = input.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (matchQuery && matchQuery[1]) {
        return matchQuery[1];
    }
    return input;
}

function initGDriveViewer() {
    const savedId = localStorage.getItem("gdrive_archiv_folder_id") || "";
    const savedView = localStorage.getItem("gdrive_archiv_view_mode") || "list";
    const inputEl = document.getElementById("gdrive-folder-input");
    if (inputEl && !inputEl.value && savedId) {
        inputEl.value = savedId;
    }
    
    if (savedView === 'grid') {
        const gridRadio = document.getElementById("gdrive-view-grid");
        if (gridRadio) gridRadio.checked = true;
    } else {
        const listRadio = document.getElementById("gdrive-view-list");
        if (listRadio) listRadio.checked = true;
    }

    renderGDriveIframe();
}

function loadGDriveFolder() {
    const inputEl = document.getElementById("gdrive-folder-input");
    if (!inputEl) return;
    
    const rawVal = inputEl.value.trim();
    const folderId = extractGDriveFolderId(rawVal);
    
    if (!folderId) {
        if (typeof showError === "function") showError("Bitte eine gültige Google Drive Ordner-ID oder einen Ordner-Link eingeben.");
        return;
    }
    
    localStorage.setItem("gdrive_archiv_folder_id", folderId);
    inputEl.value = folderId;
    renderGDriveIframe();
    if (typeof showSuccess === "function") showSuccess("Google Drive Ordner erfolgreich geladen & gespeichert!");
}

function renderGDriveIframe() {
    const iframeContainer = document.getElementById("gdrive-iframe-container");
    if (!iframeContainer) return;

    const folderId = localStorage.getItem("gdrive_archiv_folder_id") || "";
    const isGrid = document.getElementById("gdrive-view-grid")?.checked;
    const viewMode = isGrid ? "grid" : "list";
    localStorage.setItem("gdrive_archiv_view_mode", viewMode);

    if (!folderId) {
        iframeContainer.innerHTML = `
            <div class="text-center p-5 text-muted border border-2 border-dashed rounded-4 bg-light">
                <i class="fab fa-google-drive fa-3x mb-3 text-warning opacity-75"></i>
                <h5 class="fw-bold">Kein Google Drive Ordner konfiguriert</h5>
                <p class="small text-muted mb-0">Füge oben die Google Drive Ordner-ID oder den Link zu deinem Vereinsarchiv ein und klicke auf "Ordner laden".</p>
            </div>
        `;
        return;
    }

    const embedUrl = `https://drive.google.com/embeddedfolderview?id=${encodeURIComponent(folderId)}#${viewMode}`;
    iframeContainer.innerHTML = `
        <iframe src="${embedUrl}" 
                style="width: 100%; height: 680px; border: 0; border-radius: 16px; box-shadow: 0 10px 30px rgba(0,0,0,0.08); background: #ffffff;" 
                allowfullscreen>
        </iframe>
    `;
}

function openGDriveExternal() {
    const folderId = localStorage.getItem("gdrive_archiv_folder_id") || "";
    if (folderId) {
        window.open(`https://drive.google.com/drive/folders/${folderId}`, '_blank');
    } else {
        window.open('https://drive.google.com/', '_blank');
    }
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

        // 3. API Fetch an den Cloudflare Worker (mit dynamischer Modell- & Proxy-Konfiguration)
        const res = await apiFetch('archiv', { action: 'ask' }, {
            method: 'POST',
            body: JSON.stringify({ 
                question: question,
                model: archivAiConfig.model,
                endpoint: archivAiConfig.endpoint,
                token: archivAiConfig.token
            })
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
            loadIndexedDocuments();
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

// === INDEXIERTE DOKUMENTE LADEN ===
async function loadIndexedDocuments() {
    const listContainer = document.getElementById("indexed-docs-list");
    if (!listContainer) return;

    try {
        const res = await apiFetch('archiv', { action: 'getDocuments' });
        if (!res.ok) {
            throw new Error(`HTTP Fehler ${res.status}`);
        }
        const data = await res.json();
        
        if (data.success && data.documents && data.documents.length > 0) {
            listContainer.innerHTML = data.documents.map(doc => {
                const badgeClass = doc.category === 'gv' ? 'bg-info-subtle text-info border-info-subtle' :
                                   doc.category === 'vorstand' ? 'bg-primary-subtle text-primary border-primary-subtle' :
                                                                 'bg-secondary-subtle text-secondary border-secondary-subtle';
                const categoryLabel = doc.category === 'gv' ? 'GV' : doc.category === 'vorstand' ? 'Vorstand' : 'Sonstiges';
                return `
                    <div class="d-flex justify-content-between align-items-center p-2 mb-2 border-bottom">
                        <div class="text-truncate me-2" style="max-width: 80%;">
                            <strong class="d-block text-dark text-truncate" title="${escapeHtml(doc.document_name)}">${escapeHtml(doc.document_name)}</strong>
                            <small class="text-muted">${doc.protocol_date || 'Kein Datum'} &bull; <span class="badge border ${badgeClass}" style="font-size: 0.65rem; padding: 2px 4px;">${categoryLabel}</span> &bull; ${doc.chunks} Abschnitte</small>
                        </div>
                        <button class="btn btn-xs btn-outline-danger p-1" onclick="deleteIndexedDocument('${escapeHtml(doc.document_name)}')" title="Dokument löschen">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                `;
            }).join("");
        } else {
            listContainer.innerHTML = `
                <div class="text-muted text-center py-3">
                    <i class="fas fa-info-circle mb-2 fa-lg d-block"></i>
                    Noch keine Dokumente vorhanden.
                </div>
            `;
        }
    } catch (err) {
        console.error("❌ Fehler beim Laden der indexierten Dokumente:", err);
        listContainer.innerHTML = `<div class="text-danger text-center py-3">Fehler beim Laden: ${escapeHtml(err.message)}</div>`;
    }
}

// === INDEXIERTES DOKUMENT LÖSCHEN ===
async function deleteIndexedDocument(docName) {
    if (!confirm(`Möchtest du das Dokument '${docName}' und all seine Vektoren wirklich aus dem Archiv löschen?`)) {
        return;
    }

    try {
        const res = await apiFetch('archiv', { action: 'deleteDocument' }, {
            method: 'POST',
            body: JSON.stringify({ documentName: docName })
        });
        if (!res.ok) {
            throw new Error(`HTTP Fehler ${res.status}`);
        }
        const data = await res.json();
        if (data.success) {
            showSuccess(data.message || "Dokument erfolgreich gelöscht.");
            loadIndexedDocuments();
        } else {
            showError("Fehler beim Löschen: " + (data.error || "Unbekannter Fehler."));
        }
    } catch (err) {
        console.error("❌ Fehler beim Löschen des Dokuments:", err);
        showError("Lösch-Fehler: " + err.message);
    }
}

// === ALLE VEKTOREN NEU GENERIEREN (MIGRATION) ===
async function reindexAllVectors(btn) {
    if (!confirm("Möchtest du alle Vektoren im Archiv neu generieren? Dies reichert die Vektoren mit dem Dokumentnamen an, damit Suchen nach Dateinamen (wie 'ZSA') besser gefunden werden. Es dauert einige Sekunden pro Dokument.")) {
        return;
    }

    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span> Aktualisiere...`;

    try {
        // 1. Liste aller IDs holen
        const listRes = await apiFetch('archiv', { action: 'getChunksList' });
        if (!listRes.ok) throw new Error("Fehler beim Abrufen der Vektor-Liste.");
        const listData = await listRes.json();

        if (!listData.success || !listData.ids || listData.ids.length === 0) {
            showSuccess("Keine Dokumente zum Aktualisieren vorhanden.");
            btn.disabled = false;
            btn.innerHTML = originalText;
            return;
        }

        const ids = listData.ids;
        const total = ids.length;
        const batchSize = 30;
        let processed = 0;

        showSuccess(`Starte Vektor-Aktualisierung für ${total} Abschnitte in ${Math.ceil(total/batchSize)} Batches...`);

        // 2. Batches nacheinander abarbeiten
        for (let i = 0; i < total; i += batchSize) {
            const batch = ids.slice(i, i + batchSize);
            const res = await apiFetch('archiv', { action: 'reindexBatch' }, {
                method: 'POST',
                body: JSON.stringify({ ids: batch })
            });

            if (!res.ok) {
                const errData = await res.json();
                throw new Error(errData.error || `Fehler bei Batch ${i/batchSize + 1}`);
            }

            processed += batch.length;
            console.log(`📡 Vektor-Aktualisierung: Batch ${i/batchSize + 1} abgeschlossen (${processed}/${total})`);
        }

        showSuccess("Vektoren erfolgreich für alle " + total + " Abschnitte neu generiert!");
        loadIndexedDocuments();
    } catch (e) {
        console.error("❌ Fehler bei Vektor-Aktualisierung:", e);
        showError("Aktualisierungs-Fehler: " + e.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// ==============================================================================
// DYNAMISCHE KI-MODELL- & ENDPUNKT-KONFIGURATION
// Ermöglicht den schnellen Wechsel des Modells (z.B. qwen3.8-27b, llama-3.3-70b)
// ==============================================================================
let archivAiConfig = {
    model: localStorage.getItem('archiv_ai_model') || 'qwen/qwen3.8-27b',
    endpoint: localStorage.getItem('archiv_ai_endpoint') || 'https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions',
    token: localStorage.getItem('archiv_ai_token') || 'ha_token_8d7f2a1b9c3e5f4a6b0d8e2f1c9a4b5d'
};

async function loadArchivAiConfig() {
    try {
        const SUPABASE_REST_URL = 'https://supabase-muhen.danfamily.uk/rest/v1';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';

        const res = await fetch(`${SUPABASE_REST_URL}/system_app_configs?category=eq.archiv&select=key,value`, {
            headers: {
                'apikey': SUPABASE_ANON_KEY,
                'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
            }
        });

        if (res.ok) {
            const configs = await res.json();
            if (Array.isArray(configs) && configs.length > 0) {
                configs.forEach(c => {
                    if (c.key === 'archiv_ai_model' && c.value) {
                        archivAiConfig.model = c.value;
                        localStorage.setItem('archiv_ai_model', c.value);
                    }
                    if (c.key === 'archiv_ai_endpoint' && c.value) {
                        archivAiConfig.endpoint = c.value;
                        localStorage.setItem('archiv_ai_endpoint', c.value);
                    }
                    if (c.key === 'archiv_ai_token' && c.value) {
                        archivAiConfig.token = c.value;
                        localStorage.setItem('archiv_ai_token', c.value);
                    }
                });
            }
        }
    } catch (err) {
        console.warn('Archiv AI Config aus Supabase nicht geladen, verwende lokalen Cache:', err);
    }
    updateArchivAiHeaderBadge();
}

function updateArchivAiHeaderBadge() {
    const badge = document.getElementById('archiv-model-badge');
    const headerTitle = document.getElementById('archiv-ai-header-title');
    const shortName = archivAiConfig.model.split('/').pop();
    if (badge) {
        badge.innerText = shortName;
    }
    if (headerTitle) {
        headerTitle.innerText = `Vereins-Archivar (${shortName} & Hybrid-RAG)`;
    }
}

function openArchivAiSettingsModal() {
    let modalEl = document.getElementById('archiv-ai-settings-modal');
    if (!modalEl) {
        const modalHtml = `
            <div class="modal fade" id="archiv-ai-settings-modal" tabindex="-1" aria-labelledby="archivAiSettingsModalLabel" aria-hidden="true">
                <div class="modal-dialog modal-dialog-centered">
                    <div class="modal-content border-0 shadow-lg" style="border-radius: 16px;">
                        <div class="modal-header bg-light border-bottom">
                            <h5 class="modal-title fw-bold" id="archivAiSettingsModalLabel">
                                <i class="fas fa-sliders-h text-primary me-2"></i>KI-Archiv-Konfiguration
                            </h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Schliessen"></button>
                        </div>
                        <div class="modal-body p-4">
                            <p class="small text-muted mb-3">
                                Hier kannst du das aktive Sprachmodell und den API-Proxy jederzeit anpassen, ohne den Programmcode zu ändern.
                            </p>

                            <!-- PRESETS -->
                            <div class="mb-3">
                                <label class="form-label small fw-bold text-muted mb-1">Empfohlene Modelle (1-Klick-Schnellwahl):</label>
                                <div class="d-flex flex-wrap gap-1">
                                    <button type="button" class="btn btn-xs btn-outline-primary rounded-pill py-1 px-2.5 fs-8" onclick="applyArchivModelPreset('qwen/qwen3.8-27b')">
                                        ⚡ Qwen 3.8 27B (Groq)
                                    </button>
                                    <button type="button" class="btn btn-xs btn-outline-primary rounded-pill py-1 px-2.5 fs-8" onclick="applyArchivModelPreset('openai/gpt-oss-120b')">
                                        🧠 GPT-OSS 120B (Groq)
                                    </button>
                                    <button type="button" class="btn btn-xs btn-outline-secondary rounded-pill py-1 px-2.5 fs-8" onclick="applyArchivLocalOllamaPreset()">
                                        🏠 Lokales Ollama (GTX 1070)
                                    </button>
                                </div>
                            </div>

                            <div class="mb-3">
                                <label for="archiv-cfg-model" class="form-label small fw-bold">Modell-Name (ID):</label>
                                <input type="text" class="form-control font-monospace fs-8" id="archiv-cfg-model" placeholder="z. B. qwen/qwen3.8-27b">
                                <div class="form-text small">Aktiver Modell-Identifier auf Groq oder im lokalen LLM.</div>
                            </div>

                            <div class="mb-3">
                                <label for="archiv-cfg-endpoint" class="form-label small fw-bold">API-Endpunkt (Chat-Proxy):</label>
                                <input type="text" class="form-control font-monospace fs-8" id="archiv-cfg-endpoint" placeholder="https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions">
                            </div>

                            <div class="mb-3">
                                <label for="archiv-cfg-token" class="form-label small fw-bold">Proxy Bearer-Token:</label>
                                <input type="password" class="form-control font-monospace fs-8" id="archiv-cfg-token" placeholder="Bearer Token">
                            </div>
                        </div>
                        <div class="modal-footer bg-light border-top">
                            <button type="button" class="btn btn-sm btn-outline-secondary px-3" data-bs-dismiss="modal">Abbrechen</button>
                            <button type="button" class="btn btn-sm btn-primary px-4 fw-bold" onclick="saveArchivAiSettingsFromModal()">
                                <i class="fas fa-check me-1"></i> Speichern & Aktivieren
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
        document.body.insertAdjacentHTML('beforeend', modalHtml);
        modalEl = document.getElementById('archiv-ai-settings-modal');
    }

    // Werte füllen
    document.getElementById('archiv-cfg-model').value = archivAiConfig.model;
    document.getElementById('archiv-cfg-endpoint').value = archivAiConfig.endpoint;
    document.getElementById('archiv-cfg-token').value = archivAiConfig.token;

    if (window.bootstrap && window.bootstrap.Modal) {
        const modalInstance = new bootstrap.Modal(modalEl);
        modalInstance.show();
    } else {
        modalEl.style.display = 'block';
        modalEl.classList.add('show');
    }
}

function applyArchivModelPreset(modelName) {
    const input = document.getElementById('archiv-cfg-model');
    if (input) input.value = modelName;
    const ep = document.getElementById('archiv-cfg-endpoint');
    if (ep && ep.value.includes(':11434')) {
        ep.value = 'https://homeassistant-api.dan-hunziker73.workers.dev/groq/chat/completions';
    }
}

function applyArchivLocalOllamaPreset() {
    const input = document.getElementById('archiv-cfg-model');
    const ep = document.getElementById('archiv-cfg-endpoint');
    if (input) input.value = 'qwen2.5:7b';
    if (ep) ep.value = 'http://192.168.68.56:11434/api/generate';
}

async function saveArchivAiSettingsFromModal() {
    const newModel = document.getElementById('archiv-cfg-model').value.trim();
    const newEndpoint = document.getElementById('archiv-cfg-endpoint').value.trim();
    const newToken = document.getElementById('archiv-cfg-token').value.trim();

    if (!newModel || !newEndpoint) {
        if (typeof showError === 'function') showError('Modell-Name und Endpunkt dürfen nicht leer sein.');
        return;
    }

    archivAiConfig.model = newModel;
    archivAiConfig.endpoint = newEndpoint;
    archivAiConfig.token = newToken;

    localStorage.setItem('archiv_ai_model', newModel);
    localStorage.setItem('archiv_ai_endpoint', newEndpoint);
    localStorage.setItem('archiv_ai_token', newToken);

    try {
        const SUPABASE_REST_URL = 'https://supabase-muhen.danfamily.uk/rest/v1';
        const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M';

        await fetch(`${SUPABASE_REST_URL}/system_app_configs?key=eq.archiv_ai_model`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: newModel, updated_at: new Date().toISOString() })
        });
        await fetch(`${SUPABASE_REST_URL}/system_app_configs?key=eq.archiv_ai_endpoint`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: newEndpoint, updated_at: new Date().toISOString() })
        });
        await fetch(`${SUPABASE_REST_URL}/system_app_configs?key=eq.archiv_ai_token`, {
            method: 'PATCH',
            headers: { 'apikey': SUPABASE_ANON_KEY, 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: newToken, updated_at: new Date().toISOString() })
        });
    } catch (e) {
        console.warn('Sync zu Supabase Fehlgeschlagen (lokal gespeichert):', e);
    }

    updateArchivAiHeaderBadge();

    const modalEl = document.getElementById('archiv-ai-settings-modal');
    if (modalEl) {
        if (window.bootstrap && window.bootstrap.Modal) {
            const inst = bootstrap.Modal.getInstance(modalEl);
            if (inst) inst.hide();
        } else {
            modalEl.style.display = 'none';
        }
    }

    if (typeof showSuccess === 'function') {
        showSuccess(`KI-Modell erfolgreich auf '${newModel.split('/').pop()}' aktualisiert!`);
    }
}

// Global für navTo verfügbar machen
window.initArchiv = initArchiv;
window.openArchivAiSettingsModal = openArchivAiSettingsModal;
window.applyArchivModelPreset = applyArchivModelPreset;
window.applyArchivLocalOllamaPreset = applyArchivLocalOllamaPreset;
window.saveArchivAiSettingsFromModal = saveArchivAiSettingsFromModal;
