// === SUB-MODUL: VERMIETUNG - CORE ===

let vermietungDaten = [];
let stornoFeedbackDaten = [];
let sortAsc = true;
let aktuellerFilter = 'alle';
let einnahmenJahr = new Date().getFullYear(); // ← für Jahresfilter
let reservationSearchQuery = '';
let feedbackSearchQuery = '';

// Lädt Reservierungen und Stornorückmeldungen gleichzeitig im Hintergrund
async function loadVermietungData(force = false) {
  const container = document.getElementById('vermietung-container');
  if (!container) return;

  if (!force && vermietungDaten.length > 0 && document.getElementById('reservations-tab')) {
    console.log("⚡ loadVermietungData: Lade aus lokalem Cache...");
    return;
  }

  container.innerHTML = `<div class="text-center py-5">
    <div class="spinner-border text-primary"></div>
    <p class="mt-2 text-muted">Lade Cockpit, Belegungen & Feedbacks...</p>
  </div>`;

  try {
    const [resReservations, resFeedback] = await Promise.all([
      apiFetch('vermietung', 'action=getAll'),
      apiFetch('vermietung', 'action=getFeedback')
    ]);

    console.log("📋 vermietung response status:", resReservations.status);
    const data = await resReservations.json();
    console.log("📋 vermietung response data:", data);
    
    if (!data.success) throw new Error(data.error);
    vermietungDaten = data.data;

    try {
      const feedbackData = await resFeedback.json();
      if (feedbackData.success) {
        stornoFeedbackDaten = feedbackData.data;
      } else {
        console.warn("Stornorückmeldungen konnten nicht geladen werden:", feedbackData.error);
      }
    } catch (errFeedback) {
      console.warn("Feedback JSON Parser Fehler:", errFeedback);
    }

    renderVermietungCockpit(vermietungDaten);
  } catch(e) {
    container.innerHTML = `<div class="alert alert-danger">Fehler beim Laden des Cockpits: ${e.message}</div>`;
  }
}

// Berechnet die Einnahmen (Status 03 oder 04) für ein bestimmtes Jahr
function berechneEinnahmen(daten, jahr) {
  return daten
    .filter(d => {
      if (!d.status.includes("03") && !d.status.includes("04")) return false;
      const p = (d.mietdatum || "").split(".");
      return p.length === 3 && p[2] == jahr;
    })
    .reduce((sum, d) => {
      return sum + parseFloat((d.mietbetrag || "0").replace(/[^\d.]/g, '') || 0);
    }, 0);
}

// Aktualisiert den Umsatzausweis im Dashboard
function updateEinnahmen(jahr) {
  einnahmenJahr = jahr;
  const einnahmen = berechneEinnahmen(vermietungDaten, jahr);
  document.getElementById('einnahmen-betrag').innerText = `CHF ${einnahmen.toFixed(0)}`;
}

// Liefert die Vereinsfarbe passend zum Statuscode zurück
function getStatusColor(status) {
  if (!status) return "#6c757d";
  if (status.includes("00")) return "#c0392b"; // Dunkelrot für Konflikt
  if (status.includes("01")) return "#ffc107";
  if (status.includes("02")) return "#fd7e14";
  if (status.includes("03")) return "#28a745";
  if (status.includes("04")) return "#0f3a5d";
  if (status.includes("05")) return "#dc3545";
  return "#6c757d";
}

// Wandelt den internen Statuscode in einen klaren Begriff um
function getStatusLabel(status) {
  if (!status) return "Unbekannt";
  if (status.includes("00")) return "Konflikt";
  if (status.includes("01")) return "Offen";
  if (status.includes("02")) return "Gemahnt";
  if (status.includes("03")) return "Bezahlt";
  if (status.includes("04")) return "Schlüssel versandt";
  if (status.includes("05")) return "Storniert";
  return status;
}

// Zeigt Toasts als modern gestyltes Info-Fenster unten rechts an
function showToast(msg) {
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
}
