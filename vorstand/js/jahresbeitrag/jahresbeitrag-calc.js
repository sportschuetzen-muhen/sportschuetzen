// vorstand/js/jahresbeitrag/jahresbeitrag-calc.js
// ============================================================
// VIRTUAL LIVE CALCULATOR (Floor CHF 0.00 und alle Tarife)
// ============================================================
function jbCalculateLiveTotal(m, settings) {
  const isEhren = m._istEhren || false;
  const isPassiv = m._istPassiv || false;
  const isIntern = String(m.PersonNumber || '').startsWith('INT-');
  
  const age = m.BirthDate ? (new Date().getFullYear() - new Date(m.BirthDate).getFullYear()) : 0;
  const isJunior = age > 0 && age <= 20;
  
  const feesMap = {};
  (window._jbGebuehren || []).forEach(f => {
    feesMap[f.key] = Number(f.betrag || 0);
  });
  
  const getFee = (key, fallback) => {
    return feesMap[key] !== undefined ? feesMap[key] : fallback;
  };

  const getFeeAccount = (key, fallback) => {
    const matched = (window._jbGebuehren || []).find(g => {
      const k = String(g.key || '').trim().toUpperCase();
      return k === key || k === key.replace(/^Z0*/, 'Z');
    });
    if (matched) {
      const k = String(matched['Haben-Konto-Jahresbeitrag-Buchhaltung'] || matched['Vorgeschlagenes Haben-Konto'] || matched.konto_haben || matched.konto || '').trim();
      if (k) return k;
    }
    return fallback;
  };

  const positions = [];
  
  // 1. Jahresbeitrag
  let jbBetrag = 0;
  let jbDesc = '';
  if (isEhren) {
    jbBetrag = getFee('JB004', 0);
    jbDesc = 'Jahresbeitrag Ehrenmitglied';
  } else if (isPassiv) {
    jbBetrag = getFee('JB005', 20);
    jbDesc = 'Jahresbeitrag Passivmitglied';
  } else if (isIntern) {
    jbBetrag = getFee('JB006', 0);
    jbDesc = 'Schüler intern (ohne Lizenz)';
  } else if (isJunior) {
    jbBetrag = getFee('JB007', 20);
    jbDesc = 'Jahresbeitrag Junior';
  } else {
    // Aktiv
    const haupt = m._hauptlizenz || '';
    if (haupt.includes('G50m')) {
      if (haupt.includes('Aktiv-A')) {
        jbBetrag = getFee('JB001', 100);
        jbDesc = 'Jahresbeitrag Aktiv A G50m';
      } else {
        jbBetrag = getFee('JB002', 70);
        jbDesc = 'Jahresbeitrag Aktiv B G50m';
      }
    } else if (haupt.includes('G10m')) {
      jbBetrag = getFee('JB003', 10);
      jbDesc = 'Jahresbeitrag Aktiv nur 10m';
    } else {
      // Kein eigener Muhen-Lizenz-Typ erkannt (z.B. nur Fremdlizenz G300)
      // → Mitglied gilt als Passivmitglied (JB005 = 20 CHF)
      jbBetrag = getFee('JB005', 20);
      jbDesc = 'Jahresbeitrag Passivmitglied (keine eigene Lizenz)';
    }
  }
  
  positions.push({ name: jbDesc, betrag: jbBetrag, typ: 'Debit' });
  
  // 2. Lizenzen
  const licType = settings.lizenz || 'keine';
  if (licType === 'verein') {
    positions.push({ name: 'Lizenz eigener Verein (Normal)', betrag: getFee('LI001', 18), typ: 'Debit' });
  } else if (licType === 'junior') {
    positions.push({ name: 'Lizenz eigener Verein (Junior)', betrag: getFee('LI002', 0), typ: 'Debit' });
  } else if (licType === 'fremd') {
    positions.push({ name: 'Lizenz anderer Verein', betrag: getFee('LI003', 0), typ: 'Debit' });
  }
  
  // 3. Dynamische Events, Wettkämpfe & Turniere
  // Erstelle eine konsolidierte Map: falls settings.events vorhanden ist, nutze diese,
  // ansonsten mappe vorhandene Legacy-Felder abwärtskompatibel.
  const eventsMap = settings.events ? { ...settings.events } : {};

  if (!settings.events) {
    // Legacy-Defaulting & Fallback
    let chargeGe = false;
    if (settings && settings.schuetzenhaus !== undefined) {
      chargeGe = !!settings.schuetzenhaus;
    } else {
      const hatG50mOwn = (m._lizenzen || []).some(l => l.istMuhen && l.MembershipCategory.toLowerCase().includes('g50'));
      chargeGe = !isJunior && hatG50mOwn && !isPassiv;
    }
    if (chargeGe) eventsMap['GE001'] = 1;

    if (settings.kk_volksschiessen && settings.kk_volksschiessen !== 'keine') {
      eventsMap['KK008'] = Number(settings.kk_volksschiessen);
    }
    if (settings.ssv_dez === 'liegend') eventsMap['KK002'] = 1;
    if (settings.ssv_dez === '2-stellung') eventsMap['KK003'] = 1;
    if (settings.ssv_dez === '3-stellung') eventsMap['KK004'] = 1;
    if (settings.ssv_dez === 'liegend_2_3') {
      eventsMap['KK002'] = 1;
      eventsMap['KK003'] = 1;
      eventsMap['KK004'] = 1;
    }
    if (settings.ssv_dez === 'sv') eventsMap['KK005'] = 1;
    if (settings.kk_grenzland && settings.kk_grenzland !== 'keine') eventsMap['KK001'] = 1;

    if (settings.kk_verband) eventsMap['KK006'] = 1;
    if (settings.kk_verein)  eventsMap['KK007'] = 1;

    if (settings.lg_ag_dez)         eventsMap['LG001'] = 1;
    if (settings.lg_ag_dez_auflage) eventsMap['LG002'] = 1;
    if (settings.lg_ch_dez)         eventsMap['LG003'] = 1;
    if (settings.lg_ch_dez_auflage) eventsMap['LG004'] = 1;
    if (settings.lg_verband)        eventsMap['LG005'] = 1;
    if (settings.lg_verein)         eventsMap['LG006'] = 1;
    if (settings.lg_ch_kniend)      eventsMap['LG007'] = 1;
  }

  // Iteriere über alle konfigurierten Events in eventsMap
  Object.entries(eventsMap).forEach(([eventKey, val]) => {
    const keyClean = String(eventKey).trim().toUpperCase();
    const numVal = Number(val || 0);
    if (numVal <= 0) return;

    const feeObj = (window._jbGebuehren || []).find(f => String(f.key || '').trim().toUpperCase() === keyClean);
    const unitPrice = feeObj ? Number(feeObj.betrag || 0) : getFee(keyClean, 0);
    
    // Counter-Typen wie Volksschiessen multiplizieren mit der Anzahl Stiche
    const isCounter = (feeObj && feeObj.ui_typ === 'counter') || keyClean === 'KK008';
    const count = isCounter ? numVal : 1;
    const totalFee = count * unitPrice;

    let desc = feeObj ? (feeObj.bezeichnungfrontend || feeObj.bezeichnung || keyClean) : keyClean;
    if (isCounter && count > 0) {
      desc += ` (${count} Stich${count > 1 ? 'e' : ''})`;
    }

    positions.push({
      name: desc,
      betrag: totalFee,
      konto: getFeeAccount(keyClean, ''),
      typ: 'Debit',
      key: keyClean
    });
  });

  // 4. Variable Zusatzpositionen (Freie Beträge)
  const extrasList = settings.extras || [];
  if (extrasList.length > 0) {
    extrasList.forEach(ex => {
      if (ex.active && ex.text && Number(ex.betrag) !== 0) {
        positions.push({
          name: ex.text,
          betrag: Number(ex.betrag || 0),
          konto: ex.konto || getFeeAccount(ex.key || 'Z001', '8500'),
          locked: ex.locked !== false,
          typ: 'Debit',
          key: ex.key || 'ZUSATZ'
        });
      }
    });
  } else {
    // Abwärtskompatibilität für z1 und z2
    if (settings.z1_active && settings.z1_text && Number(settings.z1_betrag) !== 0) {
      positions.push({
        name: settings.z1_text,
        betrag: Number(settings.z1_betrag || 0),
        konto: settings.z1_konto || getFeeAccount('Z001', '8500'),
        locked: settings.z1_locked !== false,
        typ: 'Debit',
        key: 'Z001'
      });
    }
    if (settings.z2_active && settings.z2_text && Number(settings.z2_betrag) !== 0) {
      positions.push({
        name: settings.z2_text,
        betrag: Number(settings.z2_betrag || 0),
        konto: settings.z2_konto || getFeeAccount('Z002', '1300'),
        locked: settings.z2_locked !== false,
        typ: 'Debit',
        key: 'Z002'
      });
    }
  }
  
  // 5. Rabatte
  let isVorstand = m._istVorstand || false;
  let isHausmeister = (m._kategorie || '').toLowerCase().includes('hausmeister');
  
  let hasRA002 = false;
  if (isVorstand && !isEhren) {
    positions.push({ name: 'Rabatt Vorstand', betrag: getFee('RA001', -100), typ: 'Kredit' });
  }
  
  if (isHausmeister) {
    positions.push({ name: 'Gutschrift Unterhalt Anlage (Hausmeister)', betrag: getFee('RA002', -300), typ: 'Kredit' });
    hasRA002 = true;
  }
  
  // Summing up
  let total = 0;
  positions.forEach(p => { total += p.betrag; });
  
  // Floor check: If not janitor (Hausmeister), floor at 0
  if (!hasRA002) {
    total = Math.max(0, total);
  }
  
  return { positions, total };
}

// ============================================================
// FORMAT HELPERS
// ============================================================
function fmtChf(val) {
  return 'CHF ' + Number(val || 0).toFixed(2);
}
function fmtDate(val) {
  if (!val || val === '') return '–';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('de-CH');
}
