// =====================================================================
// MODUL: DOKUMENTEN- & VORLAGEN-POOL (PHASE 12 / VERMIETUNG HARMONISIERUNG)
// Projekt: Vereinsportal Sportschützen Muhen
// =====================================================================

(function() {
  window._docTemplatesData = [];
  window._docClausesData = [];
  window._selectedDocCategory = 'rechnung';
  window._selectedDocCode = 'jahresbeitrag';
  window._docLastFocusedField = null;

  // Supabase Client Helper
  function getDocSupabaseClient() {
    if (typeof window.getSupabaseClient === 'function') {
      return window.getSupabaseClient();
    }
    return window.supabaseClient || null;
  }

  // 1. DATEN AUS SUPABASE LADEN
  window.loadDocumentTemplatesData = async function() {
    const sb = getDocSupabaseClient();
    if (!sb) {
      console.warn("⚠️ [Vorlagen-Pool] Supabase Client nicht verfügbar.");
      return;
    }

    try {
      const [tRes, cRes] = await Promise.all([
        sb.from('document_templates').select('*').order('category').order('code'),
        sb.from('document_template_clauses').select('*').order('sort_order', { ascending: true })
      ]);

      if (tRes.data && tRes.data.length > 0) {
        window._docTemplatesData = tRes.data;
      }
      if (cRes.data && cRes.data.length > 0) {
        window._docClausesData = cRes.data;
      }

      // Synchronisation für abwärtskompatible Alt-Module (_invoiceLayouts)
      if (!window._invoiceLayouts) window._invoiceLayouts = {};
      window._docTemplatesData.forEach(t => {
        window._invoiceLayouts[t.code] = {
          type: t.code,
          title: t.title,
          intro: t.intro,
          outro: t.outro,
          notice: t.notice,
          mail_subject: t.mail_subject,
          mail_body: t.mail_body
        };
        const capKey = t.code.charAt(0).toUpperCase() + t.code.slice(1);
        window._invoiceLayouts[capKey] = window._invoiceLayouts[t.code];
      });
      console.log(`✅ [Vorlagen-Pool] ${window._docTemplatesData.length} Vorlagen & ${window._docClausesData.length} Klauseln geladen.`);
    } catch (err) {
      console.error("❌ [Vorlagen-Pool] Fehler beim Laden:", err);
    }
  };

  // Helper für saubere Vorlagentitel
  window.getCleanDocTemplateTitle = function(t) {
    if (!t) return 'Vorlage';
    const friendlyMap = {
      'materialverkauf': 'Materialverkauf (Kleider/Munition)',
      'depot_pfand': 'Depot & Kaution (Inventar)',
      'depot / pfand': 'Depot & Kaution (Inventar)',
      'jahresbeitrag': 'Jahresbeitrag',
      'vermietung': 'Zusatzrechnung Wirtschaft/Vermietung',
      'schulsport': 'Schulsport / Kurse',
      'sponsoring': 'Sponsoring & Gönner',
      'sonstige': 'Sonstige Rechnungen',
      'mahnung_1': '1. Mahnung (Erinnerung)',
      'mahnung_2': '2. Mahnung',
      'mahnung_3': '3. Mahnung (Letzte Frist)',
      'mahnung': 'Mahnung (Standard)',
      'mietvertrag': 'Mietvertrag & Benützungsreglement Schützenstube',
      'vm_vertrag': 'Mail: Mietvertrag & QR-Rechnung',
      'vm_mahnung': 'Mail: Zahlungserinnerung (7 Tage Frist)',
      'vm_bestaetigung': 'Mail: Zahlungseingang & Bestätigung',
      'vm_schluessel': 'Mail: Schlüsselübergabe & Hinweise',
      'vm_storno': 'Mail: Stornierungsbestätigung (Allgemein)',
      'vm_storno_verzug': 'Mail: Stornierung Zahlungsverzug',
      'vm_info_wirtschaft': 'Mail: Info Wirtschaft (Intern)',
      'gv_normal': 'GV-Einladung (Standard)',
      'gv_wahljahr': 'GV-Einladung (Wahljahr)',
      'freier_brief': 'Freier Vorstandsbrief'
    };
    if (friendlyMap[t.code?.toLowerCase()]) return friendlyMap[t.code.toLowerCase()];
    if (t.title) {
      if (t.title.includes('–')) {
        const parts = t.title.split('–');
        return parts.slice(1).join('–').trim() || t.title;
      }
      if (t.title.includes('-')) {
        const parts = t.title.split('-');
        return parts.slice(1).join('-').trim() || t.title;
      }
      return t.title;
    }
    return t.code || 'Vorlage';
  };

  // 2. HAUPT-RENDERING DER MODUL-KACHEL
  window.renderDokumentVorlagen = async function(container) {
    if (!container) container = document.getElementById('dokument-vorlagen-container');
    if (!container) return;

    if (!window._docTemplatesData || window._docTemplatesData.length === 0) {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary mb-3" role="status"></div>
          <p class="text-muted fw-bold">Lade Vorlagen- & Klauselpool aus Supabase...</p>
        </div>
      `;
      await window.loadDocumentTemplatesData();
    }

    // ZEILE 1: ALLGEMEINE DOKUMENTEN-KATEGORIEN
    const row1Categories = [
      { key: 'rechnung', label: 'Rechnungen', icon: 'fa-file-invoice-dollar' },
      { key: 'mahnung', label: 'Mahnwesen', icon: 'fa-bell text-warning' },
      { key: 'gv', label: 'Generalversammlung', icon: 'fa-users-between-lines text-success' },
      { key: 'brief', label: 'Mitteilungen & Briefe', icon: 'fa-envelope-open-text text-info' }
    ];

    const currentCat = window._selectedDocCategory || 'rechnung';
    const isVermietungMail = (currentCat === 'vermietung_mail');
    const isMietvertragPdf = (currentCat === 'vertrag');

    // Aktuelle Vorlagen filtern
    let templatesInCat = window._docTemplatesData.filter(t => t.category === currentCat);
    if (currentCat === 'vertrag') {
      templatesInCat = window._docTemplatesData.filter(t => t.category === 'vertrag' || t.code === 'mietvertrag');
    }

    // Falls aktuelle Vorlage nicht in Kategorie, erste wählen
    if (!templatesInCat.find(t => t.code === window._selectedDocCode)) {
      window._selectedDocCode = templatesInCat[0]?.code || '';
    }

    const currentTemplate = window._docTemplatesData.find(t => t.code === window._selectedDocCode) || templatesInCat[0] || {};
    const clausesForTemplate = window._docClausesData.filter(c => c.template_id === currentTemplate.id);

    // HTML Zeile 1: Allgemeine Kategorien
    const row1TabsHtml = row1Categories.map(c => `
      <button class="btn btn-sm ${currentCat === c.key ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="docSelectCategory('${c.key}')">
        <i class="fas ${c.icon} me-1.5"></i> ${c.label}
      </button>
    `).join('');

    // HTML Zeile 2: Fachbereich Vermietung Schützenstube (optisch separiert)
    const vmMailCodes = ['vm_vertrag', 'vm_mahnung', 'vm_bestaetigung', 'vm_schluessel', 'vm_storno', 'vm_storno_verzug', 'vm_info_wirtschaft'];
    const row2Html = `
      <div class="p-2.5 rounded-3 border border-primary-subtle bg-primary-subtle bg-opacity-10 mb-3 shadow-2xs">
        <div class="d-flex align-items-center justify-content-between mb-2 flex-wrap gap-1">
          <span class="badge bg-primary text-white"><i class="fas fa-house-chimney me-1.5"></i>Fachbereich Vermietung Schützenstube</span>
          <small class="text-muted" style="font-size: 11px;">Mietvertrag & Benützungsreglement (PDF) sowie automatisierte Workflow-Mails</small>
        </div>
        <div class="d-flex gap-1.5 flex-wrap align-items-center">
          <!-- Mietvertrag & Reglement PDF -->
          <button class="btn btn-sm ${isMietvertragPdf ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-primary'}" onclick="docSelectCategory('vertrag')">
            <i class="fas fa-file-contract me-1.5"></i> Mietvertrag & Reglement (PDF)
          </button>
          
          <div class="vr mx-1 d-none d-md-block text-secondary" style="height: 24px;"></div>

          <!-- Die 7 Vermietungs-Mails -->
          <button class="btn btn-xs ${isVermietungMail && currentTemplate.code === 'vm_vertrag' ? 'btn-dark fw-bold shadow-sm' : 'btn-light border text-dark'}" onclick="docSelectVermietungMail('vm_vertrag')">
            <i class="fas fa-envelope text-info me-1"></i> Mail: Mietvertrag & QR
          </button>
          <button class="btn btn-xs ${isVermietungMail && currentTemplate.code === 'vm_mahnung' ? 'btn-dark fw-bold shadow-sm' : 'btn-light border text-dark'}" onclick="docSelectVermietungMail('vm_mahnung')">
            <i class="fas fa-envelope text-warning me-1"></i> Mail: Zahlungserinnerung
          </button>
          <button class="btn btn-xs ${isVermietungMail && currentTemplate.code === 'vm_bestaetigung' ? 'btn-dark fw-bold shadow-sm' : 'btn-light border text-dark'}" onclick="docSelectVermietungMail('vm_bestaetigung')">
            <i class="fas fa-envelope text-success me-1"></i> Mail: Zahlungseingang
          </button>
          <button class="btn btn-xs ${isVermietungMail && currentTemplate.code === 'vm_schluessel' ? 'btn-dark fw-bold shadow-sm' : 'btn-light border text-dark'}" onclick="docSelectVermietungMail('vm_schluessel')">
            <i class="fas fa-envelope text-primary me-1"></i> Mail: Schlüsselübergabe
          </button>
          <button class="btn btn-xs ${isVermietungMail && currentTemplate.code === 'vm_storno' ? 'btn-dark fw-bold shadow-sm' : 'btn-light border text-dark'}" onclick="docSelectVermietungMail('vm_storno')">
            <i class="fas fa-envelope text-danger me-1"></i> Mail: Storno allgemein
          </button>
          <button class="btn btn-xs ${isVermietungMail && currentTemplate.code === 'vm_storno_verzug' ? 'btn-dark fw-bold shadow-sm' : 'btn-light border text-dark'}" onclick="docSelectVermietungMail('vm_storno_verzug')">
            <i class="fas fa-ban text-danger me-1"></i> Mail: Storno Verzug
          </button>
          <button class="btn btn-xs ${isVermietungMail && currentTemplate.code === 'vm_info_wirtschaft' ? 'btn-dark fw-bold shadow-sm' : 'btn-light border text-dark'}" onclick="docSelectVermietungMail('vm_info_wirtschaft')">
            <i class="fas fa-bullhorn text-warning me-1"></i> Mail: Info Wirtschaft (Intern)
          </button>
        </div>
      </div>
    `;

    // HTML Sub-Tabs für Zeile 1 (falls mehrere Vorlagen in Kategorie)
    let subTabsHtml = '';
    if (!isVermietungMail && !isMietvertragPdf && templatesInCat.length > 1) {
      subTabsHtml = `
        <div class="d-flex gap-1.5 mb-3 flex-wrap bg-light p-2 rounded-3 border">
          <span class="text-muted small fw-bold me-2 align-self-center ps-1" style="font-size: 11px;">Vorlagen:</span>
          ${templatesInCat.map(t => `
            <button class="btn btn-xs ${window._selectedDocCode === t.code ? 'btn-dark fw-bold' : 'btn-light border text-dark'}" onclick="docSelectTemplate('${t.code}')">
              ${escapeHtml(window.getCleanDocTemplateTitle(t))}
            </button>
          `).join('')}
        </div>
      `;
    }

    // Dynamische Platzhalter je nach Dokumenten-Kategorie
    let categoryPlaceholders = [];
    if (isVermietungMail) {
      categoryPlaceholders = [
        '{mieter_anrede}', '{mieter_vorname}', '{mieter_nachname}', '{mieter_email}', '{mieter_telefon}', 
        '{mieter_strasse}', '{mieter_plz}', '{mieter_ort}', '{mieter_adresse}',
        '{vermieter_name}', '{vermieter_vorname}', '{vermieter_nachname}', '{vermieter_telefon}', '{vermieter_email}',
        '{wirtschaft_name}', '{wirtschaft_phone}', '{wirtschaft_email}',
        '{vertragsnr}', '{mietdatum}', '{festbeginn}', '{mietbetrag}', '{kaution}', '{bemerkung}', '{cockpit_url}', '{feedback_url}'
      ];
    } else if (currentCat === 'vertrag') {
      categoryPlaceholders = ['{mietdatum}', '{mietbetrag}', '{buchungsnummer}', '{vorname}', '{nachname}', '{strasse}', '{plz}', '{ort}'];
    } else if (currentCat === 'rechnung' || currentCat === 'mahnung') {
      categoryPlaceholders = [
        '{rechnungsnummer}', '{rechnungsjahr}', '{gesamtbetrag}', '{faelligkeitsdatum}',
        '{vorname}', '{nachname}', '{anrede}', '{strasse}', '{plz}', '{ort}',
        '{absender_vorname}', '{absender_nachname}', '{absender_funktion}', '{absender_email}', '{absender_mobil}'
      ];
    } else if (currentCat === 'gv') {
      categoryPlaceholders = ['{gv_nummer}', '{gv_datum}', '{gv_zeit}', '{praesident_name}', '{vorname}', '{nachname}'];
    } else if (currentCat === 'brief') {
      categoryPlaceholders = ['{betreff}', '{datum}', '{vorname}', '{nachname}', '{strasse}', '{plz}', '{ort}'];
    }

    const placeholdersHtml = categoryPlaceholders.map(ph => `
      <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('${ph}')">${ph}</button>
    `).join('');

    container.innerHTML = `
      <div class="card border border-light shadow-sm p-4 rounded-4 mb-4">
        <!-- Header & Toolbar -->
        <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
          <div>
            <h4 class="fw-bold text-primary mb-1"><i class="fas fa-file-lines me-2"></i>Dokumenten- & Vorlagen-Zentrale</h4>
            <p class="text-muted small mb-0">
              Zentrale Verwaltung aller Vorlagentexte, Klauseln, Benützungsreglemente und E-Mail-Begleittexte (Single Source of Truth).
            </p>
          </div>
          <div class="d-flex gap-2">
            ${isVermietungMail ? `
              <button class="btn btn-sm btn-outline-primary" onclick="docSendTestMail('${currentTemplate.code}')" title="Test-E-Mail an meine Adresse senden">
                <i class="fas fa-paper-plane me-1.5 text-primary"></i> Test-Mail an mich
              </button>
            ` : `
              <button class="btn btn-sm btn-outline-primary" onclick="docTestRenderPdf('${currentTemplate.id}')" title="Test-PDF via Edge Function erstellen">
                <i class="fas fa-file-pdf me-1.5 text-danger"></i> PDF-Vorschau generieren
              </button>
            `}
          </div>
        </div>

        <!-- ZEILE 1: Allgemeine Kategorien -->
        <div class="d-flex gap-2 mb-2 flex-wrap pb-2 border-bottom">
          ${row1TabsHtml}
        </div>

        <!-- ZEILE 2: Fachbereich Vermietung Schützenstube (farblich hervorgehoben) -->
        ${row2Html}

        <!-- Sub-Tabs für aktive Kategorie -->
        ${subTabsHtml}

        <!-- HAUPTBEREICH: 2-SPALTEN-LAYOUT -->
        <div class="row g-4">
          
          <!-- FALL A: VERMIETUNGS-MAILVORLAGE MIT LIVE-HTML-VORSCHAU -->
          ${isVermietungMail ? `
            <!-- Linke Spalte: E-Mail Editor -->
            <div class="col-lg-6">
              <form id="doc-template-form" onsubmit="docSaveTemplate(event, '${currentTemplate.id}')">
                
                <div class="bg-light p-3 rounded-3 mb-3 border shadow-sm">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <label class="form-label fw-bold small text-primary mb-0"><i class="fas fa-magic me-1"></i>Verfügbare Platzhalter (Klicken zum Einfügen)</label>
                    <small class="text-muted" style="font-size: 11px;">Wird an der Cursor-Position eingefügt</small>
                  </div>
                  <div class="d-flex gap-1 flex-wrap">
                    ${placeholdersHtml}
                  </div>
                </div>

                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">Vorlagenbezeichnung</label>
                  <input type="text" class="form-control fw-bold" id="doc-f-title" required value="${escapeHtml(currentTemplate.title || '')}" onfocus="window._docLastFocusedField = this">
                </div>

                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">E-Mail Betreffzeile</label>
                  <input type="text" class="form-control fw-bold text-primary" id="doc-f-mail-subj" required value="${escapeHtml(currentTemplate.mail_subject || '')}" oninput="docUpdateLiveMailPreview()" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">
                </div>

                <div class="mb-4">
                  <label class="form-label fw-bold small text-muted">E-Mail Nachrichtentext</label>
                  <textarea class="form-control font-monospace" id="doc-f-mail-body" rows="12" required oninput="docUpdateLiveMailPreview()" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">${escapeHtml(currentTemplate.mail_body || '')}</textarea>
                  <small class="text-muted mt-1 d-block" style="font-size: 11px;">Absätze mit doppelter Leerzeile trennen. Die Vorschau rechts aktualisiert sich automatisch beim Tippen.</small>
                </div>

                <div class="d-grid">
                  <button type="submit" class="btn btn-primary py-2.5 fw-bold rounded-3 shadow-sm write-protected" id="doc-submit-btn">
                    <i class="fas fa-save me-1.5"></i> E-Mail-Vorlage speichern
                  </button>
                </div>
              </form>
            </div>

            <!-- Rechte Spalte: Live-HTML-Vorschau der E-Mail -->
            <div class="col-lg-6">
              <div class="card border shadow-sm p-3 bg-light rounded-3 h-100">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <h6 class="fw-bold text-primary mb-0">
                    <i class="fas fa-eye me-1.5"></i>Live-Vorschau (Responsive E-Mail)
                  </h6>
                  <span class="badge bg-secondary" style="font-size: 10px;">Test-Datensatz aktiv</span>
                </div>
                <div id="doc-live-mail-preview-container" class="mt-2">
                  <!-- Wird dynamisch befüllt -->
                </div>
              </div>
            </div>
          ` : `
            <!-- FALL B: STANDARD DOKUMENTE & MIETVERTRAG PDF MIT KLAUSELN -->
            <!-- Linke Spalte: Textbausteine & Metadaten -->
            <div class="col-lg-7">
              <form id="doc-template-form" onsubmit="docSaveTemplate(event, '${currentTemplate.id}')">
                
                <div class="bg-light p-3 rounded-3 mb-4 border shadow-sm">
                  <div class="d-flex justify-content-between align-items-center mb-2">
                    <label class="form-label fw-bold small text-primary mb-0"><i class="fas fa-magic me-1"></i>Verfügbare Platzhalter (Klicken zum Einfügen)</label>
                    <small class="text-muted" style="font-size: 11px;">Wird an der Cursor-Position eingefügt</small>
                  </div>
                  <div class="d-flex gap-1 flex-wrap">
                    ${placeholdersHtml}
                  </div>
                </div>

                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">Dokumententitel / Betreffzeile (PDF)</label>
                  <input type="text" class="form-control fw-bold text-primary" id="doc-f-title" required value="${escapeHtml(currentTemplate.title || '')}" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">
                </div>

                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">Einleitungstext / Anschreiben</label>
                  <textarea class="form-control" id="doc-f-intro" rows="4" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">${escapeHtml(currentTemplate.intro || '')}</textarea>
                </div>

                <div class="mb-3">
                  <label class="form-label fw-bold small text-muted">Schlusstext & Grussformel</label>
                  <textarea class="form-control" id="doc-f-outro" rows="3" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">${escapeHtml(currentTemplate.outro || '')}</textarea>
                </div>

                <div class="row g-3 mb-3">
                  <div class="col-sm-8">
                    <label class="form-label fw-bold small text-muted">Fusszeilen-Hinweis / Rechtsbelehrung</label>
                    <input type="text" class="form-control" id="doc-f-notice" value="${escapeHtml(currentTemplate.notice || '')}" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">
                  </div>
                  <div class="col-sm-4">
                    <label class="form-label fw-bold small text-muted">Zahlungsfrist (Tage)</label>
                    <input type="number" class="form-control text-end" id="doc-f-duedays" value="${currentTemplate.due_days || 30}">
                  </div>
                </div>

                ${!isMietvertragPdf ? `
                  <div class="p-3 bg-light rounded-3 border mb-4">
                    <h6 class="fw-bold text-primary mb-2"><i class="fas fa-envelope me-1.5"></i>E-Mail Begleittext (bei Rechnungsversand)</h6>
                    <div class="mb-2">
                      <label class="form-label small text-muted mb-1">E-Mail Betreff</label>
                      <input type="text" class="form-control form-control-sm fw-semibold" id="doc-f-mail-subj" value="${escapeHtml(currentTemplate.mail_subject || '')}" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">
                    </div>
                    <div>
                      <label class="form-label small text-muted mb-1">E-Mail Nachrichtentext</label>
                      <textarea class="form-control form-control-sm font-monospace" id="doc-f-mail-body" rows="4" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">${escapeHtml(currentTemplate.mail_body || '')}</textarea>
                    </div>
                  </div>
                ` : ''}

                <div class="d-grid">
                  <button type="submit" class="btn btn-primary py-2.5 fw-bold rounded-3 shadow-sm write-protected" id="doc-submit-btn">
                    <i class="fas fa-save me-1.5"></i> Vorlage speichern
                  </button>
                </div>
              </form>
            </div>

            <!-- Rechte Spalte: Klausel-Editor (Scrollable ohne overflow-hidden Bug) -->
            <div class="col-lg-5">
              <div class="card border shadow-sm p-3 bg-white rounded-3">
                <div class="d-flex justify-content-between align-items-center mb-3">
                  <div>
                    <h6 class="fw-bold text-primary mb-0">
                      <i class="fas fa-list-ol me-1.5"></i>${isMietvertragPdf ? 'Benützungsordnung & Klauseln (1–8)' : 'Klauseln & Reglement'}
                    </h6>
                    <small class="text-muted" style="font-size: 11px;">Fliessender Mehrseiten-Vertrag</small>
                  </div>
                  <button class="btn btn-xs btn-success fw-bold write-protected" onclick="docOpenClauseModal('${currentTemplate.id}', null)">
                    <i class="fas fa-plus me-1"></i> Klausel hinzufügen
                  </button>
                </div>

                ${clausesForTemplate.length === 0 ? `
                  <div class="text-center py-4 text-muted small bg-light rounded-3 p-3">
                    <i class="fas fa-info-circle me-1"></i>Für dieses Dokument sind keine separaten Klauseln hinterlegt (z.B. bei Standard-Rechnungen).
                  </div>
                ` : `
                  <!-- Scrollbar ohne overflow-hidden !important Bug -->
                  <div class="list-group list-group-flush border rounded-3" style="max-height: 560px; overflow-y: auto;">
                    ${clausesForTemplate.map((c, idx) => `
                      <div class="list-group-item p-3 border-bottom">
                        <div class="d-flex justify-content-between align-items-start mb-1">
                          <strong class="text-dark small">${escapeHtml(c.clause_number ? c.clause_number + '. ' : '')}${escapeHtml(c.clause_title)}</strong>
                          <div class="btn-group btn-group-xs">
                            <button class="btn btn-outline-secondary btn-xs py-0 px-1" onclick="docMoveClause('${c.id}', -1)" title="Nach oben" ${idx === 0 ? 'disabled' : ''}>
                              <i class="fas fa-chevron-up"></i>
                            </button>
                            <button class="btn btn-outline-secondary btn-xs py-0 px-1" onclick="docMoveClause('${c.id}', 1)" title="Nach unten" ${idx === clausesForTemplate.length - 1 ? 'disabled' : ''}>
                              <i class="fas fa-chevron-down"></i>
                            </button>
                            <button class="btn btn-outline-warning btn-xs py-0 px-1.5" onclick="docOpenClauseModal('${currentTemplate.id}', '${c.id}')" title="Bearbeiten">
                              <i class="fas fa-edit"></i>
                            </button>
                            <button class="btn btn-outline-danger btn-xs py-0 px-1.5" onclick="docDeleteClause('${c.id}')" title="Löschen">
                              <i class="fas fa-trash-alt"></i>
                            </button>
                          </div>
                        </div>
                        <p class="text-muted mb-0 small" style="font-size: 11px; white-space: pre-line; line-height: 1.4;">${escapeHtml(c.clause_text)}</p>
                      </div>
                    `).join('')}
                  </div>
                `}
              </div>
            </div>
          `}
        </div>
      </div>
    `;

    // Falls Vermietungs-Mail aktiv, sofort Live-Vorschau rendern
    if (isVermietungMail) {
      window.docUpdateLiveMailPreview();
    }
  };

  // 3. NAVIGATION & INTERAKTIONEN
  window.docSelectCategory = function(cat) {
    window._selectedDocCategory = cat;
    const container = document.getElementById('dokument-vorlagen-container');
    if (container) window.renderDokumentVorlagen(container);
  };

  window.docSelectTemplate = function(code) {
    window._selectedDocCode = code;
    const container = document.getElementById('dokument-vorlagen-container');
    if (container) window.renderDokumentVorlagen(container);
  };

  window.docSelectVermietungMail = function(code) {
    window._selectedDocCategory = 'vermietung_mail';
    window._selectedDocCode = code;
    const container = document.getElementById('dokument-vorlagen-container');
    if (container) window.renderDokumentVorlagen(container);
  };

  // 4. LIVE-HTML-VORSCHAU FÜR E-MAILS
  window.docUpdateLiveMailPreview = function() {
    const previewContainer = document.getElementById('doc-live-mail-preview-container');
    if (!previewContainer) return;

    const subj = document.getElementById('doc-f-mail-subj')?.value || '';
    const body = document.getElementById('doc-f-mail-body')?.value || '';
    const code = window._selectedDocCode || 'vm_vertrag';

    previewContainer.innerHTML = buildRentalEmailPreviewHtml(subj, body, code);
  };

  function buildRentalEmailPreviewHtml(subject, bodyText, templateCode) {
    const sample = {
      mieter_anrede: 'Frau',
      mieter_vorname: 'Daniela',
      mieter_nachname: 'Hunziker',
      mieter_email: 'daniela.hunziker@beispiel.ch',
      mieter_telefon: '079 123 45 67',
      mieter_strasse: 'Rebweg 12',
      mieter_plz: '8181',
      mieter_ort: 'Höri',
      mieter_adresse: 'Rebweg 12, 8181 Höri',
      vorname: 'Daniela',
      nachname: 'Hunziker',
      anrede: 'Frau',
      vermieter_vorname: 'Daniel',
      vermieter_nachname: 'Hunziker',
      vermieter_name: 'Daniel Hunziker',
      vermieter_telefon: '+41 79 123 45 67',
      vermieter_email: 'sportschuetzen.muhen@gmail.com',
      mietdatum: '15. August 2026',
      festbeginn: '13:00 Uhr',
      vertragsnr: 'V-2026-0102',
      buchungsnummer: 'V-2026-0102',
      mietbetrag: '300.00',
      kaution: '200.00',
      bemerkung: 'Geburtstagsfest mit ca. 30 Gästen',
      wirtschaft_name: 'Wirtschaftsteam (Uschi Künzli)',
      wirtschaft_phone: '079 888 50 37',
      wirtschaft_email: 'wirtschaft@sportschuetzen-muhen.ch',
      feedback_url: 'https://sportschuetzen-muhen.ch/storno_feedback.html?vnr=V-2026-0102',
      cockpit_url: 'https://sportschuetzen-muhen.ch/vorstand/#vermietung',
      club_email: 'sportschuetzen.muhen@gmail.com'
    };

    let bannerColor = '#0f3c5c';
    if (templateCode === 'vm_mahnung') bannerColor = '#c53030';
    else if (templateCode === 'vm_bestaetigung') bannerColor = '#22543d';
    else if (templateCode === 'vm_schluessel') bannerColor = '#2b6cb0';
    else if (templateCode === 'vm_storno') bannerColor = '#742a2a';
    else if (templateCode === 'vm_storno_verzug') bannerColor = '#7f1d1d';
    else if (templateCode === 'vm_info_wirtschaft') bannerColor = '#d97706';

    let renderedSubject = subject || '';
    let renderedBody = bodyText || '';

    Object.entries(sample).forEach(([k, v]) => {
      const rx = new RegExp(`\\{${k}\\}`, 'gi');
      renderedSubject = renderedSubject.replace(rx, v);
      renderedBody = renderedBody.replace(rx, v);
    });

    const paragraphs = renderedBody.split('\n\n').map(p => 
      `<p style="margin:0 0 12px 0; line-height: 1.55;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`
    ).join('');

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 100%; border: 1px solid #cbd5e1; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); background:#ffffff;">
        <!-- Header Banner -->
        <div style="background-color: ${bannerColor}; color: #ffffff; padding: 18px 20px; text-align: center;">
          <h4 style="margin: 0 0 3px 0; font-size: 17px; font-weight: 700; color: #ffffff; letter-spacing: 0.5px;">SPORTSCHÜTZEN MUHEN</h4>
          <p style="margin: 0; font-size: 11.5px; opacity: 0.9; color: #e2e8f0;">Schiessanlage Rüteli · Vermietung Schützenstube</p>
        </div>

        <!-- Betreffzeile -->
        <div style="background: #f8fafc; padding: 10px 18px; border-bottom: 1px solid #e2e8f0; font-size: 12.5px; color: #334155;">
          <strong>Betreff:</strong> <span class="text-primary fw-bold">${escapeHtml(renderedSubject)}</span>
        </div>

        <!-- Body Content -->
        <div style="padding: 20px 22px; color: #1e293b; font-size: 13.5px;">
          ${paragraphs}
        </div>

        <!-- Club Footer -->
        <div style="background-color: #f1f5f9; padding: 12px 18px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 11px; color: #64748b; line-height: 1.5;">
          <strong>Sportschützen Muhen</strong> (gegründet 1919) · Schiessanlage Rüteli, 5037 Muhen<br>
          Web: <a href="https://sportschuetzen-muhen.ch" target="_blank" style="color: #0284c7; text-decoration: none;">www.sportschuetzen-muhen.ch</a> · E-Mail: <a href="mailto:sportschuetzen.muhen@gmail.com" style="color: #0284c7; text-decoration: none;">sportschuetzen.muhen@gmail.com</a>
        </div>
      </div>
    `;
  }

  window.docInsertShortcode = function(code) {
    let activeEl = window._docLastFocusedField || document.activeElement;
    if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') || !document.getElementById('doc-template-form')?.contains(activeEl)) {
      activeEl = document.getElementById('doc-f-mail-body') || document.getElementById('doc-f-intro');
    }
    if (activeEl) {
      const start = activeEl.selectionStart !== undefined ? activeEl.selectionStart : activeEl.value.length;
      const end = activeEl.selectionEnd !== undefined ? activeEl.selectionEnd : activeEl.value.length;
      const val = activeEl.value || '';
      activeEl.value = val.substring(0, start) + code + val.substring(end);
      activeEl.focus();
      activeEl.selectionStart = activeEl.selectionEnd = start + code.length;
      window._docLastFocusedField = activeEl;
      if (typeof window.docUpdateLiveMailPreview === 'function') {
        window.docUpdateLiveMailPreview();
      }
    }
  };

  // 5. SPEICHERN EINER VORLAGE
  window.docSaveTemplate = async function(event, templateId) {
    event.preventDefault();
    const submitBtn = document.getElementById('doc-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere...';
    }

    const titleEl = document.getElementById('doc-f-title');
    const introEl = document.getElementById('doc-f-intro');
    const outroEl = document.getElementById('doc-f-outro');
    const noticeEl = document.getElementById('doc-f-notice');
    const dueDaysEl = document.getElementById('doc-f-duedays');
    const mailSubjEl = document.getElementById('doc-f-mail-subj');
    const mailBodyEl = document.getElementById('doc-f-mail-body');

    const updateData = { updated_at: new Date().toISOString() };
    if (titleEl) updateData.title = titleEl.value.trim();
    if (introEl) updateData.intro = introEl.value.trim();
    if (outroEl) updateData.outro = outroEl.value.trim();
    if (noticeEl) updateData.notice = noticeEl.value.trim();
    if (dueDaysEl) updateData.due_days = parseInt(dueDaysEl.value) || 0;
    if (mailSubjEl) updateData.mail_subject = mailSubjEl.value.trim();
    if (mailBodyEl) updateData.mail_body = mailBodyEl.value.trim();

    const sb = getDocSupabaseClient();
    if (sb) {
      try {
        const { error } = await sb.from('document_templates').update(updateData).eq('id', templateId);

        if (error) throw error;
        showSuccess("🎉 Vorlage erfolgreich gespeichert!");
        await window.loadDocumentTemplatesData();
        const container = document.getElementById('dokument-vorlagen-container');
        if (container) window.renderDokumentVorlagen(container);
      } catch (err) {
        console.error("❌ Speicherfehler:", err);
        showError("Fehler beim Speichern der Vorlage: " + (err.message || err));
      } finally {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerHTML = '<i class="fas fa-save me-1.5"></i> Vorlage speichern';
        }
      }
    }
  };

  // 6. TEST-MAIL VERSENDEN
  window.docSendTestMail = async function(templateCode) {
    const userEmail = (window.currentUser && (window.currentUser.email || window.currentUser.mail)) || 'sportschuetzen.muhen@gmail.com';
    if (!confirm(`Test-E-Mail für '${templateCode}' an ${userEmail} senden?`)) return;

    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay(`Sende Test-Mail an ${userEmail}...`);
    }

    try {
      const subj = document.getElementById('doc-f-mail-subj')?.value || 'Test E-Mail';
      const body = document.getElementById('doc-f-mail-body')?.value || 'Test Inhalt';
      const fullHtml = buildRentalEmailPreviewHtml(subj, body, templateCode);

      if (typeof window.sendMailViaEngine === 'function') {
        const res = await window.sendMailViaEngine({
          to: userEmail,
          subject: `[TEST] ${subj}`,
          html: fullHtml,
          module: 'vermietung_test',
          referenceId: `TEST-${templateCode}`
        });

        if (res.success) {
          showSuccess(`🎉 Test-E-Mail erfolgreich an ${userEmail} gesendet!`);
        } else {
          showError("Fehler beim Versand der Test-Mail: " + (res.error || 'Unbekannter Fehler'));
        }
      } else {
        showError("Mail-Engine nicht verfügbar.");
      }
    } catch (e) {
      showError("Fehler bei Test-Mail: " + e.message);
    } finally {
      if (typeof hideLoadingOverlay === 'function') {
        hideLoadingOverlay();
      }
    }
  };

  // 7. KLAUSEL HINZUFÜGEN / BEARBEITEN
  window.docOpenClauseModal = function(templateId, clauseId) {
    let modalEl = document.getElementById('docClauseModal');
    if (!modalEl) {
      modalEl = document.createElement('div');
      modalEl.id = 'docClauseModal';
      modalEl.className = 'modal fade';
      modalEl.tabIndex = -1;
      document.body.appendChild(modalEl);
    }

    const isNew = !clauseId;
    const clause = isNew ? { clause_number: '', clause_title: '', clause_text: '' } : (window._docClausesData.find(c => c.id === clauseId) || {});

    modalEl.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content border-0 rounded-4 shadow">
          <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
            <h5 class="modal-title fw-bold"><i class="fas fa-list-ol me-2"></i>${isNew ? 'Klausel / Paragraph hinzufügen' : 'Klausel bearbeiten'}</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body p-4">
            <form onsubmit="docSaveClause(event, '${templateId}', ${isNew ? 'null' : `'${clauseId}'`})">
              <div class="row g-2 mb-3">
                <div class="col-4">
                  <label class="form-label fw-bold small text-muted">Nummer (Ziffer)</label>
                  <input type="text" class="form-control" id="cl-f-num" value="${escapeHtml(clause.clause_number || '')}" placeholder="z.B. 1">
                </div>
                <div class="col-8">
                  <label class="form-label fw-bold small text-muted">Titel der Klausel</label>
                  <input type="text" class="form-control fw-bold" id="cl-f-title" required value="${escapeHtml(clause.clause_title || '')}" placeholder="z.B. Zweckbestimmung">
                </div>
              </div>
              <div class="mb-4">
                <label class="form-label fw-bold small text-muted">Reglementstext</label>
                <textarea class="form-control" id="cl-f-text" rows="6" required placeholder="Text des Paragraphen...">${escapeHtml(clause.clause_text || '')}</textarea>
              </div>
              <div class="d-grid">
                <button type="submit" class="btn btn-primary py-2.5 fw-bold rounded-3 shadow-sm">
                  <i class="fas fa-save me-1"></i> Speichern
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    `;

    const bsModal = new bootstrap.Modal(modalEl);
    bsModal.show();
  };

  window.docSaveClause = async function(event, templateId, clauseId) {
    event.preventDefault();
    const clause_number = document.getElementById('cl-f-num').value.trim();
    const clause_title = document.getElementById('cl-f-title').value.trim();
    const clause_text = document.getElementById('cl-f-text').value.trim();

    const sb = getDocSupabaseClient();
    if (!sb) return;

    try {
      if (!clauseId) {
        const existing = window._docClausesData.filter(c => c.template_id === templateId);
        const maxSort = existing.reduce((max, c) => Math.max(max, c.sort_order || 0), 0);
        await sb.from('document_template_clauses').insert({
          template_id: templateId,
          clause_number, clause_title, clause_text,
          sort_order: maxSort + 1,
          is_mandatory: true
        });
      } else {
        await sb.from('document_template_clauses').update({
          clause_number, clause_title, clause_text,
          updated_at: new Date().toISOString()
        }).eq('id', clauseId);
      }

      showSuccess("🎉 Klausel erfolgreich gespeichert!");
      const modalEl = document.getElementById('docClauseModal');
      const bsModal = bootstrap.Modal.getInstance(modalEl);
      if (bsModal) bsModal.hide();

      await window.loadDocumentTemplatesData();
      const container = document.getElementById('dokument-vorlagen-container');
      if (container) window.renderDokumentVorlagen(container);
    } catch (err) {
      showError("Fehler beim Speichern der Klausel: " + (err.message || err));
    }
  };

  window.docDeleteClause = async function(clauseId) {
    if (!confirm("⚠️ Möchten Sie diese Klausel wirklich unwiderruflich löschen?")) return;
    const sb = getDocSupabaseClient();
    if (!sb) return;

    try {
      await sb.from('document_template_clauses').delete().eq('id', clauseId);
      showSuccess("🗑️ Klausel gelöscht.");
      await window.loadDocumentTemplatesData();
      const container = document.getElementById('dokument-vorlagen-container');
      if (container) window.renderDokumentVorlagen(container);
    } catch (err) {
      showError("Fehler beim Löschen: " + (err.message || err));
    }
  };

  window.docMoveClause = async function(clauseId, direction) {
    const clause = window._docClausesData.find(c => c.id === clauseId);
    if (!clause) return;

    const list = window._docClausesData.filter(c => c.template_id === clause.template_id).sort((a, b) => a.sort_order - b.sort_order);
    const idx = list.findIndex(c => c.id === clauseId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= list.length) return;

    const targetClause = list[targetIdx];
    const sb = getDocSupabaseClient();
    if (!sb) return;

    try {
      const tempSort = clause.sort_order;
      clause.sort_order = targetClause.sort_order;
      targetClause.sort_order = tempSort;

      await Promise.all([
        sb.from('document_template_clauses').update({ sort_order: clause.sort_order }).eq('id', clause.id),
        sb.from('document_template_clauses').update({ sort_order: targetClause.sort_order }).eq('id', targetClause.id)
      ]);

      await window.loadDocumentTemplatesData();
      const container = document.getElementById('dokument-vorlagen-container');
      if (container) window.renderDokumentVorlagen(container);
    } catch (err) {
      console.error("Verschiebe-Fehler:", err);
    }
  };

  // 8. SERVERSEITIGES TEST-RENDERING VIA EDGE FUNCTION
  window.docTestRenderPdf = async function(templateId) {
    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay("Erzeuge Test-PDF via Edge Function...");
    }

    try {
      const t = window._docTemplatesData.find(x => x.id === templateId);
      if (!t) throw new Error("Vorlage nicht gefunden.");

      const formTitle = document.getElementById('doc-f-title')?.value.trim() || t.title;
      const formIntro = document.getElementById('doc-f-intro')?.value.trim() || t.intro;
      const formOutro = document.getElementById('doc-f-outro')?.value.trim() || t.outro;
      const formNotice = document.getElementById('doc-f-notice')?.value.trim() || t.notice;

      const testRecipient = {
        anrede: 'Herr',
        salutation: 'Herr',
        vorname: 'Max',
        firstName: 'Max',
        nachname: 'Muster',
        lastName: 'Muster',
        name: 'Max Muster',
        strasse: 'Hauptstrasse 42',
        street: 'Hauptstrasse 42',
        plz: '5037',
        zip: '5037',
        ort: 'Muhen',
        city: 'Muhen',
        email: 'max.muster@example.ch'
      };

      const testId = `TEST-PREVIEW-${Date.now().toString().slice(-6)}`;
      let payload = {
        forceRecreate: true,
        saveToStorage: false,
        templateId: t.id,
        layout: {
          title: formTitle,
          intro: formIntro,
          outro: formOutro,
          notice: formNotice
        }
      };

      if (t.category === 'vertrag') {
        payload = {
          ...payload,
          action: 'generate-contract',
          bookingId: testId,
          recipient: testRecipient,
          mietdatum: '15.08.2026',
          festbeginn: '14:00 Uhr',
          mietbetrag: 300,
          kaution: 200
        };
      } else if (t.category === 'gv') {
        payload = {
          ...payload,
          action: 'generate-gv-invitation',
          templateId: t.id,
          year: new Date().getFullYear(),
          gvData: { templateId: t.id, templateCode: t.code, gvNummer: 100, datum: '20.03.2026', zeit: '19:30' }
        };
      } else if (t.category === 'brief') {
        payload = {
          ...payload,
          action: 'generate-letter',
          letterId: testId,
          recipient: testRecipient,
          subject: formTitle || 'Wichtige Mitteilung des Vorstands',
          bodyText: formIntro || 'Wir freuen uns, Ihnen mitteilen zu können, dass die Vorbereitungen für die kommende Saison planmässig verlaufen.',
          signers: [
            { name: 'Andrea Rossi', role: 'Präsident' },
            { name: 'Daniel Humbel', role: 'Aktuar' }
          ],
          letterDate: new Date().toLocaleDateString('de-CH', { day: 'numeric', month: 'long', year: 'numeric' })
        };
      } else if (t.category === 'sonstige' || t.code?.includes('endschiessen') || t.category === 'endschiessen') {
        payload = {
          ...payload,
          action: 'generate-endschiessen',
          year: new Date().getFullYear(),
          endschiessenData: {
            title: formTitle || 'Endschiessen & Absenden',
            intro: formIntro || undefined,
            subtitle: 'Offizieller Festführer, Schiessplan & Menü-Einladung'
          }
        };
      } else {
        payload = {
          ...payload,
          action: 'generate-invoice',
          invoiceId: testId,
          recipient: testRecipient,
          type: t.code,
          totalAmount: 150.00,
          year: new Date().getFullYear(),
          positions: [
            { position_nr: 1, description: formTitle || t.title || 'Muster-Leistung', quantity: 1, unit_price: 150.00, amount: 150.00 }
          ]
        };
      }

      if (typeof window.generatePdfViaEngine === 'function') {
        const res = await window.generatePdfViaEngine(payload);
        if (res && res.success && res.pdfUrl) {
          const urlToOpen = res.pdfUrl.includes('?') ? `${res.pdfUrl}&t=${Date.now()}` : `${res.pdfUrl}?t=${Date.now()}`;
          window.open(urlToOpen, '_blank');
        } else if (res && res.success && res.pdfBase64 && typeof openPdfBase64 === 'function') {
          openPdfBase64(res.pdfBase64);
        } else {
          showError("PDF-Generierung fehlgeschlagen: " + (res?.error || 'Unbekannter Fehler'));
        }
      } else {
        showError("PDF-Engine nicht verfügbar.");
      }
    } catch (e) {
      showError("Fehler bei Testvorschau: " + e.message);
    } finally {
      if (typeof hideLoadingOverlay === 'function') {
        hideLoadingOverlay();
      }
    }
  };

})();
