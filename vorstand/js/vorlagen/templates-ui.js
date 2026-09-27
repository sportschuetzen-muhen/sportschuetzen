// =====================================================================
// MODUL: DOKUMENTEN- & VORLAGEN-POOL (PHASE 12)
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
      });
      console.log(`✅ [Vorlagen-Pool] ${window._docTemplatesData.length} Vorlagen & ${window._docClausesData.length} Klauseln geladen.`);
    } catch (err) {
      console.error("❌ [Vorlagen-Pool] Fehler beim Laden:", err);
    }
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

    const categories = [
      { key: 'rechnung', label: 'Rechnungen', icon: 'fa-file-invoice-dollar' },
      { key: 'mahnung', label: 'Mahnwesen', icon: 'fa-bell text-warning' },
      { key: 'vertrag', label: 'Mietvertrag Rüteli', icon: 'fa-file-contract text-primary' },
      { key: 'gv', label: 'Generalversammlung', icon: 'fa-users-between-lines text-success' },
      { key: 'brief', label: 'Mitteilungen & Briefe', icon: 'fa-envelope-open-text text-info' }
    ];

    const currentCat = window._selectedDocCategory || 'rechnung';
    const templatesInCat = window._docTemplatesData.filter(t => t.category === currentCat);

    // Falls aktuelle Vorlage nicht in Kategorie, erste wählen
    if (!templatesInCat.find(t => t.code === window._selectedDocCode)) {
      window._selectedDocCode = templatesInCat[0]?.code || '';
    }

    const currentTemplate = window._docTemplatesData.find(t => t.code === window._selectedDocCode) || templatesInCat[0] || {};
    const clausesForTemplate = window._docClausesData.filter(c => c.template_id === currentTemplate.id);

    // HTML Kategorie-Tabs
    const catTabsHtml = categories.map(c => `
      <button class="btn btn-sm ${currentCat === c.key ? 'btn-primary fw-bold shadow-sm' : 'btn-outline-secondary'}" onclick="docSelectCategory('${c.key}')">
        <i class="fas ${c.icon} me-1.5"></i> ${c.label}
      </button>
    `).join('');

    // HTML Sub-Tabs (Vorlagen innerhalb der Kategorie)
    const subTabsHtml = templatesInCat.map(t => `
      <button class="btn btn-xs ${window._selectedDocCode === t.code ? 'btn-dark fw-bold' : 'btn-light border text-dark'}" onclick="docSelectTemplate('${t.code}')">
        ${escapeHtml(t.title?.split('–')[0]?.trim() || t.code)}
      </button>
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
            <button class="btn btn-sm btn-outline-primary" onclick="docTestRenderPdf('${currentTemplate.id}')" title="Test-PDF via Edge Function erstellen">
              <i class="fas fa-file-pdf me-1.5 text-danger"></i> PDF-Vorschau generieren
            </button>
          </div>
        </div>

        <!-- Hauptkategorien -->
        <div class="d-flex gap-2 mb-3 flex-wrap pb-2 border-bottom">
          ${catTabsHtml}
        </div>

        <!-- Unterauswahl (falls mehrere Vorlagen in Kategorie) -->
        ${templatesInCat.length > 1 ? `
          <div class="d-flex gap-1.5 mb-4 flex-wrap bg-light p-2 rounded-3 border">
            <span class="text-muted small fw-bold me-2 align-self-center ps-1" style="font-size: 11px;">Vorlagen:</span>
            ${subTabsHtml}
          </div>
        ` : ''}

        <div class="row g-4">
          <!-- Linke Spalte: Formular für Textbausteine & Metadaten -->
          <div class="col-lg-7">
            <form id="doc-template-form" onsubmit="docSaveTemplate(event, '${currentTemplate.id}')">
              
              <!-- Shortcodes Helper Bar -->
              <div class="bg-light p-3 rounded-3 mb-4 border shadow-sm">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <label class="form-label fw-bold small text-primary mb-0"><i class="fas fa-magic me-1"></i>Verfügbare Platzhalter (Klicken zum Einfügen)</label>
                  <small class="text-muted" style="font-size: 11px;">Wird an der Cursor-Position eingefügt</small>
                </div>
                
                <div class="d-flex gap-1 flex-wrap">
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{vorname}')">{vorname}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{nachname}')">{nachname}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{rechnungsnummer}')">{rechnungsnummer}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{rechnungsjahr}')">{rechnungsjahr}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{gesamtbetrag}')">{gesamtbetrag}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{mietdatum}')">{mietdatum}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{mietbetrag}')">{mietbetrag}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{gv_nummer}')">{gv_nummer}</button>
                  <button type="button" class="btn btn-xs btn-white border shadow-xs" onmousedown="event.preventDefault()" onclick="docInsertShortcode('{gv_datum}')">{gv_datum}</button>
                </div>
              </div>

              <!-- Titel / Betreff -->
              <div class="mb-3">
                <label class="form-label fw-bold small text-muted">Dokumententitel / Betreffzeile (PDF)</label>
                <input type="text" class="form-control fw-bold text-primary" id="doc-f-title" required value="${escapeHtml(currentTemplate.title || '')}" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">
              </div>

              <!-- Einleitungstext -->
              <div class="mb-3">
                <label class="form-label fw-bold small text-muted">Einleitungstext / Anschreiben</label>
                <textarea class="form-control" id="doc-f-intro" rows="4" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">${escapeHtml(currentTemplate.intro || '')}</textarea>
              </div>

              <!-- Schlusstext -->
              <div class="mb-3">
                <label class="form-label fw-bold small text-muted">Schlusstext & Grussformel</label>
                <textarea class="form-control" id="doc-f-outro" rows="3" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">${escapeHtml(currentTemplate.outro || '')}</textarea>
              </div>

              <!-- Zahlungsziel & Hinweise -->
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

              <!-- E-Mail Versand-Texte -->
              <div class="p-3 bg-light rounded-3 border mb-4">
                <h6 class="fw-bold text-primary mb-2"><i class="fas fa-envelope me-1.5"></i>E-Mail Begleittext</h6>
                <div class="mb-2">
                  <label class="form-label small text-muted mb-1">E-Mail Betreff</label>
                  <input type="text" class="form-control form-control-sm fw-semibold" id="doc-f-mail-subj" value="${escapeHtml(currentTemplate.mail_subject || '')}" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">
                </div>
                <div>
                  <label class="form-label small text-muted mb-1">E-Mail Nachrichtentext</label>
                  <textarea class="form-control form-control-sm font-monospace" id="doc-f-mail-body" rows="4" onfocus="window._docLastFocusedField = this" onclick="window._docLastFocusedField = this">${escapeHtml(currentTemplate.mail_body || '')}</textarea>
                </div>
              </div>

              <div class="d-grid">
                <button type="submit" class="btn btn-primary py-2.5 fw-bold rounded-3 shadow-sm write-protected" id="doc-submit-btn">
                  <i class="fas fa-save me-1.5"></i> Vorlage speichern
                </button>
              </div>
            </form>
          </div>

          <!-- Rechte Spalte: Klausel-Editor (für Verträge, GV-Traktanden & Reglemente) -->
          <div class="col-lg-5">
            <div class="card border shadow-sm p-3 bg-white rounded-3">
              <div class="d-flex justify-content-between align-items-center mb-3">
                <h6 class="fw-bold text-primary mb-0">
                  <i class="fas fa-list-ol me-1.5"></i>Klauseln & Reglement
                </h6>
                <button class="btn btn-xs btn-success fw-bold write-protected" onclick="docOpenClauseModal('${currentTemplate.id}', null)">
                  <i class="fas fa-plus me-1"></i> Klausel hinzufügen
                </button>
              </div>

              ${clausesForTemplate.length === 0 ? `
                <div class="text-center py-4 text-muted small bg-light rounded-3 p-3">
                  <i class="fas fa-info-circle me-1"></i>Für dieses Dokument sind keine separaten Klauseln hinterlegt (z.B. bei Standard-Rechnungen).
                </div>
              ` : `
                <div class="list-group list-group-flush border rounded-3 overflow-hidden" style="max-height: 520px; overflow-y: auto;">
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
        </div>
      </div>
    `;
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

  window.docInsertShortcode = function(code) {
    let activeEl = window._docLastFocusedField || document.activeElement;
    if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA') || !document.getElementById('doc-template-form')?.contains(activeEl)) {
      activeEl = document.getElementById('doc-f-intro');
    }
    if (activeEl) {
      const start = activeEl.selectionStart !== undefined ? activeEl.selectionStart : activeEl.value.length;
      const end = activeEl.selectionEnd !== undefined ? activeEl.selectionEnd : activeEl.value.length;
      const val = activeEl.value || '';
      activeEl.value = val.substring(0, start) + code + val.substring(end);
      activeEl.focus();
      activeEl.selectionStart = activeEl.selectionEnd = start + code.length;
      window._docLastFocusedField = activeEl;
    }
  };

  // 4. SPEICHERN EINER VORLAGE
  window.docSaveTemplate = async function(event, templateId) {
    event.preventDefault();
    const submitBtn = document.getElementById('doc-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere...';
    }

    const title = document.getElementById('doc-f-title').value.trim();
    const intro = document.getElementById('doc-f-intro').value.trim();
    const outro = document.getElementById('doc-f-outro').value.trim();
    const notice = document.getElementById('doc-f-notice').value.trim();
    const due_days = parseInt(document.getElementById('doc-f-duedays').value) || 30;
    const mail_subject = document.getElementById('doc-f-mail-subj').value.trim();
    const mail_body = document.getElementById('doc-f-mail-body').value.trim();

    const sb = getDocSupabaseClient();
    if (sb) {
      try {
        const { error } = await sb.from('document_templates').update({
          title, intro, outro, notice, due_days, mail_subject, mail_body,
          updated_at: new Date().toISOString()
        }).eq('id', templateId);

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

  // 5. KLAUSEL HINZUFÜGEN / BEARBEITEN
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
                <textarea class="form-control" id="cl-f-text" rows="5" required placeholder="Text des Paragraphen...">${escapeHtml(clause.clause_text || '')}</textarea>
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

  // 6. SERVERSEITIGES TEST-RENDERING VIA EDGE FUNCTION
  window.docTestRenderPdf = async function(templateId) {
    if (typeof showLoadingOverlay === 'function') {
      showLoadingOverlay("Erzeuge Test-PDF via Edge Function...");
    }

    try {
      const t = window._docTemplatesData.find(x => x.id === templateId);
      if (!t) throw new Error("Vorlage nicht gefunden.");

      let payload = {};
      if (t.category === 'vertrag') {
        payload = {
          action: 'generate-contract',
          bookingId: 'TEST-MIETE-2026',
          recipient: { name: 'Muster Mieter', strasse: 'Musterweg 1', plz: '5037', ort: 'Muhen', email: 'mieter@example.com' },
          mietdatum: '15.08.2026',
          festbeginn: '14:00 Uhr',
          mietbetrag: 300,
          kaution: 200
        };
      } else if (t.category === 'gv') {
        payload = {
          action: 'generate-gv-invitation',
          year: new Date().getFullYear(),
          gvData: { gvNummer: 100, datum: '20.03.2026', zeit: '19:30' }
        };
      } else {
        payload = {
          action: 'generate-invoice',
          invoiceId: 'RE-TEST-0001',
          recipient: { name: 'Max Muster', strasse: 'Hauptstrasse 42', plz: '5037', ort: 'Muhen' },
          type: t.code,
          totalAmount: 150.00,
          year: new Date().getFullYear(),
          positions: [
            { position_nr: 1, description: t.title || 'Muster-Leistung', quantity: 1, unit_price: 150.00, amount: 150.00 }
          ]
        };
      }

      if (typeof window.generatePdfViaEngine === 'function') {
        const res = await window.generatePdfViaEngine(payload);
        if (res && res.success && res.pdfUrl) {
          window.open(res.pdfUrl, '_blank');
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
