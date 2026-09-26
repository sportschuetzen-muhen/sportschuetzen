// === SUB-MODUL: VERMIETUNG - CORE (Native Supabase Integration) ===

let vermietungDaten = [];
let stornoFeedbackDaten = [];
let sortAsc = true;
let aktuellerFilter = 'alle';
let einnahmenJahr = new Date().getFullYear(); // ← für Jahresfilter
let reservationSearchQuery = '';
let feedbackSearchQuery = '';

// Lädt Reservierungen, Feedbacks und Tarife primär direkt aus Supabase
async function loadVermietungData(force = false) {
  const container = document.getElementById('vermietung-container');
  if (!container) return;

  if (!force && vermietungDaten.length > 0 && document.getElementById('reservations-tab')) {
    console.log("⚡ loadVermietungData: Lade aus lokalem Cache...");
    return;
  }

  container.innerHTML = `<div class="text-center py-5">
    <div class="spinner-border text-primary"></div>
    <p class="mt-2 text-muted">Lade Cockpit, Belegungen & Feedbacks aus Supabase...</p>
  </div>`;

  const supa = (typeof window.getSupabaseClient === 'function') ? window.getSupabaseClient() : window.supabaseClient;
  let loadedFromSupa = false;

  if (supa) {
    try {
      const [resReqs, resFeedback, resPricing, resSettings] = await Promise.all([
        supa.from('rental_requests').select('*').order('start_date', { ascending: false }),
        supa.from('rental_cancellation_feedbacks').select('*').order('created_at', { ascending: false }),
        supa.from('rental_pricing').select('*').eq('is_active', true),
        supa.from('rental_settings').select('*')
      ]);

      if (!resReqs.error && Array.isArray(resReqs.data)) {
        vermietungDaten = resReqs.data.map(r => ({
          id: r.id,
          row: r.id, // Eindeutige ID für Modale und Aktionen
          vertragsnr: r.booking_number,
          anrede: r.salutation || '',
          vorname: r.first_name,
          nachname: r.last_name,
          email: r.email,
          telefon: r.phone,
          strasse: r.street,
          plz: r.post_code,
          wohnort: r.city,
          mietdatum: typeof isoToDisplay === 'function' ? isoToDisplay(r.start_date) : r.start_date,
          start_date_iso: r.start_date,
          festbeginn: r.festbeginn || '–',
          mietbetrag: `CHF ${parseFloat(r.total_amount_chf || 0).toFixed(2)}`,
          betrag_raw: parseFloat(r.total_amount_chf || 0),
          status: r.status,
          datum_vertrag: typeof isoToDisplay === 'function' ? isoToDisplay(r.datum_vertrag) : (r.datum_vertrag || ''),
          datum_mahnung: typeof isoToDisplay === 'function' ? isoToDisplay(r.datum_mahnung) : (r.datum_mahnung || ''),
          datum_schluessel: typeof isoToDisplay === 'function' ? isoToDisplay(r.datum_schluessel) : (r.datum_schluessel || ''),
          datum_storno: typeof isoToDisplay === 'function' ? isoToDisplay(r.datum_storno) : (r.datum_storno || ''),
          contract_file_url: r.contract_file_url || '',
          kommentar: r.admin_comment || r.kommentar_raiffeisen || '',
          is_inquiry: r.is_inquiry || false,
          inquiry_note: r.inquiry_note || '',
          raw: r
        }));

        stornoFeedbackDaten = (resFeedback.data || []).map(f => ({
          id: f.id,
          zeitstempel: f.created_at ? new Date(f.created_at).toLocaleString('de-CH') : '–',
          vertragsnr: f.booking_number,
          grund: f.reason,
          bemerkung: f.remarks || '',
          is_urgent: f.is_urgent || false
        }));

        window._rentalPricing = resPricing.data || [];
        window._rentalSettings = {};
        (resSettings.data || []).forEach(s => {
          window._rentalSettings[s.setting_key] = s.setting_value;
        });

        loadedFromSupa = true;
        console.log(`✅ ${vermietungDaten.length} Vermietungen aus Supabase geladen.`);
      } else if (resReqs.error) {
        throw resReqs.error;
      }
    } catch (supaErr) {
      console.error("❌ Supabase Abfrage fehlgeschlagen:", supaErr);
      if (container) {
        container.innerHTML = `
          <div class="alert alert-danger my-4 p-4 shadow-sm rounded-3">
            <h5 class="fw-bold"><i class="fas fa-exclamation-triangle me-2"></i>Fehler beim Laden der Vermietungsdaten</h5>
            <p class="mb-2">Die Vermietungsdaten konnten nicht aus Supabase geladen werden.</p>
            <p class="small text-muted mb-0 font-monospace">${escapeHtml(supaErr.message || JSON.stringify(supaErr))}</p>
          </div>
        `;
        return;
      }
    }
  } else {
    if (container) {
      container.innerHTML = `<div class="alert alert-danger my-4">Supabase Client ist nicht initialisiert.</div>`;
      return;
    }
  }

  renderVermietungCockpit(vermietungDaten);
}

// Berechnet die Einnahmen (Status bezahlt / keys_issued / 03 / 04) für ein bestimmtes Jahr
function berechneEinnahmen(daten, jahr) {
  return daten
    .filter(d => {
      const s = String(d.status || '').toLowerCase();
      if (!s.includes("03") && !s.includes("04") && s !== 'paid' && s !== 'keys_issued' && s !== 'completed') return false;
      
      let entryYear = null;
      if (d.start_date_iso) {
        entryYear = d.start_date_iso.split('-')[0];
      } else if (d.mietdatum) {
        const p = d.mietdatum.split(".");
        if (p.length === 3) entryYear = p[2];
      }
      return entryYear == jahr;
    })
    .reduce((sum, d) => {
      if (typeof d.betrag_raw === 'number' && !isNaN(d.betrag_raw)) {
        return sum + d.betrag_raw;
      }
      return sum + parseFloat((d.mietbetrag || "0").replace(/[^\d.]/g, '') || 0);
    }, 0);
}

// Aktualisiert den Umsatzausweis im Dashboard
function updateEinnahmen(jahr) {
  einnahmenJahr = jahr;
  const einnahmen = berechneEinnahmen(vermietungDaten, jahr);
  const el = document.getElementById('einnahmen-betrag');
  if (el) el.innerText = `CHF ${einnahmen.toFixed(0)}`;
}

// Liefert die Vereinsfarbe passend zum Statuscode zurück
function getStatusColor(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes("00") || s === 'conflict') return "#c0392b"; // Dunkelrot für Konflikt
  if (s === 'inquiry') return "#17a2b8";                      // Cyan für Vorab-Anfrage
  if (s.includes("01") || s === 'contract_sent') return "#ffc107"; // Gelb für Offen / Vertrag versandt
  if (s.includes("02") || s === 'reminded') return "#fd7e14";      // Orange für Gemahnt
  if (s.includes("03") || s === 'paid') return "#28a745";          // Grün für Bezahlt
  if (s.includes("04") || s === 'keys_issued') return "#0f3a5d";   // Vereinsblau für Schlüssel versandt
  if (s.includes("05") || s === 'cancelled') return "#dc3545";     // Rot für Storniert
  if (s === 'completed') return "#6f42c1";                         // Lila für Abgeschlossen
  return "#6c757d";
}

// Wandelt den internen Statuscode in einen klaren Begriff um
function getStatusLabel(status) {
  const s = String(status || '').toLowerCase();
  if (s.includes("00") || s === 'conflict') return "Konflikt";
  if (s === 'inquiry') return "Vorab-Anfrage";
  if (s.includes("01") || s === 'contract_sent') return "Vertrag versandt (Offen)";
  if (s.includes("02") || s === 'reminded') return "Gemahnt";
  if (s.includes("03") || s === 'paid') return "Zahlung erhalten";
  if (s.includes("04") || s === 'keys_issued') return "Schlüssel versandt";
  if (s.includes("05") || s === 'cancelled') return "Storniert";
  if (s === 'completed') return "Abgeschlossen";
  return status || "Unbekannt";
}

// Zeigt Toasts als modern gestyltes Info-Fenster unten rechts an
function showToast(msg) {
  if (typeof window.showToastImpl === 'function') {
    return window.showToastImpl(msg, 'success', 'bottom-end');
  }
  const oldToast = document.querySelector('.custom-toast');
  if (oldToast) oldToast.remove();

  const toast = document.createElement('div');
  toast.className = 'custom-toast';
  toast.innerHTML = `<i class="fas fa-check-circle me-2"></i> ${msg}`;
  
  document.body.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.5s';
    setTimeout(() => toast.remove(), 500);
  }, 4000);
  return toast;
}


