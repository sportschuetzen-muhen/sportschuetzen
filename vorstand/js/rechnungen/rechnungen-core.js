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

// Online/Preload Endpoint Trigger
window._invoiceTemplates = [];
window._invoiceLayouts = {};
window._externalContacts = [];
window._rechnungenActiveTab = 'archiv';

// API Endpoint to fetch external contacts
window.loadInvoiceContactsData = async function() {
  try {
    const response = await apiFetch('rechnungen', 'action=getContacts');
    const result = await response.json();
    if (result.success && result.data) {
      window._externalContacts = result.data || [];
    }
  } catch (err) {
    console.warn("⚠️ Fehler beim Abrufen der externen Kontakte:", err);
  }
};

// API Endpoint to fetch template positions
window.loadInvoiceTemplatesData = async function() {
  try {
    const response = await apiFetch('rechnungen', 'action=getTemplates');
    const result = await response.json();
    if (result.success && result.data) {
      window._invoiceTemplates = result.data || [];
      // Sync to localStorage as fallback
      localStorage.setItem('portal_invoice_templates', JSON.stringify(window._invoiceTemplates));
    } else {
      throw new Error(result.error || "GAS success was false");
    }
  } catch (err) {
    console.warn("⚠️ Fehler beim Abrufen der Standard-Positionen vom Server, benutze LocalStorage:", err);
    rnInitializeTemplates(); // Ensure localStorage has defaults
    window._invoiceTemplates = JSON.parse(localStorage.getItem('portal_invoice_templates') || '[]');
  }
};

// API Endpoint to fetch layout configuration
window.loadInvoiceLayoutsData = async function() {
  try {
    const response = await apiFetch('rechnungen', 'action=getLayouts');
    const result = await response.json();
    if (result.success && result.data) {
      const map = {};
      (result.data || []).forEach(item => {
        if (item.type) map[item.type] = item;
      });
      if (typeof rnGetDefaultLayouts === 'function') {
        window._invoiceLayouts = { ...rnGetDefaultLayouts(), ...map };
      } else {
        window._invoiceLayouts = map;
      }
      localStorage.setItem('portal_invoice_layouts', JSON.stringify(window._invoiceLayouts));
    } else {
      throw new Error(result.error || "GAS success was false");
    }
  } catch (err) {
    console.warn("⚠️ Fehler beim Abrufen der Layout-Texte vom Server, benutze LocalStorage / Defaults:", err);
    if (typeof rnGetDefaultLayouts === 'function') {
      window._invoiceLayouts = rnGetDefaultLayouts();
    }
    try {
      const stored = localStorage.getItem('portal_invoice_layouts');
      if (stored) {
        window._invoiceLayouts = { ...window._invoiceLayouts, ...JSON.parse(stored) };
      }
    } catch (_) {}
  }
};

// Online/Preload Endpoint Trigger
window.loadRechnungenData = async function(silent = false, forceReload = false) {
  const container = document.getElementById('rechnungen-container');
  const hasCachedData = window._invoices && window._invoices.length > 0;
  
  // Wenn Caches bereits geladen sind und kein forceReload erzwungen wird,
  // laden wir direkt und instant aus dem lokalen Speicher!
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
          <p class="mt-2 text-muted">Lade Rechnungen und Zahlungsdaten aus der Datenbank...</p>
        </div>`;
    }
  }

  try {
    // Parallel fetching of invoices, standard positions templates, layout configs and contacts
    const [invRes, _a, _b, _c] = await Promise.all([
      apiFetch('rechnungen', 'action=getInvoices'),
      loadInvoiceTemplatesData(),
      loadInvoiceLayoutsData(),
      loadInvoiceContactsData()
    ]);
    
    // Mitgliederdaten im Hintergrund laden für Adress- und Absenderabgleich, falls noch nicht im RAM
    if ((!window._mglData || window._mglData.length === 0) && typeof loadMitgliederData === 'function') {
      loadMitgliederData(false).catch(e => console.warn("Mitglieder Preload:", e));
    }
    
    // Prüfe Content-Type – wenn HTML kommt, ist das Script nicht korrekt deployed/erreichbar
    const rawText = await invRes.text();
    let result;
    try {
      result = JSON.parse(rawText);
    } catch (_) {
      console.error('❌ Rechnungen API: HTML statt JSON erhalten:', rawText.slice(0, 300));
      if (container) {
        container.innerHTML = `
          <div class="alert alert-warning">
            <h5>⚠️ Backend nicht erreichbar</h5>
            <p>Das Google Apps Script für <strong>Rechnungen</strong> gibt kein JSON zurück. Mögliche Ursachen:</p>
            <ul>
              <li>Das Script ist noch nicht als <strong>Web App</strong> deployed</li>
              <li>Die URL im <code>worker.js</code> ist inkorrekt oder abgelaufen</li>
              <li>Ein Berechtigungs- oder Quotenlimit bei Google wurde überschritten</li>
            </ul>
            <details class="mt-2">
              <summary class="small text-muted">Technische Details</summary>
              <pre class="small mt-2 bg-light p-2 rounded">${escapeHtml(rawText.slice(0, 500))}</pre>
            </details>
          </div>`;
      }
      return;
    }
    
    if (result.success) {
      window._invoices = result.data || [];
      window._jbAllInvoices = window._invoices; // Keep jahresbeitrag cache in sync!
      window.renderRechnungen();
    } else {
      throw new Error(result.error || "API returned success: false");
    }
  } catch (err) {
    console.error("❌ Fehler beim Laden der Rechnungen:", err);
    if (!window._invoiceTemplates || window._invoiceTemplates.length === 0) {
      rnInitializeTemplates();
      window._invoiceTemplates = JSON.parse(localStorage.getItem('portal_invoice_templates') || '[]');
    }
    if (container && (!silent || !hasCachedData)) {
      container.innerHTML = `
        <div class="alert alert-danger shadow-sm rounded-3">
          <i class="fas fa-exclamation-triangle me-2"></i>
          <strong>Verbindungsfehler:</strong> Die Rechnungsdaten konnten nicht abgerufen werden.
          <br><small class="text-muted">${err.message}</small>
        </div>`;
    }
  }
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
    const isFirma = contact.typ === 'firma' || Boolean(contact.firma);
    return {
      id: contact.id,
      typ: contact.typ || (isFirma ? 'firma' : 'privat'),
      kategorie: contact.kategorie || 'Privat',
      firma: contact.firma || '',
      abteilung: contact.abteilung || '',
      anrede: contact.anrede || '',
      vorname: contact.vorname || '',
      nachname: contact.nachname || '',
      name: isFirma ? (contact.firma || contact.name) : ((contact.vorname || '') + ' ' + (contact.nachname || '')).trim() || contact.name || inv.name,
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
  const nameParts = rawName.split(/\s+/);
  const vorname = nameParts.length > 1 ? nameParts[0] : rawName;
  const nachname = nameParts.length > 1 ? nameParts.slice(1).join(' ') : '';

  return {
    id: extId || '',
    typ: 'privat',
    kategorie: 'Privat',
    firma: '',
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

  // Abgleich mit Mitglieder-DB anhand des Anzeigenamens
  const cleanLogin = loggedInName.toLowerCase();
  const member = members.find(m => {
    const fn = String(m.FirstName || '').trim().toLowerCase();
    const ln = String(m.LastName || '').trim().toLowerCase();
    return `${fn} ${ln}` === cleanLogin || `${ln} ${fn}` === cleanLogin || fn === cleanLogin || ln === cleanLogin;
  });

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
