// vorstand/js/push/push-ui.js
// ==============================================================================
//  PUSH-MITTEILUNGEN - Benutzeroberfläche & Interaktion
// ==============================================================================

const PushUI = {
  containerId: 'view-push',
  state: {
    activeTab: 'compose', // 'compose' | 'subscribers' | 'history' | 'settings'
    stats: null,
    subscribers: [],
    history: [],
    settings: { appId: '', restApiKey: '' },
    subFilter: '',
    subGroupFilter: 'all', // 'all' | 'aktiv' | 'passiv' | 'vorstand'
    targetGroup: 'alle',
    selectedMemberPn: null
  },

  async init() {
    const container = document.getElementById(this.containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-2">
        <div>
          <h2 class="mb-1 text-primary fw-bold"><i class="fas fa-paper-plane me-2"></i>Push-Mitteilungen</h2>
          <p class="text-muted small mb-0">OneSignal Direktversand, Zielgruppen nach Personenkreis &amp; Abonnenten-Reichweite</p>
        </div>
        <div class="d-flex gap-2">
          <button class="btn btn-outline-secondary btn-sm" onclick="PushUI.refresh()">
            <i class="fas fa-rotate me-1"></i>Aktualisieren
          </button>
        </div>
      </div>

      <!-- NAVIGATION TABS -->
      <ul class="nav nav-pills mb-4 gap-2 bg-light p-2 rounded-3 border">
        <li class="nav-item">
          <button class="nav-link active px-3 fw-semibold" id="push-tab-compose-btn" onclick="PushUI.switchTab('compose')">
            <i class="fas fa-paper-plane me-2"></i>Mitteilung verfassen
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link px-3 fw-semibold text-secondary" id="push-tab-subs-btn" onclick="PushUI.switchTab('subscribers')">
            <i class="fas fa-users me-2"></i>Abonnenten &amp; Reichweite
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link px-3 fw-semibold text-secondary" id="push-tab-hist-btn" onclick="PushUI.switchTab('history')">
            <i class="fas fa-clock-rotate-left me-2"></i>Versand-Historie
          </button>
        </li>
        <li class="nav-item">
          <button class="nav-link px-3 fw-semibold text-secondary" id="push-tab-sett-btn" onclick="PushUI.switchTab('settings')">
            <i class="fas fa-key me-2"></i>OneSignal API
          </button>
        </li>
      </ul>

      <!-- TAB CONTENT CONTAINER -->
      <div id="push-tab-content">
        <div class="text-center py-5 text-muted">
          <div class="spinner-border text-primary spinner-border-sm me-2"></div>Lade Push-Cockpit...
        </div>
      </div>
    `;

    await this.loadAllData();
    this.renderActiveTab();
  },

  async loadAllData() {
    try {
      const [stats, subscribers, history, settings] = await Promise.all([
        PushCore.getAudienceStats(),
        PushCore.getSubscribersList(),
        PushCore.getHistory(),
        PushCore.getSettings()
      ]);
      this.state.stats = stats;
      this.state.subscribers = subscribers;
      this.state.history = history;
      this.state.settings = settings;
    } catch (err) {
      console.error('Fehler beim Laden der Push-Daten:', err);
    }
  },

  async refresh() {
    await this.loadAllData();
    this.renderActiveTab();
  },

  switchTab(tab) {
    this.state.activeTab = tab;
    ['compose', 'subscribers', 'history', 'settings'].forEach(t => {
      const btn = document.getElementById(`push-tab-${t === 'subscribers' ? 'subs' : (t === 'history' ? 'hist' : (t === 'settings' ? 'sett' : 'compose'))}-btn`);
      if (btn) {
        if (t === tab) {
          btn.className = 'nav-link active px-3 fw-semibold';
        } else {
          btn.className = 'nav-link px-3 fw-semibold text-secondary';
        }
      }
    });
    this.renderActiveTab();
  },

  renderActiveTab() {
    const target = document.getElementById('push-tab-content');
    if (!target) return;

    if (this.state.activeTab === 'compose') {
      this.renderComposeTab(target);
    } else if (this.state.activeTab === 'subscribers') {
      this.renderSubscribersTab(target);
    } else if (this.state.activeTab === 'history') {
      this.renderHistoryTab(target);
    } else if (this.state.activeTab === 'settings') {
      this.renderSettingsTab(target);
    }
  },

  // ---------------------------------------------------------
  //  TAB 1: MITTEILUNG VERFASSEN & VORSCHAU
  // ---------------------------------------------------------
  renderComposeTab(target) {
    const canWrite = typeof window.hasWriteAccess === 'function' ? window.hasWriteAccess('push') : true;
    const isSimulated = !this.state.settings.restApiKey;

    target.innerHTML = `
      ${isSimulated ? `
        <div class="alert alert-warning border-warning border-opacity-50 p-3 mb-4 rounded-3 d-flex align-items-center justify-content-between">
          <div>
            <i class="fas fa-triangle-exclamation me-2"></i>
            <strong>Hinweis:</strong> Der OneSignal REST API Key ist noch nicht hinterlegt. Nachrichten werden im sicheren Simulationsmodus im Protokoll abgelegt.
          </div>
          <button class="btn btn-sm btn-outline-dark" onclick="PushUI.switchTab('settings')">API Key hinterlegen</button>
        </div>
      ` : ''}

      <div class="row g-4">
        <!-- FORMULAR -->
        <div class="col-lg-7">
          <div class="card p-4 shadow-sm border-0 rounded-4">
            <h5 class="fw-bold mb-3"><i class="fas fa-bullhorn text-primary me-2"></i>Neue Nachricht verfassen</h5>
            
            <!-- ZIELGRUPPE -->
            <div class="mb-3">
              <label class="form-label fw-bold text-muted small mb-2">Empfängerkreis wählen</label>
              <div class="d-flex flex-wrap gap-2">
                <input type="radio" class="btn-check" name="push-target-radio" id="tg-alle" value="alle" ${this.state.targetGroup === 'alle' ? 'checked' : ''} onchange="PushUI.onTargetGroupChange('alle')">
                <label class="btn btn-outline-primary btn-sm px-3" for="tg-alle">👥 Alle Mitglieder</label>

                <input type="radio" class="btn-check" name="push-target-radio" id="tg-aktiv" value="aktiv" ${this.state.targetGroup === 'aktiv' ? 'checked' : ''} onchange="PushUI.onTargetGroupChange('aktiv')">
                <label class="btn btn-outline-primary btn-sm px-3" for="tg-aktiv">🎯 Nur Aktive</label>

                <input type="radio" class="btn-check" name="push-target-radio" id="tg-passiv" value="passiv" ${this.state.targetGroup === 'passiv' ? 'checked' : ''} onchange="PushUI.onTargetGroupChange('passiv')">
                <label class="btn btn-outline-primary btn-sm px-3" for="tg-passiv">☕ Nur Passive</label>

                <input type="radio" class="btn-check" name="push-target-radio" id="tg-vorstand" value="vorstand" ${this.state.targetGroup === 'vorstand' ? 'checked' : ''} onchange="PushUI.onTargetGroupChange('vorstand')">
                <label class="btn btn-outline-primary btn-sm px-3" for="tg-vorstand">👑 Nur Vorstand</label>

                <input type="radio" class="btn-check" name="push-target-radio" id="tg-indiv" value="individual" ${this.state.targetGroup === 'individual' ? 'checked' : ''} onchange="PushUI.onTargetGroupChange('individual')">
                <label class="btn btn-outline-primary btn-sm px-3" for="tg-indiv">👤 Einzelnes Mitglied</label>
              </div>
            </div>

            <!-- EINZELMITGLIED AUSWAHL (wenn gewählt) -->
            <div id="push-individual-select-box" class="mb-3 ${this.state.targetGroup === 'individual' ? '' : 'd-none'}">
              <label class="form-label fw-bold text-muted small mb-1">Empfänger-Mitglied</label>
              <select id="push-member-dropdown" class="form-select form-select-sm" onchange="PushUI.onMemberSelected(this.value)">
                <option value="">-- Mitglied auswählen --</option>
                ${this.state.subscribers.map(m => `
                  <option value="${m.person_number}" ${this.state.selectedMemberPn === m.person_number ? 'selected' : ''}>
                    ${m.name} (${m.personenkreis}${m.is_board ? ', Vorstand' : ''}) – Lizenz ${m.person_number}
                  </option>
                `).join('')}
              </select>
            </div>

            <!-- TITEL -->
            <div class="mb-3">
              <label class="form-label fw-bold text-muted small mb-1">Mitteilungs-Titel <span class="text-danger">*</span></label>
              <input type="text" id="push-input-title" class="form-control" placeholder="z. B. Kleinkaliber: Neues Standblatt freigegeben" oninput="PushUI.updatePreview()" maxlength="80" ${!canWrite ? 'disabled' : ''}>
              <div class="text-muted small mt-1 text-end"><span id="push-title-len">0</span> / 80 Zeichen</div>
            </div>

            <!-- NACHRICHTENTEXT -->
            <div class="mb-3">
              <label class="form-label fw-bold text-muted small mb-1">Nachrichtentext <span class="text-danger">*</span></label>
              <textarea id="push-input-msg" class="form-control" rows="3" placeholder="z. B. Hallo zusammen, die Resultate der 3. Meisterschaftsrunde sind online..." oninput="PushUI.updatePreview()" maxlength="250" ${!canWrite ? 'disabled' : ''}></textarea>
              <div class="text-muted small mt-1 text-end"><span id="push-msg-len">0</span> / 250 Zeichen</div>
            </div>

            <!-- ZIEL-URL / DEEPLINK -->
            <div class="mb-4">
              <label class="form-label fw-bold text-muted small mb-1">Ziel-Link beim Antippen (optional)</label>
              <div class="input-group">
                <input type="text" id="push-input-url" class="form-control form-control-sm" placeholder="https://... oder leer lassen" oninput="PushUI.updatePreview()" ${!canWrite ? 'disabled' : ''}>
                <button class="btn btn-outline-secondary btn-sm dropdown-toggle" type="button" data-bs-toggle="dropdown">Schnell-Link</button>
                <ul class="dropdown-dropdown dropdown-menu dropdown-menu-end">
                  <li><a class="dropdown-item small" href="javascript:void(0)" onclick="PushUI.setQuickUrl('https://sps-b55.pages.dev/')">🏠 Web-App Startseite</a></li>
                  <li><a class="dropdown-item small" href="javascript:void(0)" onclick="PushUI.setQuickUrl('https://sps-b55.pages.dev/?tab=umfragen')">🗓️ Anlässe &amp; Umfragen</a></li>
                  <li><a class="dropdown-item small" href="javascript:void(0)" onclick="PushUI.setQuickUrl('https://sps-b55.pages.dev/app_jm.html')">🏅 Jahresmeisterschaft KK</a></li>
                  <li><a class="dropdown-item small" href="javascript:void(0)" onclick="PushUI.setQuickUrl('https://sps-b55.pages.dev/app/upload.html')">📸 Standblatt einreichen</a></li>
                </ul>
              </div>
            </div>

            <!-- BUTTON -->
            <button id="push-send-btn" class="btn btn-primary py-2 px-4 fw-bold rounded-3 w-100" onclick="PushUI.sendPush()" ${!canWrite ? 'disabled' : ''}>
              <i class="fas fa-paper-plane me-2"></i>Push-Mitteilung jetzt senden
            </button>
          </div>
        </div>

        <!-- LIVE VORSCHAU (SMARTPHONE MOCKUP) -->
        <div class="col-lg-5">
          <div class="card p-4 shadow-sm border-0 rounded-4 bg-light">
            <h6 class="fw-bold text-muted mb-3"><i class="fas fa-mobile-screen me-2"></i>Live-Vorschau am Sperrbildschirm</h6>
            
            <div class="p-3 rounded-4 shadow-sm text-dark position-relative border" style="background: rgba(255, 255, 255, 0.95); backdrop-filter: blur(10px);">
              <div class="d-flex align-items-center justify-content-between mb-2">
                <div class="d-flex align-items-center gap-2">
                  <span class="p-1 rounded-2 bg-primary text-white" style="font-size: 0.75rem; width: 22px; height: 22px; display: inline-flex; align-items: center; justify-content: center;">🎯</span>
                  <span class="fw-bold small text-muted text-uppercase" style="letter-spacing: 0.5px; font-size: 0.75rem;">Sportschützen Muhen</span>
                </div>
                <span class="text-muted" style="font-size: 0.75rem;">Jetzt</span>
              </div>
              <div class="fw-bold mb-1" id="push-prev-title" style="font-size: 0.95rem; color: #0f3a5d;">Titel der Benachrichtigung</div>
              <div class="text-muted small" id="push-prev-msg" style="line-height: 1.35;">Hier erscheint dein Nachrichtentext so, wie ihn die Mitglieder auf dem iPhone oder Android-Handy sehen.</div>
              <div id="push-prev-url-box" class="mt-2 pt-2 border-top text-primary small d-none" style="font-size: 0.75rem;">
                <i class="fas fa-link me-1"></i><span id="push-prev-url">https://...</span>
              </div>
            </div>

            <div class="mt-3 p-3 bg-white rounded-3 border small text-muted">
              <strong>Zielgruppen-Effekt:</strong>
              <div class="mt-1" id="push-prev-target-desc">Mitteilung wird an <strong>alle Mitglieder</strong> gesendet.</div>
            </div>
          </div>
        </div>
      </div>
    `;

    this.updatePreview();
  },

  onTargetGroupChange(group) {
    this.state.targetGroup = group;
    const indivBox = document.getElementById('push-individual-select-box');
    if (indivBox) {
      indivBox.classList.toggle('d-none', group !== 'individual');
    }
    this.updatePreview();
  },

  onMemberSelected(pn) {
    this.state.selectedMemberPn = pn ? parseInt(pn, 10) : null;
    this.updatePreview();
  },

  setQuickUrl(url) {
    const input = document.getElementById('push-input-url');
    if (input) {
      input.value = url;
      this.updatePreview();
    }
  },

  updatePreview() {
    const titleInput = document.getElementById('push-input-title');
    const msgInput = document.getElementById('push-input-msg');
    const urlInput = document.getElementById('push-input-url');

    const prevTitle = document.getElementById('push-prev-title');
    const prevMsg = document.getElementById('push-prev-msg');
    const prevUrl = document.getElementById('push-prev-url');
    const prevUrlBox = document.getElementById('push-prev-url-box');
    const targetDesc = document.getElementById('push-prev-target-desc');

    const title = titleInput ? titleInput.value.trim() : '';
    const msg = msgInput ? msgInput.value.trim() : '';
    const url = urlInput ? urlInput.value.trim() : '';

    if (document.getElementById('push-title-len')) document.getElementById('push-title-len').innerText = title.length;
    if (document.getElementById('push-msg-len')) document.getElementById('push-msg-len').innerText = msg.length;

    if (prevTitle) prevTitle.innerText = title || 'Titel der Benachrichtigung';
    if (prevMsg) prevMsg.innerText = msg || 'Hier erscheint dein Nachrichtentext so, wie ihn die Mitglieder auf dem iPhone oder Android-Handy sehen.';

    if (prevUrlBox && prevUrl) {
      if (url) {
        prevUrl.innerText = url;
        prevUrlBox.classList.remove('d-none');
      } else {
        prevUrlBox.classList.add('d-none');
      }
    }

    if (targetDesc) {
      if (this.state.targetGroup === 'alle') {
        targetDesc.innerHTML = 'Mitteilung erreicht <strong>alle Abonnenten</strong> (Aktive &amp; Passive).';
      } else if (this.state.targetGroup === 'aktiv') {
        targetDesc.innerHTML = 'Mitteilung erreicht ausschliesslich <strong>aktive Schützen</strong> (Tag: <code>personenkreis = aktiv</code>).';
      } else if (this.state.targetGroup === 'passiv') {
        targetDesc.innerHTML = 'Mitteilung erreicht ausschliesslich <strong>Passivmitglieder</strong> (Tag: <code>personenkreis = passiv</code>).';
      } else if (this.state.targetGroup === 'vorstand') {
        targetDesc.innerHTML = 'Mitteilung erreicht ausschliesslich <strong>Vorstandsmitglieder</strong> (Tag: <code>is_board = true</code>).';
      } else if (this.state.targetGroup === 'individual') {
        const mem = this.state.subscribers.find(s => s.person_number === this.state.selectedMemberPn);
        targetDesc.innerHTML = mem
          ? `Mitteilung wird exklusiv an <strong>${mem.name}</strong> (Lizenz ${mem.person_number}) zugestellt.`
          : 'Bitte wähle oben das gewünschte Mitglied aus.';
      }
    }
  },

  async sendPush() {
    const title = document.getElementById('push-input-title')?.value.trim();
    const message = document.getElementById('push-input-msg')?.value.trim();
    const url = document.getElementById('push-input-url')?.value.trim();
    const targetGroup = this.state.targetGroup;
    const targetPn = this.state.selectedMemberPn;

    if (!title || !message) {
      alert('Bitte fülle Titel und Nachrichtentext aus.');
      return;
    }

    if (targetGroup === 'individual' && !targetPn) {
      alert('Bitte wähle ein Mitglied für den Einzelversand aus.');
      return;
    }

    const confirmMsg = `Möchtest du die Push-Mitteilung "${title}" jetzt an die Zielgruppe "${targetGroup}" senden?`;
    if (!confirm(confirmMsg)) return;

    const btn = document.getElementById('push-send-btn');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Wird gesendet...';
    }

    try {
      const user = (typeof window.getCurrentUser === 'function') ? window.getCurrentUser() : null;
      const sentBy = user?.name || user?.username || 'Vorstand';

      const res = await PushCore.sendPushNotification({
        title,
        message,
        target_group: targetGroup,
        target_person_number: targetGroup === 'individual' ? targetPn : undefined,
        target_url: url || undefined,
        sent_by_user: sentBy
      });

      alert(res.simulated
        ? `ℹ️ Mitteilung erfolgreich simuliert!\n${res.message}`
        : `✅ Push-Mitteilung erfolgreich an ${res.recipients} Empfänger gesendet!`
      );

      // Formular zurücksetzen & Historie aktualisieren
      if (document.getElementById('push-input-title')) document.getElementById('push-input-title').value = '';
      if (document.getElementById('push-input-msg')) document.getElementById('push-input-msg').value = '';
      if (document.getElementById('push-input-url')) document.getElementById('push-input-url').value = '';
      this.updatePreview();

      await this.loadAllData();

    } catch (err) {
      alert(`Fehler beim Senden: ${err.message || err}`);
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<i class="fas fa-paper-plane me-2"></i>Push-Mitteilung jetzt senden';
      }
    }
  },

  // ---------------------------------------------------------
  //  TAB 2: ABONNENTEN & REICHWEITE
  // ---------------------------------------------------------
  renderSubscribersTab(target) {
    const s = this.state.stats || {
      active_members: 0,
      active_with_push: 0,
      passive_members: 0,
      passive_with_push: 0,
      board_members: 0,
      board_with_push: 0
    };

    const actPct = s.active_members > 0 ? Math.round((s.active_with_push / s.active_members) * 100) : 0;
    const passPct = s.passive_members > 0 ? Math.round((s.passive_with_push / s.passive_members) * 100) : 0;
    const boardPct = s.board_members > 0 ? Math.round((s.board_with_push / s.board_members) * 100) : 0;

    // Filter anwenden
    const query = (this.state.subFilter || '').toLowerCase().trim();
    const gFilter = this.state.subGroupFilter;

    const filtered = this.state.subscribers.filter(m => {
      if (gFilter === 'aktiv' && m.personenkreis !== 'aktiv') return false;
      if (gFilter === 'passiv' && m.personenkreis !== 'passiv') return false;
      if (gFilter === 'vorstand' && !m.is_board) return false;
      if (gFilter === 'granted' && !m.has_push) return false;
      if (query) {
        return m.name.toLowerCase().includes(query) || String(m.person_number).includes(query);
      }
      return true;
    });

    target.innerHTML = `
      <!-- REICHWEITEN KARTEN -->
      <div class="row g-3 mb-4">
        <div class="col-md-4">
          <div class="card p-3 border-0 shadow-sm rounded-4 h-100" style="background: linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%);">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-bold text-primary">🎯 Aktive Schützen</span>
              <span class="badge bg-primary rounded-pill">${actPct}% aktiv</span>
            </div>
            <div class="fs-4 fw-bold text-dark mb-1">${s.active_with_push} <span class="fs-6 fw-normal text-muted">von ${s.active_members} Mitgliedern</span></div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-primary" role="progressbar" style="width: ${actPct}%"></div>
            </div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card p-3 border-0 shadow-sm rounded-4 h-100" style="background: linear-gradient(135deg, #fefce8 0%, #fef08a 100%);">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-bold text-warning-emphasis">☕ Passiv-Mitglieder</span>
              <span class="badge bg-warning text-dark rounded-pill">${passPct}% aktiv</span>
            </div>
            <div class="fs-4 fw-bold text-dark mb-1">${s.passive_with_push} <span class="fs-6 fw-normal text-muted">von ${s.passive_members} Mitgliedern</span></div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-warning" role="progressbar" style="width: ${passPct}%"></div>
            </div>
          </div>
        </div>

        <div class="col-md-4">
          <div class="card p-3 border-0 shadow-sm rounded-4 h-100" style="background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-bold text-success">👑 Vorstandsmitglieder</span>
              <span class="badge bg-success rounded-pill">${boardPct}% aktiv</span>
            </div>
            <div class="fs-4 fw-bold text-dark mb-1">${s.board_with_push} <span class="fs-6 fw-normal text-muted">von ${s.board_members} Mitgliedern</span></div>
            <div class="progress" style="height: 6px;">
              <div class="progress-bar bg-success" role="progressbar" style="width: ${boardPct}%"></div>
            </div>
          </div>
        </div>
      </div>

      <!-- FILTER & TABELLE -->
      <div class="card p-4 shadow-sm border-0 rounded-4">
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div class="d-flex gap-2 align-items-center">
            <input type="text" class="form-control form-control-sm" placeholder="🔍 Mitglied suchen..." value="${this.state.subFilter}" oninput="PushUI.onSubFilter(this.value)" style="width: 220px;">
            <select class="form-select form-select-sm" style="width: 170px;" onchange="PushUI.onGroupFilter(this.value)">
              <option value="all" ${gFilter === 'all' ? 'selected' : ''}>Alle Gruppen</option>
              <option value="aktiv" ${gFilter === 'aktiv' ? 'selected' : ''}>Nur Aktive</option>
              <option value="passiv" ${gFilter === 'passiv' ? 'selected' : ''}>Nur Passive</option>
              <option value="vorstand" ${gFilter === 'vorstand' ? 'selected' : ''}>Nur Vorstand</option>
              <option value="granted" ${gFilter === 'granted' ? 'selected' : ''}>Nur mit aktivem Push</option>
            </select>
          </div>
          <div class="small text-muted">${filtered.length} Mitglieder angezeigt</div>
        </div>

        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Name</th>
                <th>Lizenz</th>
                <th>Personenkreis</th>
                <th>Rolle</th>
                <th>Push-Status</th>
                <th>Gerät</th>
                <th>Aktivität</th>
                <th class="text-end">Aktion</th>
              </tr>
            </thead>
            <tbody>
              ${filtered.length === 0 ? `
                <tr><td colspan="8" class="text-center text-muted py-4">Keine Mitglieder für diese Filterkriterien gefunden.</td></tr>
              ` : filtered.map(m => `
                <tr>
                  <td class="fw-bold">${m.name}</td>
                  <td><code>${m.person_number}</code></td>
                  <td>
                    <span class="badge ${m.personenkreis === 'aktiv' ? 'bg-primary-subtle text-primary border border-primary-subtle' : 'bg-warning-subtle text-warning-emphasis border border-warning-subtle'}">
                      ${m.personenkreis === 'aktiv' ? '🎯 Aktiv' : '☕ Passiv'}
                    </span>
                  </td>
                  <td>
                    ${m.is_board ? '<span class="badge bg-dark-subtle text-dark border">👑 Vorstand</span>' : '<span class="text-muted small">Mitglied</span>'}
                  </td>
                  <td>
                    ${m.has_push 
                      ? '<span class="badge bg-success-subtle text-success border border-success-subtle"><i class="fas fa-check-circle me-1"></i>Aktiviert</span>' 
                      : '<span class="badge bg-secondary-subtle text-muted border"><i class="fas fa-circle-xmark me-1"></i>Nicht aktiviert</span>'}
                  </td>
                  <td><span class="small text-muted">${m.device_type}</span></td>
                  <td><span class="small text-muted">${m.last_active ? new Date(m.last_active).toLocaleDateString('de-CH') : '–'}</span></td>
                  <td class="text-end">
                    <button class="btn btn-xs btn-outline-primary py-1 px-2" style="font-size:0.75rem;" onclick="PushUI.targetDirectMember(${m.person_number})">
                      <i class="fas fa-paper-plane me-1"></i>Push senden
                    </button>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  onSubFilter(val) {
    this.state.subFilter = val;
    this.renderSubscribersTab(document.getElementById('push-tab-content'));
  },

  onGroupFilter(val) {
    this.state.subGroupFilter = val;
    this.renderSubscribersTab(document.getElementById('push-tab-content'));
  },

  targetDirectMember(pn) {
    this.state.targetGroup = 'individual';
    this.state.selectedMemberPn = pn;
    this.switchTab('compose');
  },

  // ---------------------------------------------------------
  //  TAB 3: VERSAND-HISTORIE
  // ---------------------------------------------------------
  renderHistoryTab(target) {
    const list = this.state.history || [];

    target.innerHTML = `
      <div class="card p-4 shadow-sm border-0 rounded-4">
        <h5 class="fw-bold mb-3"><i class="fas fa-clock-rotate-left text-primary me-2"></i>Bisher versendete Mitteilungen</h5>
        
        <div class="table-responsive">
          <table class="table table-hover align-middle mb-0">
            <thead class="table-light">
              <tr>
                <th>Datum &amp; Uhrzeit</th>
                <th>Titel &amp; Nachricht</th>
                <th>Zielgruppe</th>
                <th>Absender</th>
                <th>Empfänger</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${list.length === 0 ? `
                <tr><td colspan="6" class="text-center text-muted py-4">Noch keine Push-Mitteilungen versendet.</td></tr>
              ` : list.map(item => `
                <tr>
                  <td class="small text-nowrap text-muted">${new Date(item.created_at).toLocaleString('de-CH')}</td>
                  <td style="max-width: 320px;">
                    <div class="fw-bold text-dark">${item.title}</div>
                    <div class="small text-muted text-truncate" title="${item.message}">${item.message}</div>
                    ${item.target_url ? `<a href="${item.target_url}" target="_blank" class="small text-primary text-decoration-none"><i class="fas fa-link me-1"></i>Link</a>` : ''}
                  </td>
                  <td>
                    <span class="badge bg-light text-dark border">
                      ${item.target_group === 'alle' ? '👥 Alle' : (item.target_group === 'aktiv' ? '🎯 Aktive' : (item.target_group === 'passiv' ? '☕ Passive' : (item.target_group === 'vorstand' ? '👑 Vorstand' : `👤 Lizenz ${item.target_person_number}`)))}
                    </span>
                  </td>
                  <td class="small text-muted">${item.sent_by_user}</td>
                  <td><span class="fw-bold">${item.recipients_count}</span></td>
                  <td>
                    ${item.status === 'sent' 
                      ? '<span class="badge bg-success-subtle text-success border border-success-subtle">✅ Zugestellt</span>'
                      : (item.status === 'simulated'
                          ? '<span class="badge bg-warning-subtle text-warning-emphasis border border-warning-subtle">⚠️ Simulation</span>'
                          : '<span class="badge bg-danger-subtle text-danger border border-danger-subtle">❌ Fehler</span>')}
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
      </div>
    `;
  },

  // ---------------------------------------------------------
  //  TAB 4: ONESIGNAL EINSTELLUNGEN
  // ---------------------------------------------------------
  renderSettingsTab(target) {
    const canWrite = typeof window.hasWriteAccess === 'function' ? window.hasWriteAccess('push') : true;

    target.innerHTML = `
      <div class="row g-4">
        <div class="col-lg-7">
          <div class="card p-4 shadow-sm border-0 rounded-4">
            <h5 class="fw-bold mb-3"><i class="fas fa-key text-primary me-2"></i>OneSignal API Zugangsdaten</h5>
            <p class="text-muted small">
              Der OneSignal REST API Key wird für den sicheren serverseitigen Versand aus dem Portal benötigt.
              Du findest ihn im <a href="https://dashboard.onesignal.com" target="_blank" class="text-decoration-none">OneSignal Dashboard</a> unter <strong>Settings &gt; Keys &amp; IDs</strong>.
            </p>

            <div class="mb-3">
              <label class="form-label fw-bold text-muted small mb-1">OneSignal App ID</label>
              <input type="text" id="push-cfg-appid" class="form-control font-monospace form-control-sm" value="${this.state.settings.appId || 'fe30b2b7-1dcb-43e9-8e39-b1870d1a6815'}" ${!canWrite ? 'disabled' : ''}>
            </div>

            <div class="mb-4">
              <label class="form-label fw-bold text-muted small mb-1">OneSignal REST API Key</label>
              <input type="password" id="push-cfg-apikey" class="form-control font-monospace form-control-sm" placeholder="os_v2_app_..." value="${this.state.settings.restApiKey || ''}" ${!canWrite ? 'disabled' : ''}>
              <div class="small text-muted mt-1">Wird sicher verschlüsselt in Supabase <code>system_app_configs</code> hinterlegt.</div>
            </div>

            <div class="d-flex gap-2">
              <button class="btn btn-primary btn-sm px-4 fw-bold" onclick="PushUI.saveSettings()" ${!canWrite ? 'disabled' : ''}>
                <i class="fas fa-save me-1"></i>Einstellungen speichern
              </button>
            </div>
          </div>
        </div>

        <div class="col-lg-5">
          <div class="card p-4 shadow-sm border-0 rounded-4 bg-light">
            <h6 class="fw-bold text-muted mb-3"><i class="fas fa-circle-info me-2"></i>System-Status</h6>
            <ul class="list-unstyled mb-0 small">
              <li class="mb-2 d-flex justify-content-between">
                <span>OneSignal App ID:</span>
                <span class="badge bg-success-subtle text-success">Verknüpft</span>
              </li>
              <li class="mb-2 d-flex justify-content-between">
                <span>REST API Status:</span>
                <span>
                  ${this.state.settings.restApiKey 
                    ? '<span class="badge bg-success-subtle text-success">✅ Konfiguriert</span>' 
                    : '<span class="badge bg-warning-subtle text-warning-emphasis">⚠️ Simulation aktiv</span>'}
                </span>
              </li>
              <li class="mb-2 d-flex justify-content-between">
                <span>Registrierte Geräte:</span>
                <span class="fw-bold text-dark">${this.state.stats?.total_with_push || 0}</span>
              </li>
              <li class="d-flex justify-content-between">
                <span>Edge Function:</span>
                <span class="badge bg-primary-subtle text-primary">Aktiv (CT 117)</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    `;
  },

  async saveSettings() {
    const appId = document.getElementById('push-cfg-appid')?.value.trim();
    const apiKey = document.getElementById('push-cfg-apikey')?.value.trim();

    try {
      await PushCore.saveSettings(appId, apiKey);
      this.state.settings.appId = appId;
      this.state.settings.restApiKey = apiKey;
      alert('✅ Einstellungen erfolgreich gespeichert!');
      this.renderActiveTab();
    } catch (err) {
      alert(`Fehler beim Speichern: ${err.message || err}`);
    }
  }
};

window.PushUI = PushUI;
