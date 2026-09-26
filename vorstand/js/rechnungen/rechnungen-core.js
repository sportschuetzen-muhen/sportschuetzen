// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - CORE
// =====================================================================

// Globale State-Variablen für Rechnungen
window._invoices = [];
window._invoicesSearchCol = 'created_at';
window._invoicesSearchAsc = false;
window._invoicesFilterStatus = 'alle';
window._invoicesFilterType = 'alle';

// Standard-Rechnungs-Typen
const RECHNUNG_TYPES = [
  { value: 'Jahresbeitrag', label: 'Jahresbeitrag' },
  { value: 'Vermietung', label: 'Vermietung' },
  { value: 'Schulsport', label: 'Schulsport' },
  { value: 'Sponsoring', label: 'Sponsoring / Gönner' },
  { value: 'Sonstige', label: 'Sonstige / Diverse' }
];

/**
 * Generiert eine CAMT-konforme, eindeutige Rechnungsnummer im Format [PREFIX]-[YY]-[CODE]
 * Verwendet das Crockford Base32-Alphabet (31 Zeichen) ohne 0, O, o, 1, I, l und ohne Umlaute/Sonderzeichen.
 * Beispiel: RE-26-7K4M, MV-26-8N2W, DP-26-5M7T
 * @param {string} prefix - z. B. 'RE' (Standard), 'MV' (Materialverkauf), 'DP' (Depot), 'JB' (Jahresbeitrag)
 * @param {number|string} [year] - z. B. 2026 oder 26 (Standard: aktuelles Buchungsjahr)
 * @returns {string} Eindeutige Rechnungsnummer
 */
window.generateSafeInvoiceId = function(prefix = 'RE', year = null) {
  const y = Number(year || window._bhYear || new Date().getFullYear());
  const shortYear = String(y).slice(-2);
  const cleanAlphabet = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'; // 31 Zeichen ohne 0, O, 1, I, L

  const existingInvoices = window._invoices || window._jbAllInvoices || [];
  const existingIds = new Set(existingInvoices.map(i => String(i.id || '').toUpperCase().trim()));

  for (let attempt = 0; attempt < 1000; attempt++) {
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += cleanAlphabet[Math.floor(Math.random() * cleanAlphabet.length)];
    }
    const candidateId = `${prefix.toUpperCase().trim()}-${shortYear}-${code}`;
    if (!existingIds.has(candidateId)) {
      return candidateId;
    }
  }
  return `${prefix.toUpperCase().trim()}-${shortYear}-${Date.now().toString(36).toUpperCase().slice(-4)}`;
};

// Supabase Client Access & State
function getRechnungenSupabaseClient() {
  if (typeof window.getSupabaseClient === 'function') {
    return window.getSupabaseClient();
  }
  return window.supabaseClient || null;
}
window.getRechnungenSupabaseClient = getRechnungenSupabaseClient;
window._rechnungenIsSupabase = false;

// Formatierungshelfer für Schweizer Datumsanzeige (DD.MM.YYYY)
function rnFmtSwissDate(val) {
  if (!val) return '';
  if (typeof val === 'string' && val.includes('.')) return val;
  const d = new Date(val);
  if (isNaN(d.getTime())) return String(val);
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}
window.rnFmtSwissDate = rnFmtSwissDate;

// --- MAPPING HELPER FÜR SUPABASE POSTGREST ---
function mapInvoiceFromSupabase(r, posMap = {}) {
  const invId = String(r.id).trim();
  let mahnHist = [];
  try {
    if (r.mahn_historie) {
      mahnHist = typeof r.mahn_historie === 'string' ? JSON.parse(r.mahn_historie) : r.mahn_historie;
    }
  } catch (_) {}

  return {
    id: invId,
    PersonNumber: r.person_number || '',
    name: r.recipient_name || '',
    year: Number(r.year || new Date().getFullYear()),
    type: r.type || 'Jahresbeitrag',
    status: r.status || 'offen',
    total_amount: Number(r.total_amount || 0),
    payment_date: r.payment_date || '',
    payment_method: r.payment_method || '',
    document_ref: r.document_ref || '',
    pdf_url: r.pdf_url || '',
    pdf_storage_path: r.pdf_storage_path || '',
    mail_status: r.mail_status || 'entwurf',
    send_date: r.send_date ? rnFmtSwissDate(r.send_date) : '',
    mahnstufe: Number(r.mahnstufe || 0),
    mahn_datum: r.mahn_datum ? rnFmtSwissDate(r.mahn_datum) : '',
    mahn_historie: mahnHist,
    notes: r.notes || '',
    created_at: r.created_at ? rnFmtSwissDate(r.created_at) : '',
    updated_at: r.updated_at ? rnFmtSwissDate(r.updated_at) : '',
    positions: posMap[invId] || []
  };
}

function mapPositionFromSupabase(r) {
  return {
    id: r.id,
    invoice_id: String(r.invoice_id).trim(),
    position_nr: Number(r.position_nr || 1),
    description: r.description || '',
    quantity: Number(r.quantity || 1),
    unit_price: Number(r.unit_price || 0),
    amount: Number(r.amount || 0),
    konto: r.konto || '3000',
    type: r.type || 'standard',
    source_field: r.source_field || '',
    sourcefield: r.source_field || ''
  };
}

function mapTemplateFromSupabase(r) {
  return {
    id: r.id,
    category: r.category || 'Allgemein',
    desc: r.description || '',
    price: Number(r.price || 0),
    habenkonto: r.habenkonto || '3000',
    konto: r.habenkonto || '3000'
  };
}

function mapContactFromSupabase(r) {
  return {
    id: r.id,
    typ: r.typ || 'privat',
    kategorie: r.kategorie || '',
    firma: r.firma || '',
    abteilung: r.abteilung || '',
    anrede: r.anrede || '',
    vorname: r.vorname || '',
    nachname: r.nachname || '',
    strasse: r.strasse || '',
    adresszusatz: r.adresszusatz || '',
    plz: r.plz || '',
    ort: r.ort || '',
    land: r.land || 'Schweiz',
    email: r.email || '',
    telefon: r.telefon || '',
    bemerkungen: r.bemerkungen || ''
  };
}

// Online/Preload Endpoint Trigger
window._invoiceTemplates = [];
window._invoiceLayouts = {};
window._externalContacts = [];
window._rechnungenActiveTab = 'archiv';

// API Endpoint to fetch external contacts (Supabase Single Source of Truth)
window.loadInvoiceContactsData = async function() {
  const supa = getRechnungenSupabaseClient();
  if (supa) {
    try {
      const { data, error } = await supa.from('external_contacts').select('*').order('nachname', { ascending: true });
      if (!error && Array.isArray(data)) {
        window._externalContacts = data.map(mapContactFromSupabase);
        return window._externalContacts;
      }
      if (error) throw error;
    } catch (e) {
      console.warn("⚠️ Supabase Kontakte-Abfrage fehlgeschlagen:", e);
    }
  }
  return window._externalContacts || [];
};

// Robustes Ermitteln der verfügbaren Vereinsmitglieder (Members100) aus allen Speicherquellen
window.rnGetMembersList = function() {
  if (Array.isArray(window._mglData) && window._mglData.length > 0) {
    return window._mglData;
  }
  if (window.AppCache) {
    const cached = window.AppCache.get('mitglieder');
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      window._mglData = cached.data;
      return window._mglData;
    }
  }
  if (window._jbMemberMap && Object.keys(window._jbMemberMap).length > 0) {
    const fromMap = Object.values(window._jbMemberMap);
    if (fromMap.length > 0) {
      window._mglData = fromMap;
      return window._mglData;
    }
  }
  if (Array.isArray(window._jbMembers) && window._jbMembers.length > 0) {
    return window._jbMembers;
  }
  return [];
};

// Asynchrones Sicherstellen, dass Members100-Daten im RAM vorliegen (nutzt den zentralen deduplizierten Loader)
window.rnEnsureMembersLoaded = async function(force = false) {
  const current = window.rnGetMembersList();
  if (!force && current.length > 0) {
    return current;
  }

  if (typeof window.ensureMitgliederLoaded === 'function') {
    await window.ensureMitgliederLoaded(force);
  } else if (typeof loadMitgliederData === 'function') {
    await loadMitgliederData(force);
  }

  return window.rnGetMembersList();
};

// Asynchrones Sicherstellen, dass externe Kontakte vorliegen
window.rnEnsureContactsLoaded = async function(force = false) {
  if (!force && Array.isArray(window._externalContacts) && window._externalContacts.length > 0) {
    return window._externalContacts;
  }
  await window.loadInvoiceContactsData();
  return window._externalContacts || [];
};

// API Endpoint to fetch template positions (Supabase Single Source of Truth)
window.loadInvoiceTemplatesData = async function() {
  const supa = getRechnungenSupabaseClient();
  if (supa) {
    try {
      const { data, error } = await supa.from('invoice_templates').select('*').order('sort_order', { ascending: true }).order('description', { ascending: true });
      if (!error && Array.isArray(data)) {
        window._invoiceTemplates = data.map(mapTemplateFromSupabase);
        localStorage.setItem('portal_invoice_templates', JSON.stringify(window._invoiceTemplates));
        return window._invoiceTemplates;
      }
      if (error) throw error;
    } catch (e) {
      console.warn("⚠️ Supabase Vorlagen-Abfrage fehlgeschlagen:", e);
    }
  }

  // Fallback to local storage if offline
  rnInitializeTemplates();
  window._invoiceTemplates = JSON.parse(localStorage.getItem('portal_invoice_templates') || '[]');
  return window._invoiceTemplates || [];
};

// API Endpoint to fetch layout configuration (Supabase Single Source of Truth)
window.loadInvoiceLayoutsData = async function() {
  const supa = getRechnungenSupabaseClient();
  if (supa) {
    try {
      const { data, error } = await supa.from('invoice_layouts').select('*');
      if (!error && Array.isArray(data)) {
        const map = {};
        data.forEach(item => {
          if (item.type) map[item.type] = item;
        });
        if (typeof rnGetDefaultLayouts === 'function') {
          window._invoiceLayouts = { ...rnGetDefaultLayouts(), ...map };
        } else {
          window._invoiceLayouts = map;
        }
        localStorage.setItem('portal_invoice_layouts', JSON.stringify(window._invoiceLayouts));
        return window._invoiceLayouts;
      }
      if (error) throw error;
    } catch (e) {
      console.warn("⚠️ Supabase Layouts-Abfrage fehlgeschlagen:", e);
    }
  }

  // Fallback to default layouts / local storage
  if (typeof rnGetDefaultLayouts === 'function') {
    window._invoiceLayouts = rnGetDefaultLayouts();
  }
  try {
    const stored = localStorage.getItem('portal_invoice_layouts');
    if (stored) {
      window._invoiceLayouts = { ...window._invoiceLayouts, ...JSON.parse(stored) };
    }
  } catch (_) {}
  return window._invoiceLayouts || {};
};

// Online/Preload Endpoint Trigger (Supabase First mit GAS-Fallback)
window.loadRechnungenData = async function(silent = false, forceReload = false) {
  const container = document.getElementById('rechnungen-container');
  const hasCachedData = window._invoices && window._invoices.length > 0;
  
  if (!forceReload && hasCachedData) {
    console.log("⚡ loadRechnungenData: Lade aus lokalem Cache...");
    window.renderRechnungen();
    return;
  }
  
  if (!silent && !hasCachedData) {
    if (container) {
      container.innerHTML = `
        <div class="text-center py-5">
          <div class="spinner-border text-primary" role="status"></div>
          <p class="mt-2 text-muted">Lade Rechnungen und Zahlungsdaten aus Supabase...</p>
        </div>`;
    }
  }

  // 1. SUPABASE MASTER LOAD
  const supa = getRechnungenSupabaseClient();
  if (supa) {
    try {
      const [invRes, posRes] = await Promise.all([
        supa.from('invoices').select('*').order('created_at', { ascending: false }),
        supa.from('invoice_positions').select('*').order('position_nr', { ascending: true }),
        loadInvoiceTemplatesData(),
        loadInvoiceLayoutsData(),
        loadInvoiceContactsData()
      ]);

      if (!invRes.error && Array.isArray(invRes.data)) {
        console.log(`✅ ${invRes.data.length} Rechnungen & ${posRes.data?.length || 0} Positionen aus Supabase geladen.`);
        window._rechnungenIsSupabase = true;

        // Positions-Map aufbauen
        const posMap = {};
        (posRes.data || []).forEach(p => {
          const invId = String(p.invoice_id).trim();
          if (!posMap[invId]) posMap[invId] = [];
          posMap[invId].push(mapPositionFromSupabase(p));
        });

        window._invoicePositionsCache = posMap;
        window._invoices = invRes.data.map(r => mapInvoiceFromSupabase(r, posMap));
        window._jbAllInvoices = window._invoices;

        window.rnEnsureMembersLoaded().catch(e => console.warn("Mitglieder Preload:", e));
        window.renderRechnungen();
        return;
      }
      if (invRes.error) throw invRes.error;
    } catch (supaErr) {
      console.error("❌ Supabase Rechnungen Abfrage fehlgeschlagen:", supaErr);
      if (container && (!silent || !hasCachedData)) {
        container.innerHTML = `
          <div class="alert alert-danger shadow-sm rounded-3">
            <i class="fas fa-exclamation-triangle me-2"></i>
            <strong>Fehler:</strong> Rechnungsdaten konnten nicht aus Supabase geladen werden.
            <br><small class="text-muted">${supaErr.message || supaErr}</small>
          </div>`;
      }
      return;
    }
  } else {
    console.error("❌ Kein Supabase Client verfügbar für Rechnungen.");
    if (container && (!silent || !hasCachedData)) {
      container.innerHTML = `
        <div class="alert alert-danger shadow-sm rounded-3">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Konfigurationsfehler:</strong> Supabase Client ist nicht initialisiert.
        </div>`;
    }
  }
};

// =====================================================================
// 1-KLICK-MIGRATION: ALLE RECHNUNGEN & DATEN AUS GOOGLE SHEETS NACH SUPABASE
// =====================================================================
window.syncRechnungenFromLegacy = async function() {
  const supa = getRechnungenSupabaseClient();
  if (!supa) {
    alert("❌ Supabase Client ist nicht initialisiert. Bitte Seite neu laden.");
    return;
  }

  if (!confirm("Möchtest du jetzt alle Rechnungen, Positionen, Vorlagen und Kontakte aus dem bestehenden Google Spreadsheet nach Supabase importieren?")) {
    return;
  }

  const btn = document.getElementById('rn-sync-legacy-btn');
  const originalBtnHtml = btn ? btn.innerHTML : '';
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Importiere...';
  }

  try {
    alert("ℹ️ Migration bereits abgeschlossen:\n\nAlle Rechnungen, Positionen, Vorlagen und Kontakte werden direkt über Supabase PostgreSQL verwaltet. Die Google Sheets / GAS-Schnittstelle ist entkoppelt.");
    return;

    let importedInvoices = 0;
    let importedPositions = 0;
    let importedContacts = 0;
    let importedTemplates = 0;
    let importedLayouts = 0;

    // A. Kontakte importieren
    const contacts = contJson.data || [];
    if (contacts.length > 0) {
      const contactsToUpsert = contacts.map(c => ({
        id: String(c.id).trim(),
        typ: c.typ || 'privat',
        kategorie: c.kategorie || '',
        firma: c.firma || '',
        abteilung: c.abteilung || '',
        anrede: c.anrede || '',
        vorname: c.vorname || '',
        nachname: c.nachname || '',
        strasse: c.strasse || '',
        adresszusatz: c.adresszusatz || '',
        plz: String(c.plz || ''),
        ort: c.ort || '',
        land: c.land || 'Schweiz',
        email: c.email || '',
        telefon: c.telefon || '',
        bemerkungen: c.bemerkungen || '',
        updated_at: new Date().toISOString()
      }));
      const { error: cErr } = await supa.from('external_contacts').upsert(contactsToUpsert, { onConflict: 'id' });
      if (cErr) console.warn("Warnung Kontakte-Import:", cErr);
      else importedContacts = contactsToUpsert.length;
    }

    // B. Vorlagen importieren
    const templates = tmplJson.data || [];
    if (templates.length > 0) {
      const templatesToUpsert = templates.map((t, idx) => ({
        category: t.category || 'Allgemein',
        description: t.desc || t.description || '',
        price: Number(t.price || 0),
        habenkonto: t.habenkonto || t.konto || '3000',
        sort_order: idx + 1,
        updated_at: new Date().toISOString()
      }));
      const { error: tErr } = await supa.from('invoice_templates').upsert(templatesToUpsert, { onConflict: 'id' });
      if (tErr) console.warn("Warnung Vorlagen-Import:", tErr);
      else importedTemplates = templatesToUpsert.length;
    }

    // C. Layouts importieren
    const layouts = layJson.data || [];
    if (layouts.length > 0) {
      const layoutsToUpsert = layouts.map(l => ({
        type: String(l.type || '').toLowerCase().trim(),
        title: l.title || '',
        intro: l.intro || '',
        outro: l.outro || '',
        notice: l.notice || '',
        mail_subject: l.mail_subject || '',
        mail_body: l.mail_body || '',
        updated_at: new Date().toISOString()
      })).filter(l => l.type);
      const { error: lErr } = await supa.from('invoice_layouts').upsert(layoutsToUpsert, { onConflict: 'type' });
      if (lErr) console.warn("Warnung Layouts-Import:", lErr);
      else importedLayouts = layoutsToUpsert.length;
    }

    // D. Rechnungen & Positionen importieren
    const invoices = invJson.data || [];
    if (invoices.length > 0) {
      const invoicesToUpsert = invoices.map(i => {
        let paymentDate = null;
        if (i.payment_date) {
          const p = String(i.payment_date).split(' ')[0];
          if (p.includes('.')) {
            const parts = p.split('.');
            if (parts.length === 3) paymentDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
          } else if (p.includes('-')) {
            paymentDate = p;
          }
        }

        return {
          id: String(i.id).trim(),
          person_number: String(i.PersonNumber || '').trim(),
          recipient_name: i.name || '',
          year: Number(i.year || new Date().getFullYear()),
          type: i.type || 'Jahresbeitrag',
          status: i.status || 'offen',
          total_amount: Number(i.total_amount || 0),
          payment_date: paymentDate,
          payment_method: i.payment_method || '',
          document_ref: i.document_ref || '',
          pdf_url: i.pdf_url || '',
          mail_status: i.mail_status || 'entwurf',
          mahnstufe: Number(i.mahnstufe || 0),
          mahn_datum: i.mahn_datum || null,
          mahn_historie: Array.isArray(i.mahn_historie) ? i.mahn_historie : [],
          updated_at: new Date().toISOString()
        };
      });

      const { error: iErr } = await supa.from('invoices').upsert(invoicesToUpsert, { onConflict: 'id' });
      if (iErr) throw iErr;
      importedInvoices = invoicesToUpsert.length;

      // Alle Positionen sammeln
      const allPositions = [];
      invoices.forEach(inv => {
        const invId = String(inv.id).trim();
        const pos = Array.isArray(inv.positions) ? inv.positions : [];
        pos.forEach((p, idx) => {
          allPositions.push({
            invoice_id: invId,
            position_nr: Number(p.position_nr || idx + 1),
            description: p.description || p.desc || 'Position',
            quantity: Number(p.quantity || 1),
            unit_price: Number(p.unit_price || p.price || 0),
            amount: Number(p.amount || 0),
            konto: p.konto || '3000',
            type: p.type || 'standard',
            source_field: p.source_field || p.sourcefield || ''
          });
        });
      });

      if (allPositions.length > 0) {
        // Zuerst alte Positionen für diese Invoices leeren, um Duplikate zu vermeiden
        const invIds = invoicesToUpsert.map(i => i.id);
        await supa.from('invoice_positions').delete().in('invoice_id', invIds);
        
        // In Batches einfügen
        const batchSize = 100;
        for (let b = 0; b < allPositions.length; b += batchSize) {
          const slice = allPositions.slice(b, b + batchSize);
          const { error: pErr } = await supa.from('invoice_positions').insert(slice);
          if (pErr) console.warn("Warnung Positionen Batch Insert:", pErr);
        }
        importedPositions = allPositions.length;
      }
    }

    alert(`🎉 1-Klick-Import erfolgreich abgeschlossen!\n\n` +
          `• ${importedInvoices} Rechnungen\n` +
          `• ${importedPositions} Rechnungspositionen\n` +
          `• ${importedContacts} externe Kontakte\n` +
          `• ${importedTemplates} Standard-Vorlagen\n` +
          `• ${importedLayouts} Layout-Konfigurationen\n\n` +
          `Supabase ist ab sofort der aktive Master für Rechnungen!`);

    await loadRechnungenData(false, true);

  } catch (err) {
    console.error("❌ Fehler beim 1-Klick-Import:", err);
    alert("❌ Fehler beim Importieren der Rechnungsdaten: " + err.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = originalBtnHtml;
    }
  }
};

// Hilfsfunktion: Gibt die Positionen einer Rechnung zurück (aus RAM-Cache, Invoice-Objekt oder Remote per getInvoiceDetails)
window.rnGetInvoicePositions = async function(invoiceId) {
  if (!invoiceId) return [];
  const idStr = String(invoiceId).trim();
  window._invoicePositionsCache = window._invoicePositionsCache || {};
  
  if (window._invoicePositionsCache[idStr] && Array.isArray(window._invoicePositionsCache[idStr]) && window._invoicePositionsCache[idStr].length > 0) {
    return window._invoicePositionsCache[idStr];
  }
  
  const inv = (window._invoices || []).find(i => String(i.id).trim() === idStr);
  if (inv && Array.isArray(inv.positions) && inv.positions.length > 0) {
    window._invoicePositionsCache[idStr] = inv.positions;
    return inv.positions;
  }
  
  // Supabase Nachladen
  const supa = getRechnungenSupabaseClient();
  if (supa) {
    try {
      const { data, error } = await supa.from('invoice_positions').select('*').eq('invoice_id', idStr).order('position_nr', { ascending: true });
      if (!error && Array.isArray(data) && data.length > 0) {
        const mapped = data.map(mapPositionFromSupabase);
        window._invoicePositionsCache[idStr] = mapped;
        if (inv) inv.positions = mapped;
        return mapped;
      }
    } catch (_) {}
  }

  return [];
};

// Standard-Vorlagen initialisieren
function rnInitializeTemplates() {
  if (typeof localStorage === 'undefined') return;
  if (!localStorage.getItem('portal_invoice_templates')) {
    const defaults = [
      { id: 1, category: 'Vermietung', desc: 'Miete Schützenhaus Muhen', price: 150 },
      { id: 2, category: 'Vermietung', desc: 'Miete Schützenhaus (Einheimische)', price: 120 },
      { id: 3, category: 'Vermietung', desc: 'Reinigungspauschale Schützenhaus', price: 50 },
      { id: 4, category: 'Konsumationen', desc: 'Wein', price: '' },
      { id: 5, category: 'Konsumationen', desc: 'Bier gross', price: '' },
      { id: 6, category: 'Konsumationen', desc: 'Bier klein', price: '' },
      { id: 7, category: 'Konsumationen', desc: 'Most', price: '' },
      { id: 8, category: 'Konsumationen', desc: 'Süssgetränke 0.5 l', price: '' },
      { id: 9, category: 'Konsumationen', desc: 'Mineralwasser 0.5 l', price: '' },
      { id: 10, category: 'Konsumationen', desc: 'Kaffee', price: '' },
      { id: 11, category: 'Konsumationen', desc: 'Uschi Künzli Stundenaufwand', price: '' },
      { id: 12, category: 'Konsumationen', desc: 'Hans-Rudolf Künzli Stundenaufwand', price: '' },
      { id: 13, category: 'Schulsport', desc: 'Munition 10m', price: '' },
      { id: 14, category: 'Schulsport', desc: 'Munition 50m', price: '' },
      { id: 15, category: 'Schulsport', desc: 'Miete Schiessjacken', price: '' }
    ];
    localStorage.setItem('portal_invoice_templates', JSON.stringify(defaults));
  }
}
window.rnInitializeTemplates = rnInitializeTemplates;

// Filter Handlers
window.rnChangeFilterStatus = function(val) {
  window._invoicesFilterStatus = val;
  
  // Sync Select Dropdown falls vorhanden
  const selectEl = document.getElementById('rn-filter-status');
  if (selectEl && selectEl.value !== val) {
    selectEl.value = val;
  }
  
  // Sync Status Pills falls vorhanden
  document.querySelectorAll('#rn-filter-pills .rn-status-pill').forEach(btn => {
    const isAct = btn.dataset.status === val;
    btn.classList.toggle('active', isAct);
    if (isAct) {
      btn.classList.remove('btn-outline-secondary', 'btn-outline-danger', 'btn-outline-warning', 'btn-outline-success');
      if (val === 'offen') btn.classList.add('btn-danger', 'text-white');
      else if (val === 'faellig') btn.classList.add('btn-warning', 'text-dark');
      else if (val === 'gemahnt') btn.classList.add('btn-warning', 'text-dark');
      else if (val === 'bezahlt') btn.classList.add('btn-success', 'text-white');
      else btn.classList.add('btn-primary', 'text-white');
    } else {
      btn.classList.remove('btn-primary', 'btn-danger', 'btn-warning', 'btn-success', 'text-white', 'text-dark');
      if (btn.dataset.status === 'offen') btn.classList.add('btn-outline-danger');
      else if (btn.dataset.status === 'faellig') btn.classList.add('btn-outline-warning');
      else if (btn.dataset.status === 'gemahnt') btn.classList.add('btn-outline-warning');
      else if (btn.dataset.status === 'bezahlt') btn.classList.add('btn-outline-success');
      else btn.classList.add('btn-outline-secondary');
    }
  });

  // Sync KPI Cards Active State
  document.querySelectorAll('.rn-kpi-clickable').forEach(card => {
    const cardStatus = card.dataset.kpiStatus;
    card.classList.toggle('rn-kpi-active', cardStatus === val || (cardStatus === 'offen' && val === 'faellig'));
  });

  if (typeof rnRenderTable === 'function') {
    rnRenderTable();
  }
};

// Klick auf KPI-Kachel toggelt den Status-Filter
window.rnToggleFilterKpi = function(targetStatus) {
  if (window._invoicesFilterStatus === targetStatus && targetStatus !== 'alle') {
    rnChangeFilterStatus('alle');
  } else {
    rnChangeFilterStatus(targetStatus);
  }
};

// Direktsprung von gesperrter Jahresbeitrag-Rechnung in Schnellerfassung
window.rnJumpToJahresbeitrag = function(personNumber) {
  if (personNumber) {
    window._jbSelectedMemberPN = String(personNumber).trim();
  }
  if (typeof navTo === 'function') {
    navTo('jahresbeitrag');
  }
  if (typeof jbSwitchTab === 'function') {
    jbSwitchTab('entry');
  }
};

window.rnChangeFilterType = function(val) {
  window._invoicesFilterType = val;
  if (typeof rnRenderTable === 'function') {
    rnRenderTable();
  }
};

// Sortierung anwenden
window.rnSortInvoices = function(col) {
  if (window._invoicesSearchCol === col) {
    window._invoicesSearchAsc = !window._invoicesSearchAsc;
  } else {
    window._invoicesSearchCol = col;
    window._invoicesSearchAsc = true;
  }
  rnRenderTable();
};

// Live Filter & Draw Table
window.rnFilterInvoices = function() {
  rnRenderTable();
};

// Sort Indicator
window.rnGetSortIndicator = function(targetCol) {
  const col = window._invoicesSearchCol;
  const asc = window._invoicesSearchAsc;
  if (col !== targetCol) return '<i class="fas fa-sort text-muted ms-1 small opacity-50"></i>';
  return asc ? '<i class="fas fa-sort-up text-primary ms-1"></i>' : '<i class="fas fa-sort-down text-primary ms-1"></i>';
};

/**
 * Ermittelt die Empfängerdaten (Name, Adresse, E-Mail) einer Rechnung,
 * unabhängig davon, ob es sich um ein Vereinsmitglied oder einen externen Kontakt handelt.
 */
window.rnGetRecipientForInvoice = function(inv) {
  if (!inv) return { vorname: '', nachname: '', strasse: '', plz: '', ort: '', email: '' };

  const isMember = inv.PersonNumber && !String(inv.PersonNumber).startsWith('EXT');
  if (isMember) {
    let members = window._mglData || [];
    if (members.length === 0 && window.AppCache) {
      const cached = window.AppCache.get('mitglieder');
      if (cached && Array.isArray(cached.data)) members = cached.data;
    }
    const m = members.find(x => String(x.PersonNumber) === String(inv.PersonNumber)) 
           || (window._jbMemberMap && window._jbMemberMap[String(inv.PersonNumber)]) 
           || {};
    const firstName = m.FirstName || (inv.name ? inv.name.split(' ')[0] : '');
    const lastName = m.LastName || (inv.name ? inv.name.split(' ').slice(1).join(' ') : '');
    return {
      vorname: firstName || '',
      nachname: lastName || '',
      strasse: m.Street || m.Strasse || '',
      plz: String(m.PostCode || m.ZipCode || m.PLZ || ''),
      ort: m.City || m.Ort || '',
      email: m.PrimaryEmail || m.Email || ''
    };
  }

  // Externer Kontakt
  const extId = String(inv.PersonNumber || '').replace('EXT-', '').replace('EXT:', '').trim();
  let contact = null;
  const contacts = window._externalContacts || [];
  if (extId) {
    contact = contacts.find(c => String(c.id).trim() === extId);
  }
  if (!contact && inv.name) {
    contact = contacts.find(c => {
      const matchName = String(c.firma || c.name || (c.vorname ? c.vorname + ' ' + c.nachname : '')).trim().toLowerCase();
      return matchName === String(inv.name || '').trim().toLowerCase();
    });
  }

  if (contact) {
    const isFirma = contact.typ === 'firma' || Boolean(contact.firma) || Boolean(contact.name && contact.name.match(/\b(AG|GmbH|Genossenschaft|Verein|Verband|Stiftung|Gemeinde)\b/i));
    return {
      id: contact.id,
      typ: contact.typ || (isFirma ? 'firma' : 'privat'),
      kategorie: contact.kategorie || (isFirma ? 'Firma' : 'Privat'),
      firma: contact.firma || (isFirma ? (contact.name || inv.name) : '') || '',
      abteilung: contact.abteilung || '',
      anrede: contact.anrede || '',
      vorname: contact.vorname || '',
      nachname: contact.nachname || '',
      name: isFirma ? (contact.firma || contact.name || inv.name) : ((contact.vorname || '') + ' ' + (contact.nachname || '')).trim() || contact.name || inv.name,
      strasse: contact.strasse || '',
      adresszusatz: contact.adresszusatz || '',
      plz: String(contact.plz || ''),
      ort: contact.ort || '',
      land: contact.land || 'CH',
      email: contact.email || '',
      telefon: contact.telefon || '',
      bemerkungen: contact.bemerkungen || ''
    };
  }

  const rawName = String(inv.name || '').trim();
  const isFirma = Boolean(rawName && rawName.match(/\b(AG|GmbH|Genossenschaft|Verein|Verband|Stiftung|Gemeinde)\b/i));
  const nameParts = rawName.split(/\s+/);
  const vorname = !isFirma && nameParts.length > 1 ? nameParts[0] : (isFirma ? '' : rawName);
  const nachname = !isFirma && nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  return {
    id: extId || '',
    typ: isFirma ? 'firma' : 'privat',
    kategorie: isFirma ? 'Firma' : 'Privat',
    firma: isFirma ? rawName : '',
    abteilung: '',
    anrede: '',
    vorname: vorname || '',
    nachname: nachname || '',
    name: rawName,
    strasse: '',
    adresszusatz: '',
    plz: '',
    ort: '',
    land: 'CH',
    email: '',
    telefon: '',
    bemerkungen: ''
  };
};

/**
 * Gibt den formatierten Anzeigenamen eines externen Kontakts zurück.
 */
window.rnGetContactDisplayName = function(c) {
  if (!c) return '';
  if (c.typ === 'firma' || c.firma) {
    const contactPerson = [c.anrede, c.vorname, c.nachname].filter(Boolean).join(' ');
    return c.firma + (contactPerson ? ` (${contactPerson})` : '');
  }
  if (c.nachname || c.vorname) {
    return [c.nachname, c.vorname].filter(Boolean).join(' ');
  }
  return c.name || `Kontakt #${c.id}`;
};

/**
 * Ermittelt die Absenderdaten für Rechnungen & Mails basierend auf dem aktuell eingeloggten Benutzer.
 * 1. Anhand Anzeigename wird der Abgleich mit der Mitglieder-DB gemacht (auch E-Mail von dort).
 * 2. Als Rolle / Funktion wird 'Rolle_extern' aus login_daten hinterlegt.
 * 3. Fallback wenn nichts gefunden wird:
 *    Sportschützen Muhen, 5037 Muhen, sportschuetzen.muhen@gmail.com (Gruss: Sportschützen Muhen / Vorstand)
 */
window.rnGetLoggedInSender = function(invoiceType = null) {
  const loggedInName = String(window.currentUser || localStorage.getItem('portal_user') || '').trim();
  const loggedInRoleExtern = String(localStorage.getItem('portal_rolle_extern') || '').trim();

  // Standard-Fallback laut Anforderung
  const fallbackSender = {
    verein:   'Sportschützen Muhen',
    vorname:  '',
    nachname: '',
    strasse:  '',
    plz:      '5037',
    ort:      'Muhen',
    mobil:    '',
    email:    'sportschuetzen.muhen@gmail.com',
    funktion: 'Vorstand'
  };

  if (!loggedInName) {
    return fallbackSender;
  }

  // Mitgliederliste laden (RAM oder AppCache)
  let members = window._mglData || [];
  if (members.length === 0 && window.AppCache) {
    const cached = window.AppCache.get('mitglieder');
    if (cached && Array.isArray(cached.data)) members = cached.data;
  }

  // Abgleich mit Mitglieder-DB: Primär über PersonNumber, Fallback über Anzeigenamen
  const loggedInPN = String(localStorage.getItem('portal_personnumber') || '').trim();
  let member = null;
  if (loggedInPN) {
    member = members.find(m => String(m.PersonNumber || '').trim() === loggedInPN);
  }
  if (!member) {
    const cleanLogin = loggedInName.toLowerCase();
    member = members.find(m => {
      const fn = String(m.FirstName || '').trim().toLowerCase();
      const ln = String(m.LastName || '').trim().toLowerCase();
      return `${fn} ${ln}` === cleanLogin || `${ln} ${fn}` === cleanLogin || fn === cleanLogin || ln === cleanLogin;
    });
  }

  if (member) {
    return {
      verein:   'Sportschützen Muhen',
      vorname:  member.FirstName || '',
      nachname: member.LastName || '',
      strasse:  member.Street || member.Strasse || '',
      plz:      String(member.PostCode || member.ZipCode || member.PLZ || '5037'),
      ort:      member.City || member.Ort || 'Muhen',
      mobil:    member.PrivateMobilePhone || member.BusinessMobilePhone || '',
      email:    member.PrimaryEmail || member.Email || 'sportschuetzen.muhen@gmail.com',
      funktion: loggedInRoleExtern || 'Vorstand'
    };
  }

  // Falls der Name Daniel Hunziker ist und Mitgliederdaten noch nicht geladen waren
  if (cleanLogin.includes('hunziker') && cleanLogin.includes('daniel')) {
    return {
      verein:   'Sportschützen Muhen',
      vorname:  'Daniel',
      nachname: 'Hunziker',
      strasse:  'Rebweg 12',
      plz:      '5101',
      ort:      'Hunzenschwil',
      mobil:    '+41 79 578 51 68',
      email:    'dan.hunziker@me.com',
      funktion: loggedInRoleExtern || 'Vizepräsident'
    };
  }

  // Falls nicht in Mitglieder-DB gematcht werden konnte: Verwende Fallback
  return fallbackSender;
};
