// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - TEMPLATES (VORLAGEN)
// =====================================================================

window.renderTabTemplates = function(content) {
  let templates = window._invoiceTemplates;
  if (!templates || templates.length === 0) {
    rnInitializeTemplates();
    templates = JSON.parse(localStorage.getItem('portal_invoice_templates') || '[]');
  }
  
  let rowsHtml = '';
  if (templates.length === 0) {
    rowsHtml = `<tr><td colspan="4" class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Keine Standard-Positionen erfasst.</td></tr>`;
  } else {
    // Sort templates by category then description
    const sortedTemplates = [...templates].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return a.desc.localeCompare(b.desc);
    });
    
    rowsHtml = sortedTemplates.map((t) => {
      const priceLabel = t.price ? `CHF ${Number(t.price).toFixed(2)}` : '<span class="text-muted">Flexibler Preis</span>';
      
      let catBadge = 'bg-light text-dark border';
      if (t.category === 'Vermietung') catBadge = 'bg-primary-subtle text-primary border border-primary-subtle';
      else if (t.category === 'Konsumationen') catBadge = 'bg-success-subtle text-success border border-success-subtle';
      else if (t.category === 'Schulsport') catBadge = 'bg-danger-subtle text-danger border border-danger-subtle';
      
      const tIdStr = t.id ? `'${t.id}'` : 'null';
      const escapedDesc = String(t.desc).replace(/'/g, "\\'");
      const escapedCategory = String(t.category).replace(/'/g, "\\'");
      const kontoVal = t.habenkonto || t.konto || '';
      const escapedKonto = String(kontoVal).replace(/'/g, "\\'");
      const kontoBadge = kontoVal ? `<span class="badge bg-light text-primary font-monospace border">${escapeHtml(kontoVal)}</span>` : '<span class="text-muted small">–</span>';
      
      return `
        <tr class="bh-account-row">
          <td class="tk-col-cat"><span class="badge ${catBadge} px-2.5 py-1.5">${escapeHtml(t.category)}</span></td>
          <td class="fw-bold text-dark tk-col-desc">${escapeHtml(t.desc)}</td>
          <td class="text-end font-monospace fw-bold tk-col-price">${priceLabel}</td>
          <td class="text-center tk-col-konto">${kontoBadge}</td>
          <td class="text-end tk-col-actions">
            <button class="btn btn-xs btn-outline-warning me-1 write-protected" onclick="rnOpenTemplateModal(${tIdStr}, '${escapedCategory}', '${escapedDesc}', '${t.price || ''}', '${escapedKonto}')" title="Vorlage bearbeiten">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-xs btn-outline-danger write-protected" onclick="rnDeleteTemplate(${tIdStr}, '${escapedDesc}')" title="Vorlage löschen">
              <i class="fas fa-trash-alt"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }
  
  content.innerHTML = `
    <div class="card border border-light shadow-sm p-4">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <h5 class="fw-bold text-primary mb-0"><i class="fas fa-magic me-2"></i>Standard-Rechnungspositionen verwalten</h5>
        <div class="d-flex gap-2 align-items-center">
          <div id="rn-templates-col-toggle"></div>
          <button class="btn btn-sm btn-success fw-bold shadow-sm write-protected" onclick="rnOpenTemplateModal(null)">
            <i class="fas fa-plus-circle me-1"></i> Position hinzufügen
          </button>
        </div>
      </div>
      
      <p class="text-muted small mb-4">
        Hier können Sie die Vorlagen verwalten, die in den Rechnungserstellungs- und Bearbeitungsdialogen unter <strong>„Standard-Positionen“</strong> zur Schnellauswahl angeboten werden.
      </p>
      
      <div class="table-responsive">
        <table class="table table-hover align-middle bh-table mb-0" id="rn-templates-table" style="font-size: 13.5px;">
          <thead>
            <tr>
              <th data-col-id="cat" data-col-name="Kategorie" style="width: 140px;">Kategorie</th>
              <th data-col-id="desc" data-col-name="Beschreibung">Dienstleistung / Ware (Beschreibung)</th>
              <th data-col-id="price" data-col-name="Standard-Richtpreis" class="text-end" style="width: 160px;">Standard-Richtpreis</th>
              <th data-col-id="konto" data-col-name="Haben-Konto" class="text-center" style="width: 150px;">Haben-Konto</th>
              <th data-col-id="actions" data-col-name="Aktionen" class="text-end" style="width: 110px;">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;

  if (window.TableKit && typeof window.TableKit.setupColumnToggle === 'function') {
    window.TableKit.setupColumnToggle('#rn-templates-table', {
      container: '#rn-templates-col-toggle',
      storageKey: 'rn_templates_table_cols'
    });
  }
};

// Modal for Template Add/Edit
window.rnOpenTemplateModal = function(templateId = null, cat = 'Vermietung', dsc = '', prc = '', habenkonto = '') {
  let modalEl = document.getElementById('rnModalTemplateEdit');
  if (!modalEl) {
    modalEl = document.createElement('div');
    modalEl.id = 'rnModalTemplateEdit';
    modalEl.className = 'modal fade';
    modalEl.tabIndex = -1;
    modalEl.setAttribute('aria-hidden', 'true');
    document.body.appendChild(modalEl);
  }
  
  const isNew = templateId === null || templateId === undefined || templateId === '';
  const t = isNew ? { id: '', category: cat, desc: dsc, price: prc, habenkonto: habenkonto } : (window._invoiceTemplates.find(x => String(x.id) === String(templateId)) || { id: templateId, category: cat, desc: dsc, price: prc, habenkonto: habenkonto });
  
  const tIdParam = isNew ? 'null' : `'${t.id}'`;
  
  modalEl.innerHTML = `
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content border-0 rounded-4 shadow">
        <div class="modal-header bg-primary text-white border-0 py-3 rounded-top-4">
          <h5 class="modal-title fw-bold"><i class="fas fa-magic me-2"></i>${isNew ? 'Standard-Position hinzufügen' : 'Standard-Position bearbeiten'}</h5>
          <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
        </div>
        <div class="modal-body p-4">
          <form onsubmit="rnSaveTemplate(event, ${tIdParam})">
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Kategorie</label>
              <select class="form-select" id="rnt-category" required>
                <option value="Vermietung" ${t.category === 'Vermietung' ? 'selected' : ''}>Schützenhaus Vermietung</option>
                <option value="Konsumationen" ${t.category === 'Konsumationen' ? 'selected' : ''}>Konsumationen (Essen / Getränke / Arbeit)</option>
                <option value="Schulsport" ${t.category === 'Schulsport' ? 'selected' : ''}>Schulsport / Kurse</option>
                <option value="Sonstige" ${t.category === 'Sonstige' ? 'selected' : ''}>Sonstige / Diverse</option>
              </select>
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Beschreibung der Dienstleistung / Ware</label>
              <input type="text" class="form-control fw-semibold" id="rnt-desc" required value="${escapeHtml(t.desc)}" placeholder="z.B. Süssgetränk 0.5 l">
            </div>
            
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Standard-Richtpreis (Optional)</label>
              <div class="input-group">
                <span class="input-group-text bg-light text-muted">CHF</span>
                <input type="number" step="0.05" class="form-control text-end font-monospace" id="rnt-price" value="${t.price || ''}" placeholder="0.00 (Feld leeren für flexiblen Preis)">
              </div>
              <div class="form-text text-muted small mt-1">Lassen Sie dieses Feld leer, wenn der Betrag bei jeder Rechnung individuell eingegeben werden soll (z.B. Getränkebezug).</div>
            </div>

            <div class="mb-4">
              <label class="form-label fw-bold small text-primary mb-1">
                <i class="fas fa-book me-1"></i>Haben-Konto (Buchhaltung)
              </label>
              <input type="text" class="form-control font-monospace" id="rnt-habenkonto" list="rn-konten-datalist" value="${escapeHtml(t.habenkonto || t.konto || '')}" placeholder="Konto wählen oder suchen (z.B. 3650)...">
              <div class="form-text text-muted small mt-1">Wird beim Einfügen dieser Standard-Position automatisch als Gegenkonto übernommen.</div>
            </div>
            ${typeof getRnKontenDatalistHtml === 'function' ? getRnKontenDatalistHtml() : ''}
            
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
  
  const modal = new bootstrap.Modal(modalEl);
  modal.show();
};

window.rnSaveTemplate = async function(event, templateId) {
  event.preventDefault();
  
  const category = document.getElementById('rnt-category').value;
  const desc = document.getElementById('rnt-desc').value.trim();
  const priceInput = document.getElementById('rnt-price').value;
  const price = priceInput !== '' ? parseFloat(priceInput) : '';
  const rawHabenkonto = document.getElementById('rnt-habenkonto') ? document.getElementById('rnt-habenkonto').value.trim() : '';
  const habenkonto = rawHabenkonto.split('|')[0].trim();
  
  const submitBtn = event.target.querySelector('button[type="submit"]');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere...';
  }
  
  const isNew = templateId === null || templateId === undefined || templateId === '';
  const newTemplate = { category, desc, price, habenkonto };

  // 1. Supabase PostgreSQL Master Write
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (sb) {
    try {
      const tId = isNew ? (desc.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now()) : String(templateId);
      await sb.from('invoice_templates').upsert({
        id: tId,
        category: category,
        description: desc,
        unit_price: price !== '' ? Number(price) : null,
        konto: habenkonto || null,
        updated_at: new Date().toISOString()
      });
      showSuccess(isNew ? "🎉 Standard-Position erfolgreich hinzugefügt!" : "🎉 Standard-Position aktualisiert!");
      const modalEl = document.getElementById('rnModalTemplateEdit');
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
      
      // Reload from Supabase
      await loadInvoiceTemplatesData();
      renderActiveRechnungenTab();
      return;
    } catch (sbErr) {
      console.warn("⚠️ [Supabase] Template save warning:", sbErr);
      showError("Fehler beim Speichern der Vorlage in Supabase: " + (sbErr.message || sbErr));
      return;
    }
  }
      newTemplate.id = maxId + 1;
      templates.push(newTemplate);
    } else {
      const idx = templates.findIndex(t => String(t.id) === String(templateId));
      if (idx !== -1) {
        templates[idx] = { ...templates[idx], ...newTemplate };
      } else {
        newTemplate.id = templateId;
        templates.push(newTemplate);
      }
    }
    
    localStorage.setItem('portal_invoice_templates', JSON.stringify(templates));
    window._invoiceTemplates = templates;
    
    const modalEl = document.getElementById('rnModalTemplateEdit');
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
    
    showSuccess(isNew ? "🎉 Standard-Position lokal gespeichert!" : "🎉 Standard-Position lokal aktualisiert!");
    renderActiveRechnungenTab();
  }
};

window.rnDeleteTemplate = async function(templateId, desc) {
  if (!confirm(`⚠️ Möchten Sie die Standard-Position "${desc}" wirklich aus den Vorlagen löschen?`)) return;
  
  const isServerTpl = templateId !== null && templateId !== undefined && templateId !== '';
  
  // Supabase PostgreSQL Master Delete
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (sb && isServerTpl) {
    try {
      await sb.from('invoice_templates').delete().eq('id', String(templateId));
      console.log(`✅ [Supabase] Template ${templateId} deleted from Supabase.`);
      showSuccess("🗑️ Standard-Position erfolgreich gelöscht!");
      await loadInvoiceTemplatesData();
      renderActiveRechnungenTab();
      return;
    } catch (sbErr) {
      console.warn("⚠️ [Supabase] Template delete warning:", sbErr);
      showError("Fehler beim Löschen in Supabase: " + (sbErr.message || sbErr));
      return;
    }
  }
  
  // LOCALSTORAGE FALLBACK
  rnInitializeTemplates();
  let templates = JSON.parse(localStorage.getItem('portal_invoice_templates') || '[]');
  
  const idx = templates.findIndex(t => String(t.id) === String(templateId));
  if (idx !== -1) {
    templates.splice(idx, 1);
  }
  
  localStorage.setItem('portal_invoice_templates', JSON.stringify(templates));
  window._invoiceTemplates = templates;
  
  showSuccess("🗑️ Standard-Position lokal gelöscht!");
  renderActiveRechnungenTab();
};
