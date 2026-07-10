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

// ERWEITERTE DATENSTRUKTUREN & STATUSFELD-KONTROLLE
let mrAudioChunks = []; // Sammelt die Rohdaten-Chunks des aktuellen Segments
let mrIsRecordingActive = false; // Status ob Aufnahme läuft
let mrIsRotating = false; // Flag für automatischen Segmentwechsel
let mrSegmentCounter = 0; // Zähler für hochgeladene Segmente
let mrLogs = []; // Lokale Historie für Aktivitätslogs

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

        /* Custom scrollbar for dark console */
        #mr-log-console::-webkit-scrollbar {
            width: 6px;
        }
        #mr-log-console::-webkit-scrollbar-track {
            background: rgba(0, 0, 0, 0.2);
            border-radius: 4px;
        }
        #mr-log-console::-webkit-scrollbar-thumb {
            background: rgba(255, 255, 255, 0.15);
            border-radius: 4px;
        }
        #mr-log-console::-webkit-scrollbar-thumb:hover {
            background: rgba(255, 255, 255, 0.3);
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

    // Geladene Transkripte wiederherstellen falls vorhanden
    const savedTranscripts = localStorage.getItem('mr_active_transcripts');
    if (savedTranscripts) {
        try {
            mrTranscripts = JSON.parse(savedTranscripts);
            console.log("📝 Gespeicherte Transkripte geladen:", mrTranscripts.length, "Segmente");
        } catch (e) {
            console.error("Fehler beim Laden von mr_active_transcripts:", e);
            mrTranscripts = [];
        }
    } else {
        mrTranscripts = [];
    }

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
                        <div class="d-flex flex-column align-items-center gap-3 my-4">
                            <div class="d-flex justify-content-center gap-3 w-100">
                                <button id="mr-start-btn" class="btn btn-success btn-lg px-4 py-3 fw-bold rounded-pill shadow flex-grow-1">
                                    <i class="fas fa-play me-2"></i>Aufnahme starten
                                </button>
                                <button id="mr-stop-btn" class="btn btn-danger btn-lg px-4 py-3 fw-bold rounded-pill shadow flex-grow-1" disabled>
                                    <i class="fas fa-stop me-2"></i>Beenden
                                </button>
                            </div>
                            <button id="mr-reset-btn" class="btn btn-outline-danger btn-sm px-3 py-2 fw-semibold rounded-pill w-100">
                                <i class="fas fa-trash-alt me-1"></i>Sitzung & Transkript zurücksetzen
                            </button>
                        </div>
                    </div>

                    <!-- ACTIVITY LOG CARD -->
                    <div class="card border-0 shadow-lg p-4 mr-panel-card mb-4">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="fw-bold text-primary mb-0"><i class="fas fa-terminal me-2"></i>Aktivitäts-Log</h5>
                            <button id="mr-clear-log-btn" class="btn btn-outline-secondary btn-sm fw-bold py-1 px-2" style="font-size: 0.75rem;">
                                <i class="fas fa-trash me-1"></i>Löschen
                            </button>
                        </div>
                        <div id="mr-log-console" class="font-monospace p-3 bg-dark text-light rounded small" style="height: 180px; overflow-y: auto; font-size: 0.78rem; line-height: 1.45; border: 1px solid rgba(255,255,255,0.1); text-align: left;">
                            <div class="text-muted">[Bereit für Sprachaufnahme]</div>
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
                                <button class="nav-link fw-bold border-0 text-muted" id="mr-protocol-tab" data-bs-toggle="tab" data-bs-target="#mr-protocol-panel" type="button" role="tab">
                                    <i class="fas fa-robot me-2"></i>Ergebnisprotokoll (KI)
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

                            <!-- TAB 2: ERGEBNISPROTOKOLL (KI) -->
                            <div class="tab-pane fade flex-grow-1 d-flex flex-column" id="mr-protocol-panel" role="tabpanel">
                                <p class="text-muted small mb-2">
                                    Generiere das fertige Ergebnisprotokoll (im Schweizer Hochdeutsch ohne 'ß' und nach dem Vereins-Muster) direkt im Portal.
                                </p>
                                
                                <div class="mb-3 d-flex gap-2 align-items-center">
                                    <button id="mr-generate-protocol-btn" class="btn btn-primary fw-bold flex-grow-1">
                                        <i class="fas fa-cogs me-1"></i>Protokoll automatisch generieren
                                    </button>
                                    <div id="mr-protocol-spinner" class="spinner-border text-primary d-none" role="status" style="width: 1.5rem; height: 1.5rem;">
                                        <span class="visually-hidden">Generiere...</span>
                                    </div>
                                </div>

                                <textarea id="mr-protocol-field" class="form-control flex-grow-1 font-monospace p-3 small" style="min-height: 320px;" placeholder="Klicke auf den Button oben, um das Protokoll aus dem bisherigen Transkript zu generieren..."></textarea>
                                
                                <div class="mt-3 d-flex gap-2">
                                    <button id="mr-copy-protocol-btn" class="btn btn-outline-secondary flex-grow-1 fw-bold">
                                        <i class="fas fa-copy me-1"></i>Kopieren
                                    </button>
                                    <button id="mr-download-protocol-btn" class="btn btn-outline-secondary flex-grow-1 fw-bold">
                                        <i class="fas fa-download me-1"></i>Herunterladen
                                    </button>
                                </div>
                            </div>

                            <!-- TAB 3: ROH-TRANSKRIPT -->
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
    document.getElementById('mr-reset-btn').addEventListener('click', resetSession);
    document.getElementById('mr-save-settings-btn').addEventListener('click', saveSettings);
    document.getElementById('mr-copy-prompt-btn').addEventListener('click', copyPrompt);
    document.getElementById('mr-generate-protocol-btn').addEventListener('click', generateProtocolAutomatically);
    document.getElementById('mr-copy-protocol-btn').addEventListener('click', copyProtocol);
    document.getElementById('mr-download-protocol-btn').addEventListener('click', downloadProtocol);
    document.getElementById('mr-copy-transcript-btn').addEventListener('click', copyTranscript);
    document.getElementById('mr-download-transcript-btn').addEventListener('click', downloadTranscript);
    document.getElementById('mr-clear-log-btn').addEventListener('click', () => {
        const consoleElem = document.getElementById('mr-log-console');
        if (consoleElem) {
            consoleElem.innerHTML = '<div class="text-muted">[Aktivitäts-Log geleert]</div>';
        }
        mrLogs = [];
    });

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

    // Gespeicherte Transkripte initial in den Textfeldern anzeigen
    updateTranscriptDisplay();
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

// Aktivitäts-Log-Funktion für ausführliche Rückmeldungen
function logToConsole(message, type = 'info') {
    const timestamp = new Date().toLocaleTimeString('de-CH');
    
    // In globaler Variable speichern
    if (typeof mrLogs === 'undefined') {
        mrLogs = [];
    }
    mrLogs.push({ timestamp, message, type });
    
    // In Browser-Konsole loggen
    const consoleMsg = `[MeetingRecorder][${timestamp}] ${message}`;
    if (type === 'error') console.error(consoleMsg);
    else if (type === 'warning') console.warn(consoleMsg);
    else console.log(consoleMsg);

    // In die UI schreiben
    const consoleElem = document.getElementById('mr-log-console');
    if (consoleElem) {
        let colorClass = 'text-white';
        let prefix = 'ℹ️';
        if (type === 'success') {
            colorClass = 'text-success';
            prefix = '✅';
        } else if (type === 'warning') {
            colorClass = 'text-warning';
            prefix = '⚠️';
        } else if (type === 'error') {
            colorClass = 'text-danger';
            prefix = '❌';
        } else if (type === 'upload') {
            colorClass = 'text-info';
            prefix = '📤';
        }

        const logEntry = document.createElement('div');
        logEntry.className = `mb-1 ${colorClass}`;
        logEntry.innerHTML = `<span class="text-muted">[${timestamp}]</span> ${prefix} ${escapeHtml(message)}`;
        consoleElem.appendChild(logEntry);
        
        // Auto-Scroll nach unten
        consoleElem.scrollTop = consoleElem.scrollHeight;
    }
}

// Aufnahme starten
async function startRecording() {
    const workerUrl = localStorage.getItem('portal_whisper_worker_url') || 'https://sportschuetzen-whisper.dan-hunziker73.workers.dev/';
    if (!workerUrl) {
        showToast("Bitte konfiguriere zuerst die Cloudflare Worker URL in den Einstellungen.", "warning");
        return;
    }

    // Konsolen-Reset bei Neustart
    const consoleElem = document.getElementById('mr-log-console');
    if (consoleElem) {
        consoleElem.innerHTML = '';
    }
    mrLogs = [];

    logToConsole("Starte Initialisierung der Sprachaufnahme...", "info");
    logToConsole(`Worker-Schnittstelle: ${workerUrl}`, "info");
    logToConsole(`Segmentierungs-Intervall: ${mrSelectedInterval === 0 ? "Nur manuell bei Beenden" : (mrSelectedInterval / 60000) + " Minuten"}`, "info");

    // Secure Context Check
    if (!window.isSecureContext) {
        logToConsole("Aufnahme blockiert: Kein sicherer Kontext (HTTPS oder localhost). Browsersicherheit verweigert Zugriff.", "error");
        showToast("Aufnahme nicht möglich: Mikrofon-Zugriff erfordert HTTPS oder localhost.", "danger");
        return;
    }

    try {
        logToConsole("Fordere Mikrofon-Berechtigungen an...", "info");
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        logToConsole("Mikrofon-Berechtigung erteilt.", "success");

        // Audio Track Infos auslesen
        const audioTracks = stream.getAudioTracks();
        if (audioTracks && audioTracks.length > 0) {
            const track = audioTracks[0];
            const settings = track.getSettings();
            logToConsole(`Audio-Quelle: "${track.label}"`, "info");
            if (settings.sampleRate) logToConsole(`Sample-Rate: ${settings.sampleRate} Hz`, "info");
            if (settings.channelCount) logToConsole(`Kanäle: ${settings.channelCount}`, "info");
            if (settings.echoCancellation !== undefined) logToConsole(`Echo-Unterdrückung: ${settings.echoCancellation ? "aktiv" : "inaktiv"}`, "info");
        }

        let options = { mimeType: 'audio/webm;codecs=opus' };
        if (!MediaRecorder.isTypeSupported(options.mimeType)) {
            options = { mimeType: 'audio/ogg;codecs=opus' };
        }
        logToConsole(`Verwende Codec-Format: ${options.mimeType}`, "info");

        mrMediaRecorder = new MediaRecorder(stream, options);
        // Transkripte bei Start NICHT zurücksetzen (Fortsetzung bei Pause)
        mrAudioChunks = [];
        mrSegmentCounter = mrTranscripts.length > 0 ? mrTranscripts.length + 1 : 1;
        mrIsRecordingActive = true;
        mrIsRotating = false;
        
        updateTranscriptDisplay();

        // Chunks sammeln
        mrMediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                mrAudioChunks.push(event.data);
                logToConsole(`Audiodaten-Chunk empfangen: ${Math.round(event.data.size / 1024)} KB`, "info");
            }
        };

        // OnStop-Callback
        mrMediaRecorder.onstop = async () => {
            logToConsole(`MediaRecorder gestoppt. Segment ${mrSegmentCounter} fertiggestellt.`, "info");
            
            const audioBlob = new Blob(mrAudioChunks, { type: mrMediaRecorder.mimeType });
            mrAudioChunks = []; // Chunks für nächstes Segment leeren
            
            const currentSegmentNumber = mrSegmentCounter;
            
            if (audioBlob.size > 0) {
                logToConsole(`Segment ${currentSegmentNumber} generiert: Grösse = ${Math.round(audioBlob.size / 1024)} KB (${(audioBlob.size / (1024 * 1024)).toFixed(2)} MB), Format = ${audioBlob.type}`, "success");
                
                // Warnung falls das Segment sehr gross ist (> 20MB)
                if (audioBlob.size > 20 * 1024 * 1024) {
                    logToConsole(`Warnung: Segment ${currentSegmentNumber} ist sehr gross (${(audioBlob.size / (1024 * 1024)).toFixed(1)} MB). Dies kann zu Übertragungsfehlern bei Cloudflare führen.`, "warning");
                }

                // Asynchron an Cloudflare senden (nicht blockierend)
                sendAudioChunkToCloudflare(audioBlob, currentSegmentNumber);
            } else {
                logToConsole(`Warnung: Segment ${currentSegmentNumber} war leer (keine Audiodaten vorhanden).`, "warning");
            }

            // Falls Aufnahme weiterhin aktiv ist und Rotation getriggert hat -> sofort neu starten
            if (mrIsRecordingActive) {
                try {
                    mrSegmentCounter++;
                    logToConsole(`Starte Segment ${mrSegmentCounter} Aufnahme-Session...`, "info");
                    mrMediaRecorder.start();
                    logToConsole(`Aufnahme für Segment ${mrSegmentCounter} läuft...`, "success");
                } catch (err) {
                    logToConsole(`Kritischer Fehler beim Neustart des Recorders für Segment ${mrSegmentCounter}: ${err.message}`, "error");
                    showToast("Fehler bei der Segment-Fortführung.", "danger");
                    stopRecording();
                }
            } else {
                logToConsole("Aufnahme-Prozess vollständig beendet.", "success");
            }
        };

        // Aufnahmestart
        mrMediaRecorder.start();
        logToConsole(`Aufnahme für Segment ${mrSegmentCounter} erfolgreich gestartet.`, "success");

        // Periodisches Rotieren einrichten (wenn ein Intervall gewählt wurde)
        if (mrSelectedInterval > 0) {
            logToConsole(`Automatischer Segmentwechsel alle ${mrSelectedInterval / 60000} Minuten eingerichtet.`, "info");
            mrIntervalTimer = setInterval(() => {
                if (mrMediaRecorder && mrMediaRecorder.state === "recording") {
                    logToConsole(`Rotations-Intervall erreicht. Beende Segment ${mrSegmentCounter} und starte neues...`, "info");
                    mrIsRotating = true;
                    mrMediaRecorder.stop(); // Triggert dataavailable und danach onstop
                }
            }, mrSelectedInterval);
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
        logToConsole(`Fehler beim Zugriff auf Audio-Hardware: ${err.message}`, "error");
        showToast("Fehler beim Starten der Aufnahme.", "danger");
        console.error(err);
        alert('Mikrofon-Zugriff verweigert oder nicht unterstützt: ' + err.message);
    }
}

// Aufnahme stoppen
function stopRecording() {
    logToConsole("Stoppe Aufnahme manuell...", "info");
    
    mrIsRecordingActive = false; // Signalisiert, dass nach onstop nicht neu gestartet werden soll

    // Interval-Timer für Rotation stoppen
    if (mrIntervalTimer) {
        clearInterval(mrIntervalTimer);
        mrIntervalTimer = null;
        logToConsole("Rotations-Timer deaktiviert.", "info");
    }

    // Haupt-MediaRecorder stoppen
    if (mrMediaRecorder && mrMediaRecorder.state !== 'inactive') {
        logToConsole("Schliesse laufende Audioaufzeichnung...", "info");
        mrMediaRecorder.stop();
        
        // Mikrofon-Tracks stoppen um Hardware freizugeben
        mrMediaRecorder.stream.getTracks().forEach(track => {
            logToConsole(`Deaktiviere Audio-Spur: "${track.label}"`, "info");
            track.stop();
        });
    }

    // Timer stoppen
    if (mrRecordingTimer) {
        clearInterval(mrRecordingTimer);
        mrRecordingTimer = null;
    }

    // UI Updates
    document.getElementById('mr-start-btn').disabled = false;
    document.getElementById('mr-stop-btn').disabled = true;
    
    const statusField = document.getElementById('mr-status');
    statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-secondary"></span> Status: Beendet. Letztes Segment wird transkribiert...`;
    statusField.classList.remove('recording-active');
    document.getElementById('mr-status-graphic').classList.remove('recording');

    showToast("Aufnahme beendet. Letztes Segment wird verarbeitet...", "info");
}

// Sende Audio-Segment an Cloudflare AI (mit automatischer Retry-Logik)
async function sendAudioChunkToCloudflare(blob, segmentNumber) {
    const workerUrl = localStorage.getItem('portal_whisper_worker_url') || 'https://sportschuetzen-whisper.dan-hunziker73.workers.dev/';
    if (!workerUrl) {
        logToConsole(`Fehler beim Senden von Segment ${segmentNumber}: Cloudflare Worker URL nicht konfiguriert.`, "error");
        return;
    }

    const statusField = document.getElementById('mr-status');
    
    const maxRetries = 3;
    let attempt = 0;
    let success = false;
    let resultText = "";

    const formData = new FormData();
    formData.append('file', blob, `segment_${segmentNumber}.webm`);

    while (attempt < maxRetries && !success) {
        attempt++;
        if (attempt > 1) {
            const delay = Math.pow(2, attempt) * 1000; // 4s, 8s
            logToConsole(`Verbindungsfehler bei Segment ${segmentNumber}. Starte Versuch ${attempt}/${maxRetries} in ${delay/1000} Sekunden...`, "warning");
            await new Promise(resolve => setTimeout(resolve, delay));
        }

        logToConsole(`[Versuch ${attempt}/${maxRetries}] Sende Segment ${segmentNumber} (Grösse: ${Math.round(blob.size / 1024)} KB) an Cloudflare Whisper AI...`, "upload");
        if (statusField && mrIsRecordingActive) {
            statusField.innerHTML = `<span class="spinner-border spinner-border-sm text-primary me-1" role="status"></span> Status: Sende Segment ${segmentNumber}...`;
        }

        const startTime = Date.now();

        try {
            const response = await fetch(workerUrl, {
                method: 'POST',
                body: formData
            });

            const latency = ((Date.now() - startTime) / 1000).toFixed(2);

            if (!response.ok) {
                let errorText = `Server-Fehler: HTTP ${response.status} (${response.statusText})`;
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
                resultText = result.text.trim();
                success = true;
                logToConsole(`Segment ${segmentNumber} erfolgreich transkribiert in ${latency}s.`, "success");
                logToConsole(`Transkript Segment ${segmentNumber}: "${resultText.substring(0, 100)}${resultText.length > 100 ? '...' : ''}"`, "info");
            } else {
                // Antwort erhalten, aber leerer Text
                logToConsole(`Warnung: Segment ${segmentNumber} Antwort erhalten in ${latency}s, aber kein Text erkannt.`, "warning");
                // Wir werten das als Erfolg (keine Wiederholung nötig), da die Audio-Daten einfach still waren.
                success = true;
            }
        } catch (error) {
            const latency = ((Date.now() - startTime) / 1000).toFixed(2);
            logToConsole(`Fehler bei Übertragung von Segment ${segmentNumber} (Dauer: ${latency}s): ${error.message}`, "error");
        }
    }

    if (success) {
        if (resultText) {
            mrTranscripts.push(resultText);
            localStorage.setItem('mr_active_transcripts', JSON.stringify(mrTranscripts));
            updateTranscriptDisplay();
            showToast(`Segment ${segmentNumber} erfolgreich transkribiert.`, "success");
        }
        
        if (statusField) {
            statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-success"></span> Status: Segment ${segmentNumber} verarbeitet.`;
        }
    } else {
        logToConsole(`Kritischer Fehler: Segment ${segmentNumber} konnte nach ${maxRetries} Versuchen nicht übertragen werden. Text wurde übersprungen.`, "error");
        showToast(`Übertragungsfehler bei Segment ${segmentNumber} nach ${maxRetries} Versuchen.`, "danger");
        
        if (statusField) {
            statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-danger"></span> Status: Fehler bei Segment ${segmentNumber}.`;
        }
    }

    // Wenn Aufnahme läuft, Status nach kurzer Verzögerung wieder zurücksetzen
    setTimeout(() => {
        if (mrIsRecordingActive && statusField) {
            statusField.innerHTML = `<span class="mr-pulse-dot me-1"></span> Status: Aufnahme läuft...`;
        } else if (!mrIsRecordingActive && statusField) {
            statusField.innerHTML = `<span class="mr-pulse-dot me-1 bg-secondary"></span> Status: Bereit`;
        }
    }, 4000);
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

// === NEUE UX ASSISTENTEN-FUNKTIONEN ===

// Sitzung und Speicher zurücksetzen
function resetSession() {
    if (confirm("Möchtest du das gesamte Transkript und das generierte Protokoll löschen und eine neue Sitzung starten?")) {
        mrTranscripts = [];
        localStorage.removeItem('mr_active_transcripts');
        
        // Log-Verlauf leeren
        const consoleElem = document.getElementById('mr-log-console');
        if (consoleElem) {
            consoleElem.innerHTML = '<div class="text-muted">[Sitzung zurückgesetzt. Bereit für Sprachaufnahme]</div>';
        }
        mrLogs = [];
        
        // UI leeren
        updateTranscriptDisplay();
        
        const protocolField = document.getElementById('mr-protocol-field');
        if (protocolField) {
            protocolField.value = "";
        }
        
        logToConsole("Sitzung zurückgesetzt.", "info");
        showToast("Sitzung zurückgesetzt.", "success");
    }
}

// Protokoll automatisch über Gemini generieren
async function generateProtocolAutomatically() {
    const fullText = mrTranscripts.join('\n\n');
    if (!fullText) {
        showToast("Kein Transkript zum Generieren vorhanden.", "warning");
        return;
    }

    const generateBtn = document.getElementById('mr-generate-protocol-btn');
    const spinner = document.getElementById('mr-protocol-spinner');
    const protocolField = document.getElementById('mr-protocol-field');

    if (generateBtn) generateBtn.disabled = true;
    if (spinner) spinner.classList.remove('d-none');
    
    logToConsole("Sende Transkript an Gemini zur Protokoll-Erstellung...", "info");

    try {
        const promptText = generatePromptText(fullText);
        
        const response = await apiFetch('news', 'action=generate_protocol', {
            method: 'POST',
            body: JSON.stringify({ prompt: promptText })
        });

        if (!response.ok) {
            let errorText = `Fehler bei der Verbindung zur Gemini-API (HTTP ${response.status})`;
            try {
                const resJson = await response.json();
                if (resJson && resJson.error) {
                    errorText = `Gemini-API Fehler: ${resJson.error}`;
                }
            } catch(e) {}
            throw new Error(errorText);
        }

        const data = await response.json();
        
        if (data.success && data.text) {
            if (protocolField) {
                protocolField.value = data.text.trim();
            }
            logToConsole("Ergebnisprotokoll erfolgreich generiert!", "success");
            showToast("Protokoll erfolgreich generiert!", "success");
            
            // Zu Tab wechseln
            const protocolTab = document.getElementById('mr-protocol-tab');
            if (protocolTab) {
                protocolTab.click();
            }
        } else {
            throw new Error("Ungültiges Antwortformat von der Gemini-API erhalten.");
        }
    } catch (error) {
        logToConsole(`Fehler bei der Protokoll-Generierung: ${error.message}`, "error");
        showToast(error.message, "danger");
    } finally {
        if (generateBtn) generateBtn.disabled = false;
        if (spinner) spinner.classList.add('d-none');
    }
}

// Ergebnisprotokoll in die Zwischenablage kopieren
function copyProtocol() {
    const protocolField = document.getElementById('mr-protocol-field');
    if (!protocolField || !protocolField.value.trim()) {
        showToast("Kein Protokoll zum Kopieren vorhanden.", "warning");
        return;
    }
    protocolField.select();
    navigator.clipboard.writeText(protocolField.value);
    showToast("Protokoll in die Zwischenablage kopiert!", "success");
}

// Ergebnisprotokoll als Textdatei herunterladen
function downloadProtocol() {
    const protocolField = document.getElementById('mr-protocol-field');
    if (!protocolField || !protocolField.value.trim()) {
        showToast("Kein Protokoll zum Herunterladen vorhanden.", "warning");
        return;
    }

    const dateStr = new Date().toISOString().substring(0, 10);
    const blob = new Blob([protocolField.value], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `Ergebnisprotokoll_Sitzung_${dateStr}.txt`;
    document.body.appendChild(a);
    a.click();
    
    setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }, 100);
}
