// vorstand/js/jahresbeitrag/jahresbeitrag-accounting.js
// =====================================================================
// MODUL: JAHRESBEITRAG - BUCHHALTUNGS-MAPPING & SPLITBUCHUNGEN
// =====================================================================

/**
 * Ermittelt das hinterlegte Sachkonto für eine Beitragsposition.
 * Durchsucht primär die aus dem Sheet "gebuehrenconfig" (Members100)
 * geladenen Gebühren (Spalte "Haben-Konto-Jahresbeitrag-Buchhaltung").
 * 
 * @param {string} sourceField - z. B. 'JB001', 'LI001', 'GE001', 'KK006', etc.
 * @param {string} description - z. B. 'Jahresbeitrag Aktiv A G50m', 'Lizenz', etc.
 * @param {object} customSettings - optionale manuelle Konten (z. B. für z1_konto / z2_konto)
 * @returns {string} 4-stelliges Sachkonto (z. B. '3410', '1190', etc.)
 */
window.jbResolveAccountForPosition = function(sourceField, description, customSettings) {
  const sf = String(sourceField || '').trim().toUpperCase();
  const desc = String(description || '').trim().toLowerCase();

  // 1. Spezifische variable Zusatzpositionen (z1, z2)
  if (sf === 'Z1' || sf === 'Z001' || desc.includes('zusatzposition 1') || desc.includes('jacke')) {
    if (customSettings && customSettings.z1_konto) return String(customSettings.z1_konto).trim();
    const gZ1 = (window._jbGebuehren || []).find(g => {
      const k = String(g.key || '').trim().toUpperCase();
      return k === 'Z001' || k === 'Z1';
    });
    if (gZ1) {
      const k = String(gZ1['Haben-Konto-Jahresbeitrag-Buchhaltung'] || gZ1['Vorgeschlagenes Haben-Konto'] || gZ1.konto_haben || gZ1.konto || '').trim();
      if (k) return k;
    }
    return '8500'; // Standard-Fallback
  }
  if (sf === 'Z2' || sf === 'Z002' || desc.includes('zusatzposition 2')) {
    if (customSettings && customSettings.z2_konto) return String(customSettings.z2_konto).trim();
    const gZ2 = (window._jbGebuehren || []).find(g => {
      const k = String(g.key || '').trim().toUpperCase();
      return k === 'Z002' || k === 'Z2';
    });
    if (gZ2) {
      const k = String(gZ2['Haben-Konto-Jahresbeitrag-Buchhaltung'] || gZ2['Vorgeschlagenes Haben-Konto'] || gZ2.konto_haben || gZ2.konto || '').trim();
      if (k) return k;
    }
    return '1300'; // Transitorische Aktiven Standard (13xx)
  }

  // 2. Abgleich mit dem dynamischen Sheet gebuehrenconfig (Members100 Spalten I & J)
  const gebuehren = window._jbGebuehren || [];
  if (gebuehren.length > 0) {
    let matched = null;
    
    // Suche nach Key (sourceField)
    if (sf) {
      matched = gebuehren.find(g => String(g.key || '').trim().toUpperCase() === sf);
    }
    
    // Falls nicht nach Key gefunden: Suche nach Bezeichnung
    if (!matched && desc) {
      matched = gebuehren.find(g => {
        const b = String(g.bezeichnung || '').trim().toLowerCase();
        const bf = String(g.bezeichnungfrontend || '').trim().toLowerCase();
        return (b && desc.includes(b)) || (bf && desc.includes(bf));
      });
    }

    if (matched) {
      // Priorität der Spaltenbezeichnungen für Spalte I
      const konto = String(
        matched['Haben-Konto-Jahresbeitrag-Buchhaltung'] ||
        matched['Vorgeschlagenes Haben-Konto'] ||
        matched.konto_haben ||
        matched.konto ||
        matched.haben ||
        ''
      ).trim();

      if (konto) {
        return konto;
      }
    }
  }

  // 3. Fallbacks falls gebuehrenconfig noch nicht geladen oder nicht definiert ist
  if (sf === 'JB005' || desc.includes('passiv')) return '3412'; // Passiv
  if (sf === 'JB006' || desc.includes('schüler') || desc.includes('schueler')) return '3420'; // Schüler intern
  if (sf.startsWith('JB') || desc.includes('jahresbeitrag') || desc.includes('aktiv')) return '3410'; // Aktive
  if (sf.startsWith('LI') || desc.includes('lizenz')) return '3411'; // Lizenzen
  if (sf === 'GE001' || desc.includes('schützenhaus') || desc.includes('unterhalt anlage') || desc.includes('infrastruktur')) return '3413'; // Unterhalt Gebäude
  if (sf === 'RA001' || desc.includes('vorstand')) return '3410'; // Rabatt Vorstand (Erlösminderung 3410)
  if (sf === 'RA002' || desc.includes('hausmeister')) return '6002'; // Unterhalt / Reparaturen Hausmeister
  
  // Kostenübernahme Jugend / Meisterschaften
  if (sf === 'KOSTENUEBERNAHME_JUGEND' || desc.includes('kostenübernahme') || desc.includes('kostenuebernahme') || desc.includes('jugendförderung')) {
    const gK = (window._jbGebuehren || []).find(g => {
      const k = String(g.key || '').trim().toUpperCase();
      const kat = String(g.kategorie || '').trim().toLowerCase();
      return k === 'KOSTENUEBERNAHME_JUGEND' || kat === 'kostenübernahme_jugend' || kat === 'kostenuebernahme_jugend';
    });
    if (gK) {
      const k = String(gK['Haben-Konto-Jahresbeitrag-Buchhaltung'] || gK.konto || '').trim();
      if (k) return k;
    }
    return '3420'; // Standard-Gegenkonto Jugendförderung
  }

  // Wettschiessen (10m / 50m / Volksschiessen / DEZ): Falls nicht in gebuehrenconfig konfiguriert, auf Transitorische Aktiven (1300) leiten
  if (sf.startsWith('KK') || sf.startsWith('LG') || desc.includes('50m') || desc.includes('10m') || desc.includes('stich') || desc.includes('volksschiessen')) {
    return '1300';
  }

  return '3410'; // Standard-Fallback
};

/**
 * Erzeugt vollständige Split-Buchungssätze für einen Jahresbeitrag.
 * 
 * WICHTIG:
 * - Positionen mit Betrag 0.00 werden STRIKT übersprungen (keine Nullbuchungen im Journal).
 * - Rabatte/Gutschriften (negative Beträge) werden als Soll Rabattkonto / Haben Bank gebucht.
 * - Debite (positive Beträge) werden als Soll Bank / Haben Ertragskonto gebucht.
 * - Rundungsdifferenzen / Spenden werden auf Wunsch auf Spendenkonto 3800 ausgeglichen.
 * 
 * @param {object} options
 * @param {string|number} options.headerId - Beitrags-Header-ID (z. B. '123' oder 'RE-JB-2026-0042')
 * @param {object} options.member - Mitgliedsdaten { FirstName, LastName, PersonNumber }
 * @param {number} options.paidAmount - Effektiv bezahlter Betrag (z. B. aus CAMT)
 * @param {string} options.bookingDate - Buchungsdatum YYYY-MM-DD
 * @param {string} options.belegNr - Belegnummer fürs Journal
 * @param {string} options.bankAccount - Bank-/Konto Soll (Standard '1020')
 * @param {number} options.year - Geschäftsjahr (Standard aktuelles Jahr)
 * @param {Array} options.positions - Optionale explizite Positionen
 * @returns {Array} Liste valider Buchungszeilen für addJournalEntries
 */
window.jbGetSplitBookings = function(options) {
  options = options || {};
  const year = Number(options.year || window._bhYear || window._jbYear || new Date().getFullYear());
  const bookingDate = options.bookingDate || new Date().toISOString().split('T')[0];
  const bankAccount = String(options.bankAccount || '1020').trim();
  const belegNr = String(options.belegNr || '').trim() || `JB-${year}`;
  const member = options.member || {};
  const memberName = [member.FirstName, member.LastName].filter(Boolean).join(' ') || `Mitglied ${member.PersonNumber || ''}`;

  // 1. Positionen ermitteln (aus Parameter, aus _jbAllPositions oder aus Rechnungen)
  let rawPositions = options.positions || [];
  if ((!rawPositions || rawPositions.length === 0) && options.headerId && window._jbAllPositions) {
    rawPositions = (window._jbAllPositions || []).filter(p => String(p.headerid) === String(options.headerId));
  }
  if ((!rawPositions || rawPositions.length === 0) && member.PersonNumber && window._jbAllPositions) {
    rawPositions = (window._jbAllPositions || []).filter(p => 
      String(p.PersonNumber) === String(member.PersonNumber) && Number(p.year) === year
    );
  }
  if ((!rawPositions || rawPositions.length === 0) && options.headerId && window._invoices) {
    const inv = window._invoices.find(i => String(i.id) === String(options.headerId));
    if (inv && Array.isArray(inv.positions)) {
      rawPositions = inv.positions;
    }
  }

  // 2. Fallback: Falls keine Detailpositionen vorhanden sind, Standard-Buchungssatz
  if (!rawPositions || rawPositions.length === 0) {
    const fallbackAmount = Number(options.paidAmount || 0);
    if (fallbackAmount <= 0) return []; // Keine Nullbuchung

    const fallbackHaben = (member._istPassiv || member.IsPassive == 1) ? '3412' : '3410';
    return [{
      jahr: year,
      datum: bookingDate,
      beleg_nr: belegNr,
      beschreibung: `Jahresbeitrag ${year}: ${memberName}`,
      konto_soll: bankAccount,
      konto_haben: fallbackHaben,
      betrag: Math.round(fallbackAmount * 100) / 100,
      typ: 'Bank'
    }];
  }

  const entries = [];
  let netCalculated = 0;

  // 3. Jede Position einzeln mappen
  rawPositions.forEach(p => {
    const amt = Number(p.betrag !== undefined ? p.betrag : (p.amount !== undefined ? p.amount : 0));

    // STRIKT: Nullbeträge überspringen! (JB004 Ehrenmitglied, LI002 Juniorlizenz, etc.)
    if (Math.abs(amt) < 0.01) {
      return;
    }

    const desc = p.beschreibung || p.description || p.name || 'Jahresbeitrag Position';
    const source = p.sourcefield || p.source_field || '';
    const targetKonto = window.jbResolveAccountForPosition(source, desc);

    if (amt > 0) {
      // Normaler Debit-Posten: Geld geht auf die Bank ein
      entries.push({
        jahr: year,
        datum: bookingDate,
        beleg_nr: belegNr,
        beschreibung: `Jahresbeitrag ${year}: ${memberName} (${desc})`,
        konto_soll: bankAccount,
        konto_haben: targetKonto,
        betrag: Math.round(amt * 100) / 100,
        typ: 'Bank'
      });
      netCalculated += amt;
    } else {
      // Kredit-Posten (Rabatt / Gutschrift): Reduziert den Ertrag bzw. Aufwand
      const absAmt = Math.abs(amt);
      entries.push({
        jahr: year,
        datum: bookingDate,
        beleg_nr: belegNr,
        beschreibung: `${desc}: ${memberName}`,
        konto_soll: targetKonto,
        konto_haben: bankAccount,
        betrag: Math.round(absAmt * 100) / 100,
        typ: 'Bank'
      });
      netCalculated -= absAmt;
    }
  });

  // 4. Allfälligen Differenzbetrag ausgleichen (z.B. Spende / Rundung durch Mitglied)
  if (options.paidAmount !== undefined && options.paidAmount !== null) {
    const paid = Number(options.paidAmount || 0);
    const diff = Math.round((paid - netCalculated) * 100) / 100;

    if (diff > 0.05) {
      // Überzahlung (z. B. Spende aufgerundet auf 200.-)
      entries.push({
        jahr: year,
        datum: bookingDate,
        beleg_nr: belegNr,
        beschreibung: `Spende / Aufrundung Jahresbeitrag: ${memberName}`,
        konto_soll: bankAccount,
        konto_haben: '3800', // Sponsoring, Gönner & Spenden
        betrag: diff,
        typ: 'Bank'
      });
    }
  }

  return entries;
};

/**
 * Erstellt eine lesbare Zusammenfassung der Splitbuchung für UI-Tooltips oder Badges.
 * 
 * @param {Array} entries - Die Buchungszeilen aus jbGetSplitBookings
 * @returns {string} Textzusammenfassung (z. B. "3410: CHF 100.00 | 3411: CHF 18.00")
 */
window.jbFormatSplitSummary = function(entries) {
  if (!entries || entries.length === 0) return 'Keine Buchungen';
  return entries.map(e => {
    return `${e.konto_soll}->${e.konto_haben}: CHF ${Number(e.betrag).toFixed(2)}`;
  }).join(' | ');
};
