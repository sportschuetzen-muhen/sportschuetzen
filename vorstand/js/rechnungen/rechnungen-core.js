// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - CORE
// =====================================================================

// Globale State-Variablen für Rechnungen
window._invoices = [];
window._invoicesSearchCol = 'id';
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

// Online/Preload Endpoint Trigger
window._invoiceTemplates = [];
window._rechnungenActiveTab = 'archiv';

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
    // Parallel fetching of invoices and standard positions templates
    const [invRes, _] = await Promise.all([
      apiFetch('rechnungen', 'action=getInvoices'),
      loadInvoiceTemplatesData()
    ]);
    
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
window.rnInitializeTemplates = function() {
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
};

// Filter Handlers
window.rnChangeFilterStatus = function(val) {
  window._invoicesFilterStatus = val;
  rnRenderTable();
};

window.rnChangeFilterType = function(val) {
  window._invoicesFilterType = val;
  rnRenderTable();
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
