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

        // Automatischer Hintergrund-Abgleich für Raiffeisen-Zahlungseingänge aus Gmail / Sheet
        setTimeout(() => {
          reconcileRaiffeisenPaymentsFromSheet(supa);
        }, 150);
      }
    } catch (supaErr) {
      console.warn("⚠️ Supabase Abfrage fehlgeschlagen, versuche Legacy-API:", supaErr);
    }
  }

  // Fallback auf Legacy GAS-Proxy falls Supabase-Tabellen noch nicht migriert sind
  if (!loadedFromSupa) {
    try {
      const [resReservations, resFeedback] = await Promise.all([
        apiFetch('vermietung', 'action=getAll'),
        apiFetch('vermietung', 'action=getFeedback')
      ]);

      const data = await resReservations.json();
      if (data.success) {
        vermietungDaten = (data.data || []).map(d => ({
          ...d,
          id: d.row || d.vertragsnr,
          betrag_raw: parseFloat((d.mietbetrag || '0').replace(/[^\d.]/g, '') || 0)
        }));
      }

      try {
        const feedbackData = await resFeedback.json();
        if (feedbackData.success) {
          stornoFeedbackDaten = feedbackData.data;
        }
      } catch (errFeedback) {
        console.warn("Feedback JSON Parser Fehler:", errFeedback);
      }
    } catch(e) {
      console.error("Fehler beim Laden:", e);
      if (container) {
        container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden des Cockpits: ${e.message}</div>`;
        return;
      }
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

// Prüft im Hintergrund, ob Raiffeisen-Zahlungseingänge im Google Sheet vorhanden sind,
// die in Supabase noch nicht als bezahlt markiert wurden, und synchronisiert diese automatisch.
async function reconcileRaiffeisenPaymentsFromSheet(supa) {
  if (!supa || typeof apiFetch !== 'function') return;
  try {
    const res = await apiFetch('vermietung', 'action=getAll');
    const json = await res.json();
    if (!json.success || !Array.isArray(json.data)) return;

    let hasUpdates = false;

    for (const sheetRow of json.data) {
      const vnr = (sheetRow.vertragsnr || '').trim();
      const statusStr = (sheetRow.status || '').toLowerCase();
      const isPaidInSheet = statusStr.includes('03') || statusStr.includes('04') || statusStr.includes('zahlung erhalten');
      const datumRaiffeisen = sheetRow.datum_raiffeisen || sheetRow.datum_zahlung || '';

      if (vnr && isPaidInSheet) {
        // Finde passenden Datensatz in Supabase-Liste
        const local = vermietungDaten.find(x => x.vertragsnr === vnr);
        if (local) {
          const s = String(local.status || '').toLowerCase();
          const alreadyPaidInSupa = s === 'paid' || s === 'keys_issued' || s === 'completed';

          if (!alreadyPaidInSupa) {
            console.log(`💳 Neuer Raiffeisen-Zahlungseingang für ${vnr} im Sheet erkannt. Synchronisiere nach Supabase...`);

            let rDate = new Date().toISOString().split('T')[0];
            if (datumRaiffeisen) {
              if (datumRaiffeisen.includes('.')) {
                const parts = datumRaiffeisen.split('.');
                if (parts.length === 3) rDate = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
              } else {
                rDate = datumRaiffeisen;
              }
            }

            const updatePayload = {
              status: 'paid',
              is_paid: true,
              datum_raiffeisen: rDate,
              status_raiffeisen: 'E-Banking Eingang (automatisch abgeglichen)'
            };

            const { error: patchErr } = await supa
              .from('rental_requests')
              .update(updatePayload)
              .eq('id', local.id);

            if (!patchErr) {
              local.status = 'paid';
              local.datum_raiffeisen = typeof isoToDisplay === 'function' ? isoToDisplay(rDate) : rDate;
              hasUpdates = true;
            }
          }
        }
      }
    }

    if (hasUpdates) {
      console.log("✅ Raiffeisen-Zahlungen erfolgreich nach Supabase synchronisiert.");
      // UI mit neuem Zahlungsstatus reaktiv auffrischen
      renderVermietungCockpit(vermietungDaten);
    }
  } catch (err) {
    console.warn("Hintergrund-Abgleich Raiffeisen fehlgeschlagen:", err);
  }
}

