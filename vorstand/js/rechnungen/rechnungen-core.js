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
    source_module: r.source_module || 'manuell',
    source_id: r.source_id || '',
    recipient_address: r.recipient_address || {},
    sender_address: r.sender_address || {},
    status: r.status || 'offen',
    total_amount: Number(r.total_amount || 0),
    open_amount: (r.open_amount !== undefined && r.open_amount !== null) ? Number(r.open_amount) : Number(r.total_amount || 0),
    due_date: r.due_date ? rnFmtSwissDate(r.due_date) : '',
    raw_due_date: r.due_date || '',
    currency: r.currency || 'CHF',
    cancel_reason: r.cancel_reason || '',
    cancelled_at: r.cancelled_at ? rnFmtSwissDate(r.cancelled_at) : '',
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
  const isF = r.typ === 'firma' || Boolean(r.firma);
  const derivedName = isF ? (r.firma || r.name || '') : ([r.vorname, r.nachname].filter(Boolean).join(' ') || r.name || '');
  return {
    id: r.id,
    typ: r.typ || 'privat',
    kategorie: r.kategorie || '',
    firma: r.firma || '',
    abteilung: r.abteilung || '',
    anrede: r.anrede || '',
    vorname: r.vorname || '',
    nachname: r.nachname || '',
    name: derivedName,
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
          if (item.type) {
            map[item.type] = item;
            const capKey = item.type.charAt(0).toUpperCase() + item.type.slice(1);
            map[capKey] = item;
            // Aliase für konsistentes Type-Mapping
            if (item.type === 'depot_pfand') {
              map['Depot / Pfand'] = item;
              map['depot / pfand'] = item;
            } else if (item.type === 'materialverkauf') {
              map['Materialverkauf'] = item;
              map['Material- & Kleiderbezug'] = item;
            } else if (item.type === 'jahresbeitrag') {
              map['Jahresbeitrag'] = item;
            } else if (item.type === 'vermietung') {
              map['Vermietung'] = item;
            }
          }
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
    const fullName = `${firstName} ${lastName}`.trim() || inv.name || '';
    const salutation = m.Salutation || m.salutation || '';
    return {
      type: 'mitglied',
      typ: 'privat',
      person_number: m.PersonNumber || inv.PersonNumber,
      anrede: salutation,
      salutation: salutation,
      vorname: firstName || '',
      nachname: lastName || '',
      name: fullName,
      firma: '',
      strasse: m.Street || m.Strasse || '',
      plz: String(m.PostCode || m.ZipCode || m.PLZ || ''),
      ort: m.City || m.Ort || '',
      land: m.Country || m.country || 'Schweiz',
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
    funktion: 'Vorstand',
    bereich:  invoiceType || 'Rechnung'
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
    member = members.find(m => String(m.PersonNumber || m.person_number || '').trim() === loggedInPN);
  }
  const cleanLogin = loggedInName.toLowerCase();
  if (!member) {
    member = members.find(m => {
      const fn = String(m.FirstName || m.first_name || '').trim().toLowerCase();
      const ln = String(m.LastName || m.last_name || '').trim().toLowerCase();
      return `${fn} ${ln}` === cleanLogin || `${ln} ${fn}` === cleanLogin || fn === cleanLogin || ln === cleanLogin;
    });
  }

  if (member) {
    const rawEmails = [
      member.AdditionalEmail, member.additional_email,
      localStorage.getItem('portal_user_email'),
      member.PrimaryEmail, member.primary_email, member.Email
    ].filter(Boolean).map(e => String(e).trim()).filter(e => e.includes('@'));

    // Persönliche Mail bevorzugen (falls vorhanden ungleich allgemeine Vereinsmail)
    const personalSenderEmail = rawEmails.find(e => !e.toLowerCase().includes('sportschuetzen.muhen@gmail.com')) 
      || rawEmails[0] 
      || 'sportschuetzen.muhen@gmail.com';

    return {
      verein:   'Sportschützen Muhen',
      vorname:  member.FirstName || member.first_name || '',
      nachname: member.LastName || member.last_name || '',
      strasse:  member.Street || member.street || member.Strasse || '',
      plz:      String(member.PostCode || member.post_code || member.ZipCode || member.PLZ || '5037'),
      ort:      member.City || member.city || member.Ort || 'Muhen',
      mobil:    member.PrivateMobilePhone || member.private_mobile_phone || member.BusinessMobilePhone || member.business_mobile_phone || '',
      email:    personalSenderEmail,
      funktion: loggedInRoleExtern || 'Vorstand',
      bereich:  invoiceType || 'Rechnung'
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
      funktion: loggedInRoleExtern || 'Vizepräsident',
      bereich:  invoiceType || 'Rechnung'
    };
  }

  // Falls nicht in Mitglieder-DB gematcht werden konnte: Verwende Fallback
  return fallbackSender;
};

// =====================================================================
// ZENTRALER SERVICE: RechnungsCore (Harmonisierung & Entkopplung)
// =====================================================================
/**
 * RechnungsCore: Verbindliche Schnittstelle für alle Vereinsmodule
 * (Inventar, Vermietung, Jahresbeitrag, Sponsoring, Manuell)
 *
 * Verantwortlichkeiten:
 * 1. Rechnungs-Lifecycle (entwurf -> gestellt/offen -> teilbezahlt -> bezahlt -> storniert)
 * 2. Unveränderlicher Adress- und Positions-Snapshot
 * 3. Nummernkreisvergabe (CAMT-konform)
 * 4. Zahlungsverkehr & Teilzahlungen (invoice_payments)
 * 5. Buchungsanschluss an doppelte Buchhaltung (accounting_journal)
 * 6. Entkopplung von Fachmodulen (Fachmodule kennen nur InvoiceOrder)
 */
window.RechnungsCore = {
  /**
   * Validiert ein InvoiceOrder-Payload nach dem zentralen Datenvertrag
   * @param {Object} order
   * @throws {Error} wenn Pflichtfelder fehlen
   */
  validateOrder(order) {
    if (!order || typeof order !== 'object') {
      throw new Error("Rechnungsauftrag (InvoiceOrder) fehlt oder ist ungültig.");
    }
    if (!order.recipient || typeof order.recipient !== 'object') {
      throw new Error("Empfängerdaten (recipient) fehlen im Rechnungsauftrag.");
    }
    const name = order.recipient.name || 
      [order.recipient.firstName || order.recipient.vorname, order.recipient.lastName || order.recipient.nachname].filter(Boolean).join(' ').trim() || 
      order.recipient.firma;
    if (!name) {
      throw new Error("Empfängername oder Vor-/Nachname/Firma ist zwingend erforderlich.");
    }
    if (!Array.isArray(order.positions) || order.positions.length === 0) {
      throw new Error("Rechnung muss mindestens eine gültige Position enthalten.");
    }
    for (let i = 0; i < order.positions.length; i++) {
      const p = order.positions[i];
      const desc = p.title || p.description;
      if (!desc) {
        throw new Error(`Position #${i + 1}: Beschreibung/Titel fehlt.`);
      }
      const qty = Number(p.quantity !== undefined ? p.quantity : 1);
      const price = Number(p.unitPrice !== undefined ? p.unitPrice : 0);
      if (isNaN(qty) || qty <= 0) {
        throw new Error(`Position #${i + 1}: Menge muss eine Zahl grösser als 0 sein.`);
      }
      if (isNaN(price)) {
        throw new Error(`Position #${i + 1}: Einzelpreis ist ungültig.`);
      }
    }
    return true;
  },

  /**
   * Berechnet Hilfsdaten (Totals, standardisierte Positionsobjekte)
   * @param {Array} rawPositions
   */
  calculateTotals(rawPositions) {
    let total = 0;
    const computedPositions = rawPositions.map((p, idx) => {
      const qty = Number(p.quantity !== undefined ? p.quantity : 1);
      const unitPrice = Number(p.unitPrice !== undefined ? p.unitPrice : 0);
      const amount = (p.amount !== undefined && p.amount !== null && !isNaN(Number(p.amount)))
        ? Number(p.amount)
        : Number((qty * unitPrice).toFixed(2));
      total += amount;
      return {
        position_nr: p.positionNr || (idx + 1),
        description: (p.title || p.description || '').trim(),
        quantity: qty,
        unit_price: unitPrice,
        amount: amount,
        konto: String(p.accountHaben || p.konto || p.account || '3000').trim(),
        type: p.type || 'standard',
        source_field: p.sourceField || null
      };
    });
    return {
      totalAmount: Number(total.toFixed(2)),
      positions: computedPositions
    };
  },

  /**
   * Löst die Absenderdaten für einen Rechnungsauftrag auf.
   * - Primär: Aktuell angemeldete Person (vollständig aus Stammdaten ermittelt).
   * - Sekundär: Übersteuert durch senderInput (explizites Objekt, personNumber/memberId oder Teildaten wie bereich/funktion).
   * @param {Object|null} senderInput
   * @param {string|null} invoiceType
   * @returns {Promise<Object>}
   */
  async resolveSender(senderInput = null, invoiceType = null) {
    // 1. Primärer Standard: Eingeloggte Person
    const primary = (typeof window.rnGetLoggedInSender === 'function')
      ? window.rnGetLoggedInSender(invoiceType)
      : {
          verein: 'Sportschützen Muhen',
          vorname: '', nachname: '', strasse: '', plz: '5037', ort: 'Muhen',
          mobil: '', email: 'sportschuetzen.muhen@gmail.com', funktion: 'Vorstand', bereich: invoiceType || 'Rechnung'
        };

    if (!senderInput || typeof senderInput !== 'object' || Object.keys(senderInput).length === 0) {
      return primary;
    }

    // 2. Sekundär: Falls senderInput eine personNumber oder memberId mitgibt
    let resolvedSecondary = null;
    const targetPN = senderInput.personNumber || senderInput.PersonNumber || senderInput.person_number;
    const targetId = senderInput.memberId || senderInput.id;

    if (targetPN || targetId) {
      let members = window._mglData || [];
      if (members.length === 0 && window.AppCache) {
        const cached = window.AppCache.get('mitglieder');
        if (cached && Array.isArray(cached.data)) members = cached.data;
      }
      let found = null;
      if (targetPN) {
        found = members.find(m => String(m.PersonNumber || m.person_number || '').trim() === String(targetPN).trim());
      }
      if (!found && targetId) {
        found = members.find(m => String(m.id || m.member_id || '').trim() === String(targetId).trim());
      }
      // Falls nicht im Cache gefunden, direkt aus Supabase nachladen
      if (!found) {
        const supa = getRechnungenSupabaseClient();
        if (supa) {
          try {
            let q = supa.from('members').select('*');
            if (targetPN) q = q.eq('person_number', targetPN);
            else if (targetId) q = q.eq('id', targetId);
            const { data } = await q.maybeSingle();
            if (data) found = data;
          } catch (_) {}
        }
      }

      if (found) {
        resolvedSecondary = {
          verein: 'Sportschützen Muhen',
          vorname: found.first_name || found.FirstName || '',
          nachname: found.last_name || found.LastName || '',
          strasse: found.street || found.Street || found.Strasse || '',
          plz: String(found.post_code || found.PostCode || found.ZipCode || found.PLZ || '5037'),
          ort: found.city || found.City || found.Ort || 'Muhen',
          mobil: found.private_mobile_phone || found.PrivateMobilePhone || found.business_mobile_phone || found.BusinessMobilePhone || '',
          email: found.primary_email || found.PrimaryEmail || found.Email || 'sportschuetzen.muhen@gmail.com',
          funktion: senderInput.funktion || found.function || 'Vorstand',
          bereich: senderInput.bereich || invoiceType || 'Rechnung'
        };
      }
    }

    // 3. Mergen: Falls senderInput explizite Kontaktdaten enthält oder nur Teildaten (z.B. nur bereich)
    const base = resolvedSecondary || primary;
    return {
      verein: senderInput.verein || base.verein || 'Sportschützen Muhen',
      vorname: senderInput.vorname !== undefined ? senderInput.vorname : base.vorname,
      nachname: senderInput.nachname !== undefined ? senderInput.nachname : base.nachname,
      strasse: senderInput.strasse !== undefined ? senderInput.strasse : base.strasse,
      plz: String(senderInput.plz !== undefined ? senderInput.plz : base.plz || '5037'),
      ort: senderInput.ort !== undefined ? senderInput.ort : base.ort || 'Muhen',
      mobil: senderInput.mobil !== undefined ? senderInput.mobil : base.mobil,
      email: senderInput.email !== undefined ? senderInput.email : base.email,
      funktion: senderInput.funktion || base.funktion || 'Vorstand',
      bereich: senderInput.bereich || base.bereich || invoiceType || 'Rechnung'
    };
  },

  /**
   * Holt die nächste atomare Rechnungsnummer aus PostgreSQL via Sequence
   * @param {string} prefix - z. B. 'RE', 'MV', 'VM', 'JB'
   * @param {number|string} [year] - Rechnungsjahr
   * @returns {Promise<string>}
   */
  async fetchNextInvoiceNumber(prefix = 'RE', year = null) {
    const supa = getRechnungenSupabaseClient();
    const y = Number(year || window._bhYear || new Date().getFullYear());
    if (supa) {
      try {
        const { data: seqId, error: seqErr } = await supa.rpc('next_invoice_number', { p_prefix: prefix, p_year: y });
        if (!seqErr && seqId) {
          return seqId;
        }
        if (seqErr) {
          console.warn("⚠️ [RechnungsCore] RPC next_invoice_number fehlgeschlagen:", seqErr);
        }
      } catch (err) {
        console.warn("⚠️ [RechnungsCore] Fehler beim Aufruf von next_invoice_number:", err);
      }
    }
    return window.generateSafeInvoiceId(prefix, y);
  },

  /**
   * 1. RECHNUNG ERSTELLEN (Lifecycle: Status 'entwurf' oder bei autoIssue 'offen')
   * @param {Object} order - Typisiertes InvoiceOrder Payload
   * @returns {Promise<{success: boolean, invoice: Object, positions: Array}>}
   */
  async createInvoice(order) {
    this.validateOrder(order);
    const supa = getRechnungenSupabaseClient();
    if (!supa) {
      throw new Error("Supabase Client ist nicht initialisiert. Rechnung kann nicht angelegt werden.");
    }

    const sourceModule = (order.source && order.source.module) ? String(order.source.module).toLowerCase() : 'manuell';
    const sourceId = (order.source && order.source.entityId) ? String(order.source.entityId) : null;
    const year = Number(order.year || new Date().getFullYear());

    // CAMT-konformes Präfix je nach Quellmodul / Vorgangstyp
    let prefix = order.prefix ? String(order.prefix).toUpperCase().trim() : null;
    if (!prefix) {
      const orderTypeLower = String(order.type || '').toLowerCase();
      if (orderTypeLower.includes('depot') || orderTypeLower.includes('pfand') || orderTypeLower.includes('kaution')) {
        prefix = 'DP';
      } else if (sourceModule === 'inventar') {
        prefix = 'MV';
      } else if (sourceModule === 'vermietung') {
        prefix = 'VM';
      } else if (sourceModule === 'jahresbeitrag') {
        prefix = 'JB';
      } else if (sourceModule === 'sponsoring') {
        prefix = 'SP';
      } else {
        prefix = 'RE';
      }
    }

    // Atomare Rechnungsnummernvergabe direkt via PostgreSQL Sequence (Schutz vor Race Conditions)
    let invoiceId = order.id || order.invoice_number;
    if (!invoiceId) {
      try {
        const { data: seqId, error: seqErr } = await supa.rpc('next_invoice_number', { p_prefix: prefix, p_year: year });
        if (!seqErr && seqId) {
          invoiceId = seqId;
        } else {
          console.warn("⚠️ [RechnungsCore] RPC next_invoice_number nicht verfügbar, nutze lokales Fallback:", seqErr);
          invoiceId = window.generateSafeInvoiceId(prefix, year);
        }
      } catch (err) {
        console.warn("⚠️ [RechnungsCore] Fehler beim RPC next_invoice_number:", err);
        invoiceId = window.generateSafeInvoiceId(prefix, year);
      }
    }

    // Totale & Positionen berechnen
    const { totalAmount, positions } = this.calculateTotals(order.positions);

    // Fälligkeit festlegen
    const issueDate = order.issueDate || new Date().toISOString().split('T')[0];
    const dueDays = Number(order.dueDays || 30);
    let dueDate = order.dueDate;
    if (!dueDate) {
      const d = new Date(issueDate);
      d.setDate(d.getDate() + dueDays);
      dueDate = d.toISOString().split('T')[0];
    }

    // Empfänger-Snapshot festschreiben (Schutz vor nachträglichen Adressänderungen)
    const rec = order.recipient;
    const recipientName = rec.name || 
      [rec.firstName || rec.vorname, rec.lastName || rec.nachname].filter(Boolean).join(' ').trim() || 
      rec.firma || 'Unbekannt';

    let recAnrede = rec.anrede || rec.salutation || '';
    let recStreet = rec.street || rec.strasse || '';
    let recZip = String(rec.zip || rec.plz || '');
    let recCity = rec.city || rec.ort || '';
    let recEmail = rec.email || '';
    let recPhone = rec.phone || rec.telefon || '';
    const targetPN = rec.personNumber || rec.PersonNumber || null;
    const targetMId = rec.memberId || rec.mitgliedId || null;

    // Falls Adresse oder Anrede unvollständig, automatisch aus members nachladen
    if ((!recStreet || !recZip || !recAnrede) && (targetPN || targetMId)) {
      try {
        let members = window._mglData || [];
        if (members.length === 0 && window.AppCache) {
          const cached = window.AppCache.get('mitglieder');
          if (cached && Array.isArray(cached.data)) members = cached.data;
        }
        let found = members.find(m => (targetPN && String(m.PersonNumber || m.person_number || '').trim() === String(targetPN).trim()) ||
                                      (targetMId && String(m.ID || m.id || m.member_id || '').trim() === String(targetMId).trim()));
        if (!found && supa) {
          let q = supa.from('members').select('*');
          if (targetPN) q = q.eq('person_number', targetPN);
          else if (targetMId) q = q.eq('person_number', targetMId);
          const { data: dbM } = await q.maybeSingle();
          if (dbM) found = dbM;
        }
        if (found) {
          if (!recAnrede) recAnrede = found.salutation || found.Salutation || '';
          if (!recStreet) recStreet = found.street || found.Street || found.Strasse || '';
          if (!recZip) recZip = String(found.post_code || found.PostCode || found.PLZ || '');
          if (!recCity) recCity = found.city || found.City || found.Ort || '';
          if (!recEmail) recEmail = found.primary_email || found.PrimaryEmail || '';
          if (!recPhone) recPhone = found.private_mobile_phone || found.PrivateMobilePhone || '';
        }
      } catch (mErr) {
        console.warn("⚠️ [RechnungsCore] Adress-Nachladung fehlgeschlagen:", mErr);
      }
    }

    const recipientSnapshot = {
      type: rec.type || (rec.memberId ? 'mitglied' : (rec.firma ? 'firma' : 'extern')),
      anrede: recAnrede,
      salutation: recAnrede,
      name: recipientName,
      first_name: rec.firstName || rec.vorname || '',
      last_name: rec.lastName || rec.nachname || '',
      vorname: rec.firstName || rec.vorname || '',
      nachname: rec.lastName || rec.nachname || '',
      firma: rec.firma || '',
      contact_person: rec.contactPerson || rec.kontaktperson || '',
      street: recStreet,
      strasse: recStreet,
      zip: recZip,
      plz: recZip,
      city: recCity,
      ort: recCity,
      country: rec.country || rec.land || 'Schweiz',
      land: rec.country || rec.land || 'Schweiz',
      email: recEmail,
      phone: recPhone,
      member_id: targetMId,
      contact_id: rec.contactId || null,
      person_number: targetPN
    };

    const initialStatus = (order.options && order.options.autoIssue) ? 'offen' : 'entwurf';
    const nowIso = new Date().toISOString();

    const invoiceType = order.type || (sourceModule === 'inventar' ? 'Materialverkauf' : (sourceModule === 'vermietung' ? 'Vermietung' : (sourceModule === 'jahresbeitrag' ? 'Jahresbeitrag' : 'Sonstige')));
    const senderSnapshot = await this.resolveSender(order.sender, invoiceType);

    const invoiceRow = {
      id: invoiceId,
      person_number: recipientSnapshot.person_number ? String(recipientSnapshot.person_number) : (recipientSnapshot.member_id ? String(recipientSnapshot.member_id) : null),
      recipient_name: recipientName,
      year: year,
      type: invoiceType,
      source_module: sourceModule,
      source_id: sourceId,
      recipient_address: recipientSnapshot,
      sender_address: senderSnapshot,
      status: initialStatus,
      total_amount: totalAmount,
      open_amount: totalAmount,
      due_date: dueDate,
      currency: order.currency || 'CHF',
      notes: order.notes || null,
      mail_status: 'entwurf',
      created_at: nowIso,
      updated_at: nowIso
    };

    // 1. Supabase Insert: Invoice
    const { data: invData, error: invErr } = await supa
      .from('invoices')
      .insert([invoiceRow])
      .select()
      .single();

    if (invErr) {
      console.error("❌ [RechnungsCore] Fehler beim Anlegen der Rechnung in Supabase:", invErr);
      throw new Error(`Rechnung konnte nicht angelegt werden: ${invErr.message}`);
    }

    // 2. Supabase Insert: Positions
    const posRows = positions.map(p => ({
      invoice_id: invoiceId,
      position_nr: p.position_nr,
      description: p.description,
      quantity: p.quantity,
      unit_price: p.unit_price,
      amount: p.amount,
      konto: p.konto,
      type: p.type,
      source_field: p.source_field
    }));

    const { data: posData, error: posErr } = await supa
      .from('invoice_positions')
      .insert(posRows)
      .select();

    if (posErr) {
      console.error("❌ [RechnungsCore] Fehler beim Anlegen der Rechnungspositionen:", posErr);
      // Rollback Kopfzeile
      await supa.from('invoices').delete().eq('id', invoiceId);
      throw new Error(`Rechnungspositionen konnten nicht gespeichert werden: ${posErr.message}`);
    }

    const createdInvoice = mapInvoiceFromSupabase(invData || invoiceRow, { [invoiceId]: (posData || posRows).map(mapPositionFromSupabase) });

    // Lokalen RAM-Cache aktualisieren
    if (Array.isArray(window._invoices)) {
      window._invoices.unshift(createdInvoice);
      if (typeof window.renderRechnungen === 'function') {
        window.renderRechnungen();
      }
    }

    return {
      success: true,
      invoice: createdInvoice,
      positions: posData || posRows
    };
  },

  /**
   * 2. RECHNUNG FESTSCHREIBEN / STELLEN (Lifecycle: 'entwurf' -> 'offen')
   * Macht die Rechnung unveränderlich für den Empfängerversand
   * @param {string} invoiceId
   * @returns {Promise<{success: boolean, status: string, invoice: Object}>}
   */
  async issueInvoice(invoiceId) {
    const supa = getRechnungenSupabaseClient();
    if (!supa) throw new Error("Supabase Client nicht verfügbar.");

    const nowIso = new Date().toISOString();
    const { data, error } = await supa
      .from('invoices')
      .update({
        status: 'offen',
        updated_at: nowIso
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) {
      throw new Error(`Rechnung ${invoiceId} konnte nicht gestellt werden: ${error.message}`);
    }

    // Cache synchronisieren
    const cached = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
    if (cached) {
      cached.status = 'offen';
      cached.updated_at = rnFmtSwissDate(nowIso);
      if (typeof window.renderRechnungen === 'function') window.renderRechnungen();
    }

    return { success: true, status: 'offen', invoice: data };
  },

  /**
   * 3. ZAHLUNGSERFASSUNG (Lifecycle & Buchungssatz)
   * Saubere Trennung:
   *  - Rechnung (Forderung)
   *  - Zahlung (invoice_payments)
   *  - FiBu (accounting_journal)
   * Unterstützt Vollzahlung, Teilzahlung, Bar, TWINT, Bank und CAMT.054
   * @param {string} invoiceId
   * @param {Object} paymentInput
   * @returns {Promise<{success: boolean, paymentId: string, status: string, openAmount: number, journalId: number|null}>}
   */
  async recordPayment(invoiceId, paymentInput) {
    const supa = getRechnungenSupabaseClient();
    if (!supa) throw new Error("Supabase Client nicht verfügbar.");

    const amount = Number(paymentInput.amount);
    if (isNaN(amount) || amount <= 0) {
      throw new Error(`Ungültiger Zahlungsbetrag: ${paymentInput.amount}`);
    }

    const payDate = paymentInput.paymentDate || new Date().toISOString().split('T')[0];
    const payMethod = paymentInput.paymentMethod || 'Bank';
    const docRef = paymentInput.documentRef || `ZAL-${invoiceId}`;
    const syncFibu = paymentInput.syncBookkeeping !== false;

    // A. Versuche primär die atomare RPC-Funktion record_invoice_payment
    try {
      const { data: rpcRes, error: rpcErr } = await supa.rpc('record_invoice_payment', {
        p_invoice_id: invoiceId,
        p_amount: amount,
        p_payment_date: payDate,
        p_payment_method: payMethod,
        p_document_ref: docRef,
        p_notes: paymentInput.notes || null,
        p_sync_fibu: syncFibu,
        p_soll_konto: paymentInput.sollKonto || null,
        p_haben_konto: paymentInput.habenKonto || null
      });

      if (!rpcErr && rpcRes && rpcRes.success) {
        // Lokalen Cache aktualisieren
        const cached = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
        if (cached) {
          cached.status = rpcRes.status;
          cached.open_amount = Number(rpcRes.open_amount || 0);
          cached.payment_date = payDate;
          cached.payment_method = payMethod;
          cached.document_ref = docRef;
          if (typeof window.renderRechnungen === 'function') window.renderRechnungen();
        }
        return {
          success: true,
          paymentId: rpcRes.payment_id,
          status: rpcRes.status,
          openAmount: Number(rpcRes.open_amount || 0),
          journalId: rpcRes.journal_entry_id
        };
      }
      if (rpcErr) {
        console.warn("[RechnungsCore] RPC record_invoice_payment Rückmeldung:", rpcErr.message);
      }
    } catch (rpcEx) {
      console.warn("[RechnungsCore] RPC Ausführung fehlgeschlagen, nutze REST Ablauf:", rpcEx);
    }

    // B. Robuster REST-Ablauf
    const { data: inv, error: invErr } = await supa.from('invoices').select('*').eq('id', invoiceId).single();
    if (invErr || !inv) throw new Error(`Rechnung ${invoiceId} nicht gefunden.`);
    if (inv.status === 'storniert') throw new Error(`Rechnung ${invoiceId} ist storniert und kann keine Zahlungen empfangen.`);

    let journalId = null;

    // 1. FiBu Buchungssatz anlegen
    if (syncFibu) {
      let sollKonto = paymentInput.sollKonto;
      if (!sollKonto) {
        const m = payMethod.toLowerCase();
        sollKonto = (m.includes('bar') || m.includes('kasse')) ? '1000' : '1020';
      }
      let habenKonto = paymentInput.habenKonto;
      if (!habenKonto) {
        const { data: pos } = await supa.from('invoice_positions').select('konto').eq('invoice_id', invoiceId).limit(1);
        habenKonto = (pos && pos[0] && pos[0].konto) ? pos[0].konto : '3400';
      }
      const payYear = new Date(payDate).getFullYear() || new Date().getFullYear();
      const { data: jData, error: jErr } = await supa.from('accounting_journal').insert([{
        jahr: payYear,
        datum: payDate,
        beleg_nr: docRef,
        beschreibung: `Zahlungseingang ${invoiceId} (${inv.recipient_name})`,
        konto_soll: sollKonto,
        konto_haben: habenKonto,
        betrag: amount,
        typ: 'Rechnung',
        buchungstyp: 'DEBITOR'
      }]).select('id').single();

      if (!jErr && jData) {
        journalId = jData.id;
      }
    }

    // 2. Zahlung eintragen (triggert Postgres Statusneuberechnung)
    const { data: payData, error: payErr } = await supa.from('invoice_payments').insert([{
      invoice_id: invoiceId,
      payment_date: payDate,
      amount: amount,
      payment_method: payMethod,
      document_ref: docRef,
      camt_entry_id: paymentInput.camtEntryId || null,
      journal_entry_id: journalId,
      notes: paymentInput.notes || null
    }]).select('id').single();

    if (payErr) {
      throw new Error(`Zahlungseintrag konnte nicht gespeichert werden: ${payErr.message}`);
    }

    // 3. Saldo und Status abfragen
    const { data: updatedInv } = await supa.from('invoices').select('status, open_amount').eq('id', invoiceId).single();
    const finalStatus = updatedInv ? updatedInv.status : 'bezahlt';
    const finalOpen = updatedInv ? Number(updatedInv.open_amount) : 0;

    const cached = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
    if (cached) {
      cached.status = finalStatus;
      cached.open_amount = finalOpen;
      cached.payment_date = payDate;
      cached.payment_method = payMethod;
      cached.document_ref = docRef;
      if (typeof window.renderRechnungen === 'function') window.renderRechnungen();
    }

    return {
      success: true,
      paymentId: payData?.id,
      status: finalStatus,
      openAmount: finalOpen,
      journalId: journalId
    };
  },

  /**
   * 4. STORNIERUNG (Revisionssicher)
   * @param {string} invoiceId
   * @param {string} reason
   * @returns {Promise<{success: boolean}>}
   */
  async cancelInvoice(invoiceId, reason = '') {
    const supa = getRechnungenSupabaseClient();
    if (!supa) throw new Error("Supabase Client nicht verfügbar.");

    const nowIso = new Date().toISOString();
    const { data, error } = await supa
      .from('invoices')
      .update({
        status: 'storniert',
        cancel_reason: reason || 'Manuell storniert',
        cancelled_at: nowIso,
        open_amount: 0.00,
        updated_at: nowIso
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) {
      throw new Error(`Rechnung ${invoiceId} konnte nicht storniert werden: ${error.message}`);
    }

    const cached = (window._invoices || []).find(i => String(i.id) === String(invoiceId));
    if (cached) {
      cached.status = 'storniert';
      cached.open_amount = 0;
      cached.cancel_reason = reason;
      cached.cancelled_at = rnFmtSwissDate(nowIso);
      if (typeof window.renderRechnungen === 'function') window.renderRechnungen();
    }

    return { success: true, invoice: data };
  },

  /**
   * 5. AGGREGIERTE RECHNUNG LADEN (Kopf + Positionen + Zahlungsverlauf)
   * @param {string} invoiceId
   */
  async getInvoice(invoiceId) {
    const supa = getRechnungenSupabaseClient();
    if (!supa) throw new Error("Supabase Client nicht verfügbar.");

    const [invRes, posRes, payRes] = await Promise.all([
      supa.from('invoices').select('*').eq('id', invoiceId).single(),
      supa.from('invoice_positions').select('*').eq('invoice_id', invoiceId).order('position_nr', { ascending: true }),
      supa.from('invoice_payments').select('*').eq('invoice_id', invoiceId).order('payment_date', { ascending: true })
    ]);

    if (invRes.error || !invRes.data) {
      throw new Error(`Rechnung ${invoiceId} nicht gefunden: ${invRes.error?.message || 'Kein Eintrag'}`);
    }

    const positions = (posRes.data || []).map(mapPositionFromSupabase);
    const payments = payRes.data || [];
    const totalPaid = payments.reduce((sum, p) => sum + Number(p.amount || 0), 0);

    const invoice = mapInvoiceFromSupabase(invRes.data, { [invoiceId]: positions });
    invoice.payments = payments;
    invoice.total_paid = Number(totalPaid.toFixed(2));
    invoice.open_amount = Number((invRes.data.open_amount !== undefined && invRes.data.open_amount !== null)
      ? invRes.data.open_amount
      : Math.max(0, invoice.total_amount - totalPaid).toFixed(2));

    return invoice;
  },

  /**
   * 6. OFFENE RECHNUNGEN ABFRAGEN
   * @param {string|null} sourceModule - z.B. 'inventar', 'vermietung'
   */
  async getOpenInvoices(sourceModule = null) {
    const supa = getRechnungenSupabaseClient();
    if (!supa) return [];
    let query = supa.from('invoices').select('*').in('status', ['offen', 'teilbezahlt', 'gemahnt']).order('due_date', { ascending: true });
    if (sourceModule) {
      query = query.eq('source_module', sourceModule);
    }
    const { data, error } = await query;
    if (error || !data) return [];
    return data.map(r => mapInvoiceFromSupabase(r));
  },

  /**
   * 7. ZAHLUNGEN ZU EINER RECHNUNG LADEN
   * @param {string} invoiceId
   */
  async getPayments(invoiceId) {
    const supa = getRechnungenSupabaseClient();
    if (!supa) return [];
    const { data, error } = await supa
      .from('invoice_payments')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('payment_date', { ascending: true });
    return data || [];
  },

  /**
   * 8. HILFSFUNKTION: Betrag Schweizer Franken formatieren
   */
  formatSwissAmount(val) {
    const num = Number(val || 0);
    return num.toLocaleString('de-CH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  },

  /**
   * 9. DOKUMENTENAUSGABE: Rechnungs-PDF & Schweizer QR-Zahlteil (SIX SPC 0200 1)
   * Das PDF ist eine reine Darstellung des Rechnungs-Aggregats.
   * @param {string} invoiceId
   * @param {Object} [customOptions]
   * @returns {Promise<{success: boolean, pdfUrl?: string, storagePath?: string, pdfBase64?: string}>}
   */
  async renderPdf(invoiceId, customOptions = {}) {
    const inv = await this.getInvoice(invoiceId);
    if (!inv) throw new Error(`Rechnung ${invoiceId} wurde nicht gefunden.`);

    const recipient = (inv.recipient_address && Object.keys(inv.recipient_address).length > 0)
      ? inv.recipient_address
      : (typeof rnGetRecipientForInvoice === 'function' ? rnGetRecipientForInvoice(inv) : {
          name: inv.name,
          strasse: '', plz: '', ort: '', email: ''
        });

    const sender = customOptions.sender || 
      (inv.sender_address && Object.keys(inv.sender_address).length > 0 ? inv.sender_address : null) || 
      (typeof rnGetLoggedInSender === 'function' ? rnGetLoggedInSender(inv.type) : null);
    const layout = customOptions.layout || (window._invoiceLayouts && window._invoiceLayouts[inv.type]) || null;

    const renderPayload = {
      action: 'generate-invoice',
      invoiceId: inv.id,
      recipient: recipient,
      sender: sender,
      layout: layout,
      positions: inv.positions,
      totalAmount: inv.total_amount,
      year: inv.year || new Date().getFullYear(),
      type: inv.type || 'Rechnung',
      ...customOptions
    };

    let result = null;
    if (typeof window.generatePdfViaEngine === 'function') {
      try {
        result = await window.generatePdfViaEngine(renderPayload);
      } catch (e) {
        console.warn("[RechnungsCore] Edge Function Fehler, versuche Browser-Fallback:", e);
      }
    }

    if (!result || !result.success) {
      if (typeof window.generatePdfClientFallback === 'function') {
        result = await window.generatePdfClientFallback(renderPayload);
      }
    }

    if (!result || !result.success) {
      throw new Error(result?.error || "PDF konnte weder serverseitig noch clientseitig erzeugt werden.");
    }

    // Storage Links an Rechnung aktualisieren
    if (result.pdfUrl || result.storagePath) {
      const supa = getRechnungenSupabaseClient();
      if (supa) {
        await supa.from('invoices').update({
          pdf_url: result.pdfUrl || null,
          pdf_storage_path: result.storagePath || null,
          updated_at: new Date().toISOString()
        }).eq('id', invoiceId);
      }
    }

    return result;
  }
};

