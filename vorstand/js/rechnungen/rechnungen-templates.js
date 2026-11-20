// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - TEMPLATES (VORLAGEN)
// =====================================================================

window.renderTabTemplates = function(content) {
  const templates = Array.isArray(window._invoiceTemplates) ? window._invoiceTemplates : [];

  let rowsHtml = '';
  if (templates.length === 0) {
    rowsHtml = `<tr><td colspan="5" class="text-center text-muted py-4"><i class="fas fa-info-circle me-2"></i>Keine Standard-Positionen erfasst.</td></tr>`;
  } else {
    // Sort templates by category then description
    const sortedTemplates = [...templates].sort((a, b) => {
      if ((a.category || '') !== (b.category || '')) return (a.category || '').localeCompare(b.category || '');
      return (a.desc || '').localeCompare(b.desc || '');
    });

    rowsHtml = sortedTemplates.map((t) => {
      const priceLabel = t.price
        ? (window.UIFormatKit ? window.UIFormatKit.formatCurrency(t.price) : `CHF ${Number(t.price).toFixed(2)}`)
        : '<span class="text-muted">Flexibler Preis</span>';

      let catBadge = 'bg-light text-dark border';
      if (t.category === 'Vermietung') catBadge = 'bg-primary-subtle text-primary border border-primary-subtle';
      else if (t.category === 'Konsumationen') catBadge = 'bg-success-subtle text-success border border-success-subtle';
      else if (t.category === 'Schulsport') catBadge = 'bg-danger-subtle text-danger border border-danger-subtle';

      const tIdParam = t.id ? `'${escapeJs(t.id)}'` : 'null';
      const escapedDesc = escapeJs(t.desc || '');
      const escapedCategory = escapeJs(t.category || '');
      const kontoVal = t.habenkonto || t.konto || '';
      const escapedKonto = escapeJs(kontoVal);
      const kontoBadge = kontoVal ? `<span class="badge bg-light text-primary font-monospace border">${escapeHtml(kontoVal)}</span>` : '<span class="text-muted small">–</span>';

      return `
        <tr class="bh-account-row">
          <td data-col-id="cat" class="tk-col-cat"><span class="badge ${catBadge} px-2.5 py-1.5">${escapeHtml(t.category)}</span></td>
          <td data-col-id="desc" class="fw-bold text-dark tk-col-desc">${escapeHtml(t.desc)}</td>
          <td data-col-id="price" class="text-end font-monospace fw-bold tk-col-price">${priceLabel}</td>
          <td data-col-id="konto" class="text-center tk-col-konto">${kontoBadge}</td>
          <td data-col-id="actions" class="text-end tk-col-actions">
            <button class="btn btn-xs btn-outline-warning me-1 write-protected" onclick="rnOpenTemplateModal(${tIdParam}, '${escapedCategory}', '${escapedDesc}', '${escapeJs(String(t.price || ''))}', '${escapedKonto}')" title="Vorlage bearbeiten">
              <i class="fas fa-edit"></i>
            </button>
            <button class="btn btn-xs btn-outline-danger write-protected" onclick="rnDeleteTemplate(${tIdParam}, '${escapedDesc}')" title="Vorlage löschen">
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
        <h5 class="fw-bold text-primary mb-0"><i class="fas fa-boxes-stacked me-2"></i>Artikelstamm & Standard-Positionen verwalten</h5>
        <div class="d-flex gap-2 align-items-center">
          <div id="rn-templates-col-toggle"></div>
          <button class="btn btn-sm btn-success fw-bold shadow-sm write-protected" onclick="rnOpenTemplateModal(null)">
            <i class="fas fa-plus-circle me-1"></i> Artikel / Position hinzufügen
          </button>
        </div>
      </div>
      
      <p class="text-muted small mb-4">
        Hier kannst du den Artikelstamm und die Standard-Positionen verwalten, die in den Rechnungserstellungs- und Bearbeitungsdialogen unter <strong>„Standard-Positionen“</strong> zur Schnellauswahl angeboten werden.
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

  if (window.TableKit && typeof window.TableKit.initTable === 'function') {
    window._rnTemplatesTableController = window.TableKit.initTable('#rn-templates-table', {
      id: 'rn_templates_table',
      storageKeyWidths: 'rn_templates_table_col_widths',
      storageKeyOrder: 'rn_templates_table_col_order',
      storageKeyCols: 'rn_templates_table_cols',
      sortable: true,
      resizable: {
        minWidth: 50,
        columns: {
          actions: { minWidth: 90, defaultWidth: 110 }
        }
      },
      reorderable: {
        lockedColumns: ['actions']
      },
      columnToggle: '#rn-templates-col-toggle'
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
              <div class="form-text text-muted small mt-1">Lasse dieses Feld leer, wenn der Betrag bei jeder Rechnung individuell eingegeben werden soll (z. B. Getränkebezug).</div>
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
              <button type="submit" id="rnt-submit-btn" class="btn btn-primary py-2.5 fw-bold rounded-3 shadow-sm write-protected">
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
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('rechnungen')) {
    if (window.UIConfirmKit) await UIConfirmKit.alert({ title: 'Keine Berechtigung', message: 'Du hast keine Schreibberechtigung für das Rechnungsmodul.', type: 'warning' });
    return;
  }

  const category = document.getElementById('rnt-category').value;
  const desc = document.getElementById('rnt-desc').value.trim();
  const priceInput = document.getElementById('rnt-price').value;
  const parsedPrice = priceInput !== '' ? Number(priceInput) : 0;
  const rawHabenkonto = document.getElementById('rnt-habenkonto') ? document.getElementById('rnt-habenkonto').value.trim() : '';
  const habenkonto = rawHabenkonto.split('|')[0].trim() || '3000';
  const submitBtn = document.getElementById('rnt-submit-btn') || event.target?.querySelector('button[type="submit"]');

  const isNew = templateId === null || templateId === undefined || templateId === '';
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (!sb) {
    if (window.UIConfirmKit) {
      await UIConfirmKit.alert({ title: 'Konfigurationsfehler', message: 'Supabase Client ist nicht initialisiert. Vorlage kann nicht gespeichert werden.', type: 'danger' });
    } else {
      showError('Supabase Client ist nicht initialisiert.');
    }
    return;
  }

  const executeSave = async () => {
    try {
      const payload = {
        category: category,
        description: desc,
        price: isNaN(parsedPrice) ? 0 : parsedPrice,
        habenkonto: habenkonto,
        updated_at: new Date().toISOString()
      };

      const { error } = isNew
        ? await sb.from('invoice_templates').insert([payload])
        : await sb.from('invoice_templates').update(payload).eq('id', String(templateId));

      if (error) throw error;

      showSuccess(isNew ? '🎉 Standard-Position erfolgreich hinzugefügt!' : '🎉 Standard-Position aktualisiert!');
      const modalEl = document.getElementById('rnModalTemplateEdit');
      const modal = modalEl ? bootstrap.Modal.getInstance(modalEl) : null;
      if (modal) modal.hide();

      await loadInvoiceTemplatesData();
      renderActiveRechnungenTab();
    } catch (sbErr) {
      console.error('❌ [Supabase] Template save error:', sbErr);
      if (window.UIConfirmKit) {
        await UIConfirmKit.alert({ title: 'Speicherfehler', message: `Fehler beim Speichern der Vorlage in Supabase: ${escapeHtml(sbErr.message || String(sbErr))}`, type: 'danger' });
      } else {
        showError('Fehler beim Speichern der Vorlage in Supabase: ' + (sbErr.message || sbErr));
      }
    }
  };

  if (window.UIButtonKit && submitBtn) {
    await UIButtonKit.withLoading(submitBtn, executeSave);
  } else {
    await executeSave();
  }
};

window.rnDeleteTemplate = async function(templateId, desc) {
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('rechnungen')) {
    if (window.UIConfirmKit) await UIConfirmKit.alert({ title: 'Keine Berechtigung', message: 'Du hast keine Schreibberechtigung für das Rechnungsmodul.', type: 'warning' });
    return;
  }

  const ok = await UIConfirmKit.confirm({
    title: 'Standard-Position löschen?',
    message: `Möchtest du die Standard-Position <strong>${escapeHtml(desc)}</strong> wirklich aus den Vorlagen löschen?`,
    type: 'danger',
    confirmText: 'Löschen'
  });
  if (!ok) return;

  const isServerTpl = templateId !== null && templateId !== undefined && templateId !== '';
  const sb = typeof getRechnungenSupabaseClient === 'function' ? getRechnungenSupabaseClient() : null;
  if (!sb) {
    if (window.UIConfirmKit) {
      await UIConfirmKit.alert({ title: 'Konfigurationsfehler', message: 'Supabase Client ist nicht initialisiert. Vorlage kann nicht gelöscht werden.', type: 'danger' });
    } else {
      showError('Supabase Client ist nicht initialisiert.');
    }
    return;
  }
  if (!isServerTpl) {
    if (window.UIConfirmKit) {
      await UIConfirmKit.alert({ title: 'Ungültige Vorlage', message: 'Die Vorlagen-ID fehlt.', type: 'warning' });
    }
    return;
  }

  try {
    const { error } = await sb.from('invoice_templates').delete().eq('id', String(templateId));
    if (error) throw error;
    console.log(`✅ [Supabase] Template ${templateId} deleted from Supabase.`);
    showSuccess('🗑️ Standard-Position erfolgreich gelöscht!');
    await loadInvoiceTemplatesData();
    renderActiveRechnungenTab();
  } catch (sbErr) {
    console.error('❌ [Supabase] Template delete error:', sbErr);
    if (window.UIConfirmKit) {
      await UIConfirmKit.alert({ title: 'Löschfehler', message: `Fehler beim Löschen der Vorlage in Supabase: ${escapeHtml(sbErr.message || String(sbErr))}`, type: 'danger' });
    } else {
      showError('Fehler beim Löschen in Supabase: ' + (sbErr.message || sbErr));
    }
  }
};
