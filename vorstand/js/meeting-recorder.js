/**
 * MEETING-RECORDER & PROTOKOLL-ASSISTENT MODULE
 * Sportschützen Muhen Portal
 * 
 * Ermöglicht die Audioaufnahme von Vorstandsitzungen im Browser,
 * splittet die Aufnahme automatisch alle 10 Minuten in Segmente,
 * transkribiert diese über eine Cloudflare Whisper AI Schnittstelle
 * und erzeugt einen optimierten Prompt für Gemini Advanced basierend
 * auf dem Musterprotokoll vom Januar 2026.
 */

// Musterprotokoll aus Januar 2026 als Stil- und Strukturvorlage
const PROTOKOLL_MUSTER = `48. Vorstandsitzung Sportschützen Muhen
Ort:\tMetzgerei Berchtold, Partyraum
Datum:\tDonnerstag, 15. Januar 2026
Uhrzeit:\t18.45 Uhr
Teilnehmer:\tDaniel Berchtold, Präsident
\tStefanie Berchtold
\tSimon Hediger
\tDaniel Hunziker
\tAndrea Rossi
\tBeat Augsburger

Traktanden
1. Begrüssung
Daniel Berchtold begrüsst die Vorstandsmitglieder zur letzten gemeinsamen Vorstandsitzung in dieser Zusammensetzung. 

2. Protokoll der letzten Vorstandsitzung
Das Protokoll der letzten Sitzung vom 21.08.2025 wird unter Verdankung an den Verfasser genehmigt.

3. Wasserschaden / AGV / Schützenstube
Nach erfolgter Trocknung konnte der neue Boden in der Schützenstube und im Büro verlegt werden. Die Besichtigung von Herrn Ly von der Aarg. Gebäudeversicherung hat ergeben, dass sie nur Kosten für effektive Prävention finanziell unterstützen werden. Die bei Burgherr Garten AG eingeholte Offerte für das Erstellen von Ablaufrinnen bringe demzufolge keine Prävention. Bei einer Erstellung dieser Rillen würden deshalb keine Kosten übernommen.
Das Problem bestehe im Bereich vom Parkplatz. Dessen Neigung zur Eingangstüre hin führe zu diesen Wasserschäden. Einen effektiv wirksamen Hochwasserschutz würde eine wasserdichte Türe bringen. Die Kosten sind jedoch enorm hoch und es ist nicht erwiesen, ob sich das Wasser nicht neben der Eingangstüre einen Weg ins Innere suchen und finden würde. Als Alternative schlägt Herr Ly vor, rund um die Eingangstüre einen rund 20 cm hohen Aufbau zu erstellen. Die darin eingebaute Klappe würde bei Starkregen schliessen und somit einen Wassereintritt im Türbereich verhindern. Es besteht jedoch dasselbe Problem wie bei der wasserdichten Türe. Es gibt keine Garantie, dass das Wasser nicht neben der Türe eindringen.
Der Vorstand ist sich einig, dass beide Vorschläge für uns nicht in Frage kommen. Sei es wegen der hohen Kosten der Türe oder wegen der nicht rollstuhlgängigen Erhöhung im Türbereich. Es ist wichtig, dass der Abfluss unter dem Gitterrost vor der Eingangstüre immer frei ist und nicht von Blättern verstopft wird. Das Problem mit dem sehr hohen Gewicht des aktuellen Rostes liesse sich mit einem neuen, viel leichteren Kunststoff-Rost lösen. Simon Hediger wird sich um eine Offerte/Anfrage kümmern.
Daniel Hunziker wird beim AGV, Herrn Ly, nachfragen, bei welcher max. Höhe des Wasserstandes die Situation kritisch würde. Vorderhand werden wir versuchen, künftige Wasserschäden mit dieser Methode zu verhindern.
Daniel Berchtold informiert, dass das Departement Bau, Verkehr und Umwelt, Abteilung Energie, Aarau, während den Bauarbeiten an der Gasleitung (Januar und Februar 2026) einen Baucontainer sowie ein Toi-Toi auf unserem Parkplatz aufstellen würde. Als Entschädigung werden einmalig CHF 1'000 vergütet. Der Vorstand kann diesem Gesuch zustimmen. Daniel Berchtold wird unsere Zustimmung entsprechend zurückmelden. und ausserdem noch fragen, ob der Ersatz des gefällten Baumes finanziell entschädigt wird.

4. Entwässerung ENIWA
Mit der ENIWA wurde seinerzeit ein Vertrag für die Kostenbeteiligung am Unterhalt und Reinigung der Entwässerungsleitung ausgehandelt. Dieser Vertrag muss nun neu ausgehandelt werden. Es ist wiederum eine Einmalentschädigung für die nächsten 25 Jahre vorgesehen. Aufgrund der bisher angefallenen Kosten wird eine einmalige Entschädigung in der Höhe von CHF 11’250-CHF 15'000 vorgeschlagen. Daniel Berchtold wird die ENIWA entsprechend informieren und unseren Vorschlag weiterleiten.

5. Empfang Eidg. Schützenfest Chur 2026
Das ESF 2026 in Chur wird lediglich von 7 Sportschützen besucht. Der Empfang der Sportschützen durch die anderen Dorfvereine würde am Sonntag, 23.08.2026 stattfinden. An diesem Sonntag findet im Rüteli ebenso der kantonale Jugendtag statt. Nach kurzer Diskussion ist man sich im Vorstand einig, auf den Empfang durch die Dorfvereine zu verzichten. Einerseits wegen der geringen Beteiligung am ESF und andererseits wegen des gleichzeitig stattfindenden Jugendtages. Daniel Berchtold wird den Vorstandsentscheid dem zuständigen Verein der Dorfvereine mitteilen.

6. Aargauer Meisterschaft 50m
So wie es aktuell aussieht, wird die Schiessanlage Rüteli in Muhen nicht mehr für die Durchführung der AG-Meisterschaft in Betracht gezogen. Während des Umbaus der Schiessanlage in der RSA Lostorf, Buchs, wurde noch davon ausgegangen, dass die AG-Meisterschaften abwechslungsweise in Buchs und in Muhen durchgeführt werden. Dem ist scheinbar nicht mehr so. Die Meisterschaft wird jedes Jahr nach Buchs vergeben. Der Vorstand nimmt dies zur Kenntnis.
Andrea Rossi teilt mit, dass die Entschädigungsvereinbarung zwischen AGSV und Sportschützen Muhen für die Benützung der Schiessanlage G-50m angepasst wird. Der Präsident und der Kassier unterschreiben den neu aufgesetzten Vertrag. Andrea Rossi wird diesen an die richtige Stelle weiterleiten.

7. Generalversammlung
Der Vorstand bespricht die einzelnen Traktanden der Generalversammlung. Die Reihenfolge ist gegenüber den Vorjahren unverändert.
1. Begrüssung
2. Wahl Stimmenzähler
3. Wahl Tagespräsident
4. Protokoll der letzten GV
5. Mutationen
6. Jahresbericht des Präsidenten
7. Jahresbericht des Jungschützenleiters
8. Jahresrechnung
9. Revisorenbericht
10. Budget
11. Jahresbeitrag
12. Wahlen (12.1 Vorstand, 12.2 Präsident, 12.3 Revisoren, 12.4 Fähnrich)
13. Tätigkeitsprogramm und Beschlussfassung Jahresmeisterschaft
14. Ehrungen
15. Anträge
16. Mitteilungen/Diverses

8. Diverses und Umfrage
Simon Hediger teilt mit, dass er diverse Vereinsbekleidung an die GV mitnehmen wird, welche vor Ort probiert und bestellt werden kann.
Andrea Rossi informiert, dass die Firma CMA Trading GmbH (Christian Matter) für den Schulsport in der Saison 2025 sämtliche Munition für Luftgewehr und Kleinkaliber gesponsert hat. Der Vorstand beschliesst, Christian Matter als Dank eine Speckseite zu schenken. Daniel Berchtold wird diese besorgen.
Beat Augsburger teilt mit, dass der AGSV eine Halle in der Grösse von 500-600 m2 kaufen möchte. Die Halle würde für das kantonale Leistungszentrum zur Indoor-Anlage 10m umgebaut. Die Halle müsste eine Breite von rund 35m aufweisen. Infos und Angebote können an Andrea Rossi weitergeleitet werden.
Daniel Berchtold möchte die Ordner der «alten»-Vorstandsprotokolle sowie Ordner mit alten Zeitungsberichten irgendwo unterbringen können. Der Vorstand ist sich einig, dass die Ordner VS-Protokoll im Archivschrank der Gemeinde deponiert werden. Die alten Zeitungsberichte können gelegentlich eingescannt und auf unserer Webseite hochgeladen werden.
Der Vorstand beschliesst das Menü für die Generalversammlung. Es gibt Ungarisch-Gulasch, Spätzli und Salat. Andrea Rossi wird Marco Fischer fragen, ob er wiederum Crèmeschnitten mitbringen könnte. Daniel Hunziker wird Uschi und Hans-Ruedi einladen und ein Geschenk besorgen.
Die nächste Vorstandsitzung findet am 12.03.2026, 19.00 Uhr, im Vorfeld der Generalversammlung statt.

Aufgaben:
Offerte für Kunststoff-Bodenrost einholen - Simon Hediger
Donatiello Stefano fragen Datum Freundschaftsschiessen - Simon Hediger
Vereinskleidung an GV mitnehmen - Simon Hediger
Anfrage max. Höhe Wasserstand bei AGV - Daniel Hunziker
Uschi und Hans-Ruedi einladen und Geschenk besorgen - Daniel Hunziker
Rückmeldung Einverständnis Entschädigung BVU (1'000) - Daniel Berchtold
Entschädigung für den Ersatz des gefällten Baumes - Daniel Berchtold
Vorschlag Kostenbeteiligung ENIWA - Daniel Berchtold
Verzicht Empfang ESF Chur - Daniel Berchtold
Willi Huwyler fragen für Amt als Tagespräsident - Daniel Berchtold
Speckseite für Christian Matter - Daniel Berchtold
Weiterleitung Entschädigungsvereinbarung AGSV/Muhen - Andrea Rossi
Marco Fischer für Crèmeschnitten fragen - Andrea Rossi

Sportschützen Muhen
Der Aktuar:
Beat Augsburger`;

// Hook in den Navigationszyklus
document.addEventListener("DOMContentLoaded", () => {
    const originalNavTo = window.navTo;
    window.navTo = function(viewId, element) {
        if (typeof originalNavTo === "function") {
            originalNavTo(viewId, element);
        }
        if (viewId === 'meeting-recorder') {
            initMeetingRecorder();
        }
    };
});

// Globale Variablen für Audio-Aufnahme
let mrMediaRecorder = null;
let mrRecordingTimer = null;
let mrStartTime = 0;
let mrElapsedTime = 0; // in Sekunden
let mrTranscripts = []; // Array von transkribierten Textsegmenten
let mrSelectedInterval = 600000; // Standard: 10 Minuten in ms
let mrIntervalTimer = null;

// Premium CSS Styles dynamisch laden
function injectMeetingRecorderStyles() {
    if (document.getElementById('meeting-recorder-styles')) return;
    const style = document.createElement('style');
    style.id = 'meeting-recorder-styles';
    style.textContent = `
        /* Premium Wave Animation */
        .mr-wave-container {
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            height: 60px;
            margin: 20px 0;
        }
        .mr-wave-bar {
            width: 5px;
            height: 15px;
            background-color: var(--primary);
            border-radius: 3px;
            transition: all 0.2s ease;
        }
        .mr-wave-container.recording .mr-wave-bar {
            background-color: var(--danger);
            animation: mr-wave-pulse 1.2s ease-in-out infinite alternate;
        }
        .mr-wave-container.recording .mr-wave-bar:nth-child(1) { animation-delay: 0.1s; }
        .mr-wave-container.recording .mr-wave-bar:nth-child(2) { animation-delay: 0.3s; }
        .mr-wave-container.recording .mr-wave-bar:nth-child(3) { animation-delay: 0.5s; }
        .mr-wave-container.recording .mr-wave-bar:nth-child(4) { animation-delay: 0.2s; }
        .mr-wave-container.recording .mr-wave-bar:nth-child(5) { animation-delay: 0.4s; }
        .mr-wave-container.recording .mr-wave-bar:nth-child(6) { animation-delay: 0.6s; }
        .mr-wave-container.recording .mr-wave-bar:nth-child(7) { animation-delay: 0.1s; }
        
        @keyframes mr-wave-pulse {
            0% { height: 10px; transform: scaleY(0.8); }
            100% { height: 50px; transform: scaleY(1.2); }
        }

        /* Pulsing Recording Dot */
        .mr-pulse-dot {
            width: 14px;
            height: 14px;
            background-color: var(--danger);
            border-radius: 50%;
            display: inline-block;
            box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
        }
        .recording-active .mr-pulse-dot {
            animation: mr-pulse-red 1.5s infinite;
        }
        @keyframes mr-pulse-red {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(239, 68, 68, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }

        /* Glassmorphic boxes */
        .mr-panel-card {
            background: rgba(255, 255, 255, 0.9);
            backdrop-filter: blur(12px);
            border: 1px solid rgba(255, 255, 255, 0.5);
            border-radius: 20px;
        }
    `;
    document.head.appendChild(style);
}

// Initialisiert das UI
function initMeetingRecorder() {
    const container = document.getElementById("view-meeting-recorder");
    if (!container) return;

    // Falls bereits gerendert, nicht neu aufbauen
    if (container.querySelector(".meeting-recorder-wrapper")) {
        return;
    }

    injectMeetingRecorderStyles();

    // Default oder geladene URL
    const savedWorkerUrl = localStorage.getItem('portal_whisper_worker_url') || 'https://sportschuetzen-whisper.dan-hunziker73.workers.dev/';
    const savedInterval = parseInt(localStorage.getItem('portal_whisper_interval')) || 600000;
    mrSelectedInterval = savedInterval;

    container.innerHTML = `
        <div class="meeting-recorder-wrapper">
            <div class="d-flex justify-content-between align-items-center mb-4">
                <h2 class="fw-bold text-primary mb-0" style="letter-spacing: -0.5px;">
                    <i class="fas fa-microphone me-2 text-primary"></i>Meeting-Recorder & Protokoll-Assistent
                </h2>
                <div class="badge bg-primary-light text-primary px-3 py-2 rounded-pill fw-semibold">
                    <i class="fas fa-robot me-1"></i> Whisper AI & Gemini Advanced
                </div>
            </div>

            <div class="row g-4">
                <!-- LINKE SPALTE: RECORDER & STEUERUNG -->
                <div class="col-lg-5">
                    <div class="card border-0 shadow-lg p-4 mr-panel-card text-center mb-4">
                        <h5 class="fw-bold text-primary mb-3">🎙️ Sprachaufnahme</h5>
                        
                        <!-- Pulsing/Wave Graphic -->
                        <div id="mr-status-graphic" class="mr-wave-container">
                            <div class="mr-wave-bar"></div>
                            <div class="mr-wave-bar"></div>
                            <div class="mr-wave-bar"></div>
                            <div class="mr-wave-bar"></div>
                            <div class="mr-wave-bar"></div>
                            <div class="mr-wave-bar"></div>
                            <div class="mr-wave-bar"></div>
                        </div>

                        <!-- Timer & Status -->
                        <div class="my-3">
                            <h1 id="mr-timer" class="fw-bold text-dark mb-1" style="font-family: monospace; font-size: 3rem;">00:00:00</h1>
                            <div id="mr-status" class="text-muted fw-semibold">
                                <span class="mr-pulse-dot me-1 bg-secondary"></span> Status: Bereit
                            </div>
                        </div>

                        <!-- Controls -->
                        <div class="d-flex justify-content-center gap-3 my-4">
                            <button id="mr-start-btn" class="btn btn-success btn-lg px-4 py-3 fw-bold rounded-pill shadow">
                                <i class="fas fa-play me-2"></i>Aufnahme starten
                            </button>
                            <button id="mr-stop-btn" class="btn btn-danger btn-lg px-4 py-3 fw-bold rounded-pill shadow" disabled>
                                <i class="fas fa-stop me-2"></i>Beenden
                            </button>
                        </div>
                    </div>

                    <!-- SETTINGS CARD -->
                    <div class="card border-0 shadow-lg p-4 mr-panel-card">
                        <h5 class="fw-bold text-primary mb-3"><i class="fas fa-cog me-2"></i>Konfiguration</h5>
                        
                        <div class="mb-3">
                            <label for="mr-worker-url" class="form-label fw-bold small text-muted">Cloudflare Worker URL (Whisper)</label>
                            <input type="text" id="mr-worker-url" class="form-control" 
                                   placeholder="z.B. https://mein-worker.subdomain.workers.dev" 
                                   value="${escapeHtml(savedWorkerUrl)}">
                            <div class="form-text text-muted small">
                                Gib hier die URL deines Whisper-Workers ein.
                            </div>
                        </div>

                        <div class="mb-3">
                            <label for="mr-interval-select" class="form-label fw-bold small text-muted">Segmentierungs-Intervall</label>
                            <select id="mr-interval-select" class="form-select">
                                <option value="300000" ${mrSelectedInterval === 300000 ? 'selected' : ''}>Alle 5 Minuten übertragen</option>
                                <option value="600000" ${mrSelectedInterval === 600000 ? 'selected' : ''}>Alle 10 Minuten übertragen (Standard)</option>
                                <option value="900000" ${mrSelectedInterval === 900000 ? 'selected' : ''}>Alle 15 Minuten übertragen</option>
                                <option value="0" ${mrSelectedInterval === 0 ? 'selected' : ''}>Nur manuell beim Beenden übertragen</option>
                            </select>
                        </div>

                        <button id="mr-save-settings-btn" class="btn btn-outline-primary btn-sm w-100 fw-bold">
                            <i class="fas fa-save me-1"></i>Einstellungen speichern
                        </button>
                    </div>
                </div>

                <!-- RECHTE SPALTE: TRANSKRIPT & PROMPT -->
                <div class="col-lg-7">
                    <div class="card border-0 shadow-lg p-4 mr-panel-card h-100 d-flex flex-column" style="min-height: 500px;">
                        
                        <!-- Tabs -->
                        <ul class="nav nav-tabs nav-fill mb-3" id="mr-tabs" role="tablist">
                            <li class="nav-item">
                                <button class="nav-link active fw-bold border-0 text-primary" id="mr-prompt-tab" data-bs-toggle="tab" data-bs-target="#mr-prompt-panel" type="button" role="tab">
                                    <i class="fas fa-magic me-2"></i>Gemini Advanced Prompt
                                </button>
                            </li>
                            <li class="nav-item">
                                <button class="nav-link fw-bold border-0 text-muted" id="mr-transcript-tab" data-bs-toggle="tab" data-bs-target="#mr-transcript-panel" type="button" role="tab">
                                    <i class="fas fa-file-alt me-2"></i>Roh-Transkript
                                </button>
                            </li>
                        </ul>

                        <div class="tab-content flex-grow-1 d-flex flex-column">
                            <!-- TAB 1: GEMINI PROMPT (VORLAGE MIT MUSTERPROTKOLL + TEXT) -->
                            <div class="tab-pane fade show active flex-grow-1 d-flex flex-column" id="mr-prompt-panel" role="tabpanel">
                                <p class="text-muted small mb-2">
                                    Dieser Prompt enthält das **Januar 2026 Musterprotokoll** und das Transkript. Kopiere den gesamten Prompt und füge ihn in Gemini Advanced ein.
                                </p>
                                <textarea id="mr-prompt-field" class="form-control flex-grow-1 font-monospace p-3 text-muted small" style="min-height: 320px; font-size: 0.82rem;" readonly>${escapeHtml(generatePromptText(''))}</textarea>
                                
                                <div class="mt-3">
                                    <button id="mr-copy-prompt-btn" class="btn btn-primary w-100 fw-bold py-2.5">
                                        <i class="fas fa-copy me-1"></i>Gemini Prompt kopieren
                                    </button>
                                </div>
                            </div>

                            <!-- TAB 2: ROH-TRANSKRIPT -->
                            <div class="tab-pane fade flex-grow-1 d-flex flex-column" id="mr-transcript-panel" role="tabpanel">
                                <p class="text-muted small mb-2">
                                    Hier erscheinen die fortlaufend transkribierten Sprachsegmente aus Whisper.
                                </p>
                                <textarea id="mr-transcript-field" class="form-control flex-grow-1 font-monospace p-3 small" style="min-height: 320px;" placeholder="Noch keine Audiodaten empfangen. Starte die Aufnahme..." readonly></textarea>
                                
                                <div class="mt-3 d-flex gap-2">
                                    <button id="mr-copy-transcript-btn" class="btn btn-outline-secondary flex-grow-1 fw-bold">
                                        <i class="fas fa-copy me-1"></i>Text kopieren
                                    </button>
                                    <button id="mr-download-transcript-btn" class="btn btn-outline-secondary flex-grow-1 fw-bold">
                                        <i class="fas fa-download me-1"></i>Herunterladen
                                    </button>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    `;

    // Event Listeners registrieren
    document.getElementById('mr-start-btn').addEventListener('click', startRecording);
    document.getElementById('mr-stop-btn').addEventListener('click', stopRecording);
    document.getElementById('mr-save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('mr-copy-prompt-btn').addEventListener('click', copyPrompt);
    document.getElementById('mr-copy-transcript-btn').addEventListener('click', copyTranscript);
    document.getElementById('mr-download-transcript-btn').addEventListener('click', downloadTranscript);

    // Tab Event Listener zum Anpassen der Farben/Klassen
    const triggerTabList = [].slice.call(document.querySelectorAll('#mr-tabs button'));
    triggerTabList.forEach(triggerEl => {
        triggerEl.addEventListener('click', (event) => {
            event.preventDefault();
            triggerTabList.forEach(btn => {
                btn.classList.remove('text-primary');
                btn.classList.add('text-muted');
            });
            triggerEl.classList.remove('text-muted');
            triggerEl.classList.add('text-primary');
            bootstrap.Tab.getInstance(triggerEl).show();
        });
    });
}

// Generiert den Prompt für Gemini Advanced
function generatePromptText(transcript) {
    return `Hier ist das gesammelte Transkript unseres Meetings (automatisch aus dem Schweizerdeutschen übersetzt). Bitte generiere daraus ein präzises, professionelles Ergebnisprotokoll im Schweizer Hochdeutsch (ohne 'ß'). Stelle sicher, dass Namen korrekt geschrieben sind.

WICHTIG: Verwende exakt das folgende Muster-Protokoll der Sportschützen Muhen als Stil-, Format- und Layoutvorlage für das fertige Protokoll:

--- MUSTER-PROTOKOLL ANFANG ---
${PROTOKOLL_MUSTER}
--- MUSTER-PROTOKOLL ENDE ---

Richte dich bei der Formatierung und Gliederung streng nach diesem Muster:
1. Header: Nummer der Vorstandsitzung, Ort, Datum, Uhrzeit und Teilnehmer (in gleicher Tabulator- oder Listenoptik).
2. Traktandenliste: Nummerierte Liste der behandelten Themen.
3. Detailinhalt pro Traktandum: Textabsätze mit Beschlüssen, Diskussionspunkten und den jeweils vereinbarten Aufgaben.
4. Aufgabenliste am Ende: Eine saubere, übersichtliche Liste ("Aufgaben:") mit allen Aufgaben und den jeweils verantwortlichen Personen.
5. Signatur am Ende ("Sportschützen Muhen / Der Aktuar: [Name]").

Hier ist das neue Transkript, das du verarbeiten sollst:
${transcript || '[Noch kein Transkript vorhanden. Starte die Aufnahme...]'}`;
}

// Einstellungen speichern
function saveSettings() {
    const url = document.getElementById('mr-worker-url').value.trim();
    const interval = parseInt(document.getElementById('mr-interval-select').value);

    localStorage.setItem('portal_whisper_worker_url', url);
    localStorage.setItem('portal_whisper_interval', interval);
    mrSelectedInterval = interval;

    showToast("Einstellungen erfolgreich gespeichert!", "success");
}

// Aufnahme starten
async function startRecording() {
    const workerUrl = localStorage.getItem('portal_whisper_worker_url') || 'https://sportschuetzen-whisper.dan-hunziker73.workers.dev/';
    if (!workerUrl) {
        showToast("Bitte konfiguriere zuerst die Cloudflare Worker URL in den Einstellungen.", "warning");
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/ogg;codecs=opus' };
        }

        mrMediaRecorder = new MediaRecorder(stream, options);
        mrTranscripts = [];
        updateTranscriptDisplay();

        mrMediaRecorder.ondataavailable = async (event) => {
            if (event.data && event.data.size > 0) {
                await sendAudioChunkToCloudflare(event.data);
            }
        };

        // Aufnahmestart
        if (mrSelectedInterval > 0) {
            // Periodisches Triggern
            mrMediaRecorder.start(mrSelectedInterval);
        } else {
            // Manuell beim Beenden
            mrMediaRecorder.start();
        }

        // UI Updates
        document.getElementById('mr-start-btn').disabled = true;
        document.getElementById('mr-stop-btn').disabled = false;
        
        const statusField = document.getElementById('mr-status');
        statusField.innerHTML = `<span class="mr-pulse-dot me-1"></span> Status: Aufnahme läuft...`;
        statusField.classList.add('recording-active');
        document.getElementById('mr-status-graphic').classList.add('recording');

        // Timer starten
        mrStartTime = Date.now();
        mrElapsedTime = 0;
        mrRecordingTimer = setInterval(() => {
            mrElapsedTime = Math.floor((Date.now() - mrStartTime) / 1000);
            updateTimerDisplay();
        }, 1000);

        showToast("Sprachaufnahme gestartet.", "success");

    } catch (err) {
        console.error(err);
        alert('Mikrofon-Zugriff verweigert oder nicht unterstützt: ' + err.message);
    }
}

// Aufnahme stoppen
function stopRecording() {
    if (mrMediaRecorder && mrMediaRecorder.state !== 'inactive') {
        mrMediaRecorder.stop();
        mrMediaRecorder.stream.getTracks().forEach(track => track.stop());
    }

    // Timer stoppen
    clearInterval(mrRecordingTimer);
    mrRecordingTimer = null;

    // UI Updates
    document.getElementById('mr-start-btn').disabled = false;
    document.getElementById('mr-stop-btn').disabled = true;
    
    const statusField = document.getElementById('mr-status');
    statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-secondary"></span> Status: Beendet. Verarbeite letzte Segmente...`;
    statusField.classList.remove('recording-active');
    document.getElementById('mr-status-graphic').classList.remove('recording');

    showToast("Aufnahme beendet. Letztes Segment wird gesendet...", "info");
}

// Sende Audio-Segment an Cloudflare AI
async function sendAudioChunkToCloudflare(blob) {
    const workerUrl = localStorage.getItem('portal_whisper_worker_url') || 'https://sportschuetzen-whisper.dan-hunziker73.workers.dev/';
    if (!workerUrl) return;

    const statusField = document.getElementById('mr-status');
    statusField.innerHTML = `<span class="spinner-border spinner-border-sm text-primary me-1" role="status"></span> Status: Sende Segment an Cloudflare Whisper AI...`;

    const formData = new FormData();
    formData.append('file', blob, 'chunk.webm');

    try {
        const response = await fetch(workerUrl, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            let errorText = `Server-Fehler: HTTP ${response.status}`;
            try {
                const errJson = await response.json();
                if (errJson && errJson.error) {
                    errorText = `Server-Fehler: ${errJson.error}`;
                }
            } catch(e) {}
            throw new Error(errorText);
        }

        const result = await response.json();
        
        if (result.text && result.text.trim()) {
            mrTranscripts.push(result.text.trim());
            updateTranscriptDisplay();
            statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-success"></span> Status: Letztes Segment erfolgreich transkribiert.`;
            showToast("Audio-Segment erfolgreich transkribiert.", "success");
        } else {
            statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-warning"></span> Status: Warnung - Segment war leer oder fehlerhaft.`;
        }

        // Wenn Aufnahme läuft, Status wieder zurücksetzen
        if (mrRecordingTimer) {
            setTimeout(() => {
                if (mrRecordingTimer) {
                    statusField.innerHTML = `<span class="mr-pulse-dot me-1"></span> Status: Aufnahme läuft...`;
                }
            }, 3000);
        }

    } catch (error) {
        console.error(error);
        statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-danger"></span> Status: Fehler beim Transkribieren: ${error.message}`;
        showToast("Fehler bei der Whisper-Transkribierung.", "danger");
    }
}

// Timer-Anzeige aktualisieren
function updateTimerDisplay() {
    const hrs = Math.floor(mrElapsedTime / 3600).toString().padStart(2, '0');
    const mins = Math.floor((mrElapsedTime % 3600) / 60).toString().padStart(2, '0');
    const secs = (mrElapsedTime % 60).toString().padStart(2, '0');
    document.getElementById('mr-timer').textContent = `${hrs}:${mins}:${secs}`;
}

// Transkript- und Prompt-Anzeige aktualisieren
function updateTranscriptDisplay() {
    const fullText = mrTranscripts.join('\n\n');
    
    const transcriptField = document.getElementById('mr-transcript-field');
    if (transcriptField) {
        transcriptField.value = fullText || "Noch kein Transkript vorhanden. Starte die Aufnahme...";
    }

    const promptField = document.getElementById('mr-prompt-field');
    if (promptField) {
        promptField.value = generatePromptText(fullText);
    }
}

// Kopier-Funktionen
function copyPrompt() {
    const promptField = document.getElementById('mr-prompt-field');
    promptField.select();
    navigator.clipboard.writeText(promptField.value);
    showToast("Gemini Prompt in die Zwischenablage kopiert!", "success");
}

function copyTranscript() {
    const transcriptField = document.getElementById('mr-transcript-field');
    transcriptField.select();
    navigator.clipboard.writeText(transcriptField.value);
    showToast("Transkript in die Zwischenablage kopiert!", "success");
}

// Transkript als Textdatei herunterladen
function downloadTranscript() {
    const fullText = mrTranscripts.join('\n\n');
    if (!fullText) {
        showToast("Kein Transkript zum Herunterladen vorhanden.", "warning");
        return;
    }

    const dateStr = new Date().toISOString().substring(0, 10);
    const blob = new Blob([fullText], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Transkript_Sitzung_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}

// Helper: Custom Toasts für konsistentes Feedback
function showToast(message, type = "success") {
    // Falls vorhanden, nutze das globale showSuccess/showError aus main.js
    if (type === "success" && typeof showSuccess === "function") {
        showSuccess(message);
        return;
    } else if (type === "danger" && typeof showError === "function") {
        showError(message);
        return;
    }

    // Fallback: Eigener simpler Toast
    const toast = document.createElement('div');
    toast.className = `custom-toast animate__animated animate__fadeInUp bg-${type === 'success' ? 'success' : type === 'warning' ? 'warning' : 'danger'}`;
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.zIndex = '9999';
    toast.style.color = 'white';
    toast.style.padding = '12px 24px';
    toast.style.borderRadius = '8px';
    toast.innerHTML = `<i class="fas fa-${type === 'success' ? 'check-circle' : 'exclamation-circle'} me-2"></i>${escapeHtml(message)}`;
    
    document.body.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 3000);
}
