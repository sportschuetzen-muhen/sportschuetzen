// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - UI ===

function renderUmfragenUI(container) {
  if (!container) return;
  
  // Haupt-Layout mit Tabs
  container.innerHTML = `
    <ul class="nav nav-tabs mb-3" id="umfragen-tabs">
        <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#tab-umfragen-events">🗓️ Events verwalten</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-teilnehmer" onclick="loadParticipantsIfEventSelected()">👥 Auswertung & Mails</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-gruppen" onclick="loadGroupsIfEventSelected()">🎯 Gruppen-Anmeldung</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-historie" onclick="loadUmfragenHistorie()">📜 Historie & Tracking</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-personenkreise" onclick="loadUmfragenPersonenkreise()">👥 Personenkreise</a></li>
        <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#tab-umfragen-controlling" onclick="initGVControllingTab()">⚙️ Generalversammlungen</a></li>
    </ul>

    <div class="tab-content">
        <!-- TAB 1: EVENTS VERWALTEN -->
        <div class="tab-pane fade show active" id="tab-umfragen-events">
            <button class="btn btn-sm btn-success mb-2 write-protected" onclick="addUmfrageEvent()">+ Neuer Event</button>
            <div class="table-responsive bg-white border rounded">
                <table class="table table-sm table-hover mb-0" style="min-width: 800px;">
                    <thead class="table-light">
                        <tr style="cursor:pointer; user-select:none;">
                            <th onclick="sortUmfragenEvents('id')">ID ⇅</th>
                            <th onclick="sortUmfragenEvents('title')">Titel ⇅</th>
                            <th onclick="sortUmfragenEvents('datum')">Datum ⇅</th>
                            <th onclick="sortUmfragenEvents('gruppe')">Personenkreis ⇅</th>
                            <th class="text-center" onclick="sortUmfragenEvents('schiessanlass')">Schiess-<br>anlass 🎯 ⇅</th>
                            <th class="text-center" onclick="sortUmfragenEvents('aktiv')">Aktiv ⇅</th>
                            <th class="text-center" onclick="sortUmfragenEvents('showparticipants')">Teilnehmer<br>sichtbar ⇅</th>
                            <th class="text-center" style="cursor:default;">Frage:<br>Begleitung</th>
                            <th class="text-center" style="cursor:default;">Frage:<br>Essen</th>
                            <th style="cursor:default;"></th>
                        </tr>
                    </thead>
                    <tbody id="umfragen-events-body"></tbody>
                </table>
                <datalist id="umfragen-gruppe-list"></datalist>
            </div>
        </div>

        <!-- TAB 2: TEILNEHMER AUSWERTUNG -->
        <div class="tab-pane fade" id="tab-umfragen-teilnehmer">
            <div class="row g-3">
                <div class="col-md-5">
                    <div class="card shadow-sm border-0 p-3">
                        <label class="form-label fw-bold">Event Auswählen</label>
                        <select class="form-select" id="umfragen-event-selector" onchange="selectEventForParticipants(this.value)">
                            <option value="">-- Bitte wählen --</option>
                            ${(umfragenState || []).map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title || 'Ohne Titel')} (${e.datum ? e.datum.split('T')[0] : '-'})${isTrue(e.schiessanlass) ? ' 🎯' : ''}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="col-md-7">
                    <div class="card shadow-sm border-0 p-3 h-100">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                             <h5 class="card-title mb-0">Angemeldete Teilnehmer ("Ja")</h5>
                             <div class="d-flex gap-2">
                                  <button class="btn btn-sm btn-primary" id="btn-umfragen-mail" onclick="generateMailForParticipants()" disabled>
                                      📧 Mail an Teilnehmer
                                  </button>
                             </div>
                        </div>
                        <div id="umfragen-teilnehmer-list" class="small mt-2">
                            <div class="text-muted">Bitte wähle links einen Event aus.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 3: GRUPPEN AUTOMATISIERUNG -->
        <div class="tab-pane fade" id="tab-umfragen-gruppen">
            <div class="row g-3">
                <div class="col-md-4">
                    <div class="card shadow-sm border-0 p-3">
                        <label class="form-label fw-bold">Schiessanlass wählen</label>
                        <select class="form-select" id="umfragen-gruppen-event-selector" onchange="selectEventForGroups(this.value)">
                            <option value="">-- Bitte wählen --</option>
                            ${(umfragenState || []).filter(e => isTrue(e.schiessanlass)).map(e => `<option value="${escapeHtml(e.id)}">${escapeHtml(e.title)} (${e.datum ? e.datum.split('T')[0] : '-'})</option>`).join('')}
                        </select>
                        <div class="mt-3 small text-muted">
                            <i class="fas fa-info-circle"></i> Nur Events, die als 🎯 <b>Schiessanlass</b> markiert sind, erscheinen hier.
                        </div>
                    </div>
                </div>
                <div class="col-md-8">
                    <div class="card shadow-sm border-0 p-3">
                        <div class="d-flex justify-content-between align-items-center mb-3">
                            <h5 class="card-title mb-0">Gruppen-Vorschlag (5er Teams)</h5>
                            <button type="button" class="btn btn-sm btn-primary" id="btn-generate-group-mail" onclick="generateGroupMail()" disabled>
                                📧 Gruppen-Anmeldung Mail
                            </button>
                        </div>
                        <div id="umfragen-gruppen-container" class="small">
                            <div class="text-muted">Wähle einen Schiessanlass aus, um die Gruppenbildung zu sehen.</div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 5: HISTORIE & TRACKING -->
        <div class="tab-pane fade" id="tab-umfragen-historie">
            <div class="row g-3">
                <div class="col-md-12">
                    <div class="card shadow-sm border-0 p-3">
                        <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
                            <h5 class="card-title mb-0">📜 Aktivitäts-Log & Gelesen-Tracking</h5>
                            <div class="d-flex gap-2 align-items-center">
                                <label class="form-label mb-0 small fw-bold">Event:</label>
                                <select class="form-select form-select-sm" id="hist-event-filter" onchange="filterHistorieData()" style="width: auto; max-width: 250px;">
                                    <option value="">-- Alle Events --</option>
                                </select>
                                <input type="text" class="form-control form-control-sm" id="hist-search-input" oninput="filterHistorieData()" placeholder="🔍 Mitglied suchen..." style="width: 180px;">
                                <button class="btn btn-sm btn-outline-secondary" onclick="loadUmfragenHistorie(true)">
                                    🔄 Aktualisieren
                                </button>
                            </div>
                        </div>
                        <ul class="nav nav-pills mb-3" id="pills-tab" role="tablist">
                            <li class="nav-item" role="presentation">
                                <button class="nav-link active btn-sm" id="pills-rsvp-tab" data-bs-toggle="pill" data-bs-target="#pills-rsvp" type="button" role="tab">💬 An-/Abmeldungen</button>
                            </li>
                            <li class="nav-item" role="presentation">
                                <button class="nav-link btn-sm" id="pills-views-tab" data-bs-toggle="pill" data-bs-target="#pills-views" type="button" role="tab">👁️ Gelesen-Tracking</button>
                            </li>
                        </ul>
                        <div class="tab-content" id="pills-tabContent">
                            <div class="tab-pane fade show active" id="pills-rsvp" role="tabpanel">
                                <div class="table-responsive" style="max-height: 500px;">
                                    <table class="table table-sm table-striped align-middle mb-0">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Zeitpunkt</th>
                                                <th>Mitglied</th>
                                                <th>Event</th>
                                                <th class="text-center">Status</th>
                                                <th class="text-center">Begl.</th>
                                                <th class="text-center">Essen</th>
                                            </tr>
                                        </thead>
                                        <tbody id="hist-rsvp-body">
                                            <tr><td colspan="6" class="text-center text-muted py-3">Lade Daten...</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                            <div class="tab-pane fade" id="pills-views" role="tabpanel">
                                <div class="table-responsive" style="max-height: 500px;">
                                    <table class="table table-sm table-striped align-middle mb-0">
                                        <thead class="table-light">
                                            <tr>
                                                <th>Zeitpunkt</th>
                                                <th>Mitglied</th>
                                                <th>Event / Ort</th>
                                                <th>Aktion/Info</th>
                                            </tr>
                                        </thead>
                                        <tbody id="hist-views-body">
                                            <tr><td colspan="4" class="text-center text-muted py-3">Lade Daten...</td></tr>
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 6: PERSONENKREISE -->
        <div class="tab-pane fade" id="tab-umfragen-personenkreise">
            <div class="card shadow-sm border-0 p-3">
                <div class="d-flex flex-wrap gap-2 justify-content-between align-items-center mb-3">
                    <h5 class="card-title mb-0">👥 Mitglieder & Personenkreise</h5>
                    <div class="d-flex gap-2">
                        <input type="text" class="form-control form-control-sm" id="personenkreise-search" oninput="filterPersonenkreise()" placeholder="🔍 Mitglied suchen..." style="width: 200px;">
                        <button class="btn btn-sm btn-outline-secondary" onclick="loadUmfragenPersonenkreise(true)">
                            🔄 Aktualisieren
                        </button>
                    </div>
                </div>
                <div class="row g-3">
                    <div class="col-md-4">
                        <div class="card h-100 border-light shadow-sm">
                            <div class="card-header bg-primary text-white py-2 d-flex justify-content-between align-items-center">
                                <span class="fw-bold">🎯 Aktiv-Verteiler</span>
                                <span class="badge bg-light text-primary" id="count-pk-aktiv">0</span>
                            </div>
                            <div class="card-body p-0" style="max-height: 450px; overflow-y: auto;">
                                <ul class="list-group list-group-flush small" id="list-pk-aktiv"></ul>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card h-100 border-light shadow-sm">
                            <div class="card-header bg-secondary text-white py-2 d-flex justify-content-between align-items-center">
                                <span class="fw-bold">📁 Passiv-Verteiler</span>
                                <span class="badge bg-light text-secondary" id="count-pk-passiv">0</span>
                            </div>
                            <div class="card-body p-0" style="max-height: 450px; overflow-y: auto;">
                                <ul class="list-group list-group-flush small" id="list-pk-passiv"></ul>
                            </div>
                        </div>
                    </div>
                    <div class="col-md-4">
                        <div class="card h-100 border-light shadow-sm">
                            <div class="card-header bg-dark text-white py-2 d-flex justify-content-between align-items-center">
                                <span class="fw-bold">👥 Alle Mitglieder</span>
                                <span class="badge bg-light text-dark" id="count-pk-alle">0</span>
                            </div>
                            <div class="card-body p-0" style="max-height: 450px; overflow-y: auto;">
                                <ul class="list-group list-group-flush small" id="list-pk-alle"></ul>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- TAB 4: ERWEITERTES CONTROLLING (GV & PRAESENZ) -->
        <div class="tab-pane fade" id="tab-umfragen-controlling">
            <div class="row g-3">
                <div class="col-md-12 write-protected">
                    <div class="card p-3 mb-3">
                        <div class="d-flex justify-content-between align-items-center mb-2">
                            <h5 class="card-title mb-0">&#128640; Tools</h5>
                            <button class="btn btn-success btn-sm write-protected" onclick="saveGVData()">&#128190; GV-Stammdaten speichern</button>
                        </div>
                        <div class="d-flex gap-2 flex-wrap align-items-center">
                            <div class="form-check form-switch d-flex align-items-center me-2 pe-2 border-end" style="margin-bottom: 0; min-height: auto;">
                                <input class="form-check-input me-2" type="checkbox" id="gv-wahljahr-switch-embedded" style="cursor: pointer;">
                                <label class="form-check-label small fw-bold text-muted" for="gv-wahljahr-switch-embedded" style="cursor: pointer; user-select: none;">Wahljahr</label>
                            </div>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('genPDF')">&#128196; Einladungs-PDF</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendMails')">&#128231; GV Mails senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendReminders')">&#128276; Mahnungen senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendSummary')">&#128202; Uebersicht senden</button>
                            <button class="btn btn-outline-primary btn-sm" onclick="runGVTool('sendPraesenz')">&#128221; Praesenzliste senden</button>
                        </div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card p-3">
                        <h5 class="card-title">Stammdaten / Platzhalter</h5>
                        <div id="gv-list-embedded"></div>
                    </div>
                </div>
                <div class="col-md-6">
                    <div class="card p-3">
                        <h5 class="card-title">Praesenz / Anmeldungen (Eventplaner)</h5>
                        <div class="mb-2">
                            <label class="form-label small">Verknuepftes Event waehlen:</label>
                            <select class="form-select form-select-sm" id="gv-event-selector" onchange="loadGVParticipants(this.value)">
                                <option value="">-- Lade Events... --</option>
                            </select>
                        </div>
                        <div class="table-responsive" style="max-height: 430px;">
                            <table class="table table-sm table-striped">
                                <thead>
                                    <tr>
                                        <th style="cursor: pointer;" onclick="sortGvTable('name')">Name &#8645;</th>
                                        <th style="cursor: pointer;" onclick="sortGvTable('status')">Teilnahme &#8645;</th>
                                    </tr>
                                </thead>
                                <tbody id="gv-anmelde-body">
                                    <tr><td colspan="2" class="text-center text-muted">Bitte Event auswaehlen</td></tr>
                                </tbody>
                            </table>
                        </div>
                        <div id="gv-anmelde-summary" class="mt-3"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
  `;
  renderUmfragenEventsList();
}

async function ensureMembersLookup() {
    if(membersLookup !== null) return;
    membersLookup = {};
    try {
        // Verwende den globalen Cache window._mglData, falls bereits vorverlegt geladen,
        // um eine redundante API-Anfrage ans Backend komplett zu vermeiden!
        let members = window._mglData || [];
        if (members.length === 0) {
            const res = await apiFetch('mitglieder', 'action=getAll');
            const data = await res.json();
            members = Array.isArray(data.data) ? data.data : [];
        }
        members.forEach(m => {
            if(m.PersonNumber) {
                membersLookup[String(m.PersonNumber).trim()] = m;
            }
            if(m.AddressNumber) {
                membersLookup[String(m.AddressNumber).trim()] = m;
                membersLookup[String(m.AddressNumber).trim().padStart(6, '0')] = m;
            }
        });
    } catch(e) {
        console.error("Fehler beim Laden der Mitglieder-Adressen", e);
    }
}
