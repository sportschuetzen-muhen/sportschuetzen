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
  let jbKey = '';

  if (isPassiv) {
    jbBetrag = getFee('JB005', 20);
    jbDesc = 'Jahresbeitrag Passivmitglied';
    jbKey = 'JB005';
  } else if (isIntern && isJunior) {
    jbBetrag = getFee('JB006', 0);
    jbDesc = 'Schüler intern (ohne Lizenz)';
    jbKey = 'JB006';
  } else if (isJunior) {
    jbBetrag = getFee('JB007', 20);
    jbDesc = 'Jahresbeitrag Junior';
    jbKey = 'JB007';
  } else {
    // Aktiv
    let haupt = m._hauptlizenz || '';
    if (!haupt) {
      const lics = (m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || []).filter(l => (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate);
      const g50 = lics.find(l => (l.MembershipCategory || '').toLowerCase().includes('50m') || (l.MembershipCategory || '').toLowerCase().includes('g50'));
      const g10 = lics.find(l => (l.MembershipCategory || '').toLowerCase().includes('10m') || (l.MembershipCategory || '').toLowerCase().includes('g10'));
      if (g50) {
        const isA = (g50.LicenseCategory || '').toUpperCase() === 'A' || (g50.MembershipCategory || '').toLowerCase().includes('aktiv-a') || (g50.MembershipCategory || '').toLowerCase().includes('aktiv a');
        haupt = isA ? 'Aktiv-A G50m' : 'Aktiv-B G50m';
      } else if (g10) {
        const isA = (g10.LicenseCategory || '').toUpperCase() === 'A' || (g10.MembershipCategory || '').toLowerCase().includes('aktiv-a') || (g10.MembershipCategory || '').toLowerCase().includes('aktiv a');
        haupt = isA ? 'Aktiv-A G10m' : 'Aktiv-B G10m';
      }
    }

    if (haupt.includes('G50m')) {
      if (haupt.includes('Aktiv-A')) {
        jbBetrag = getFee('JB001', 100);
        jbDesc = 'Jahresbeitrag Aktiv A G50m';
        jbKey = 'JB001';
      } else {
        jbBetrag = getFee('JB002', 70);
        jbDesc = 'Jahresbeitrag Aktiv B G50m';
        jbKey = 'JB002';
      }
    } else if (haupt.includes('G10m')) {
      jbBetrag = getFee('JB003', 10);
      jbDesc = 'Jahresbeitrag Aktiv nur 10m';
      jbKey = 'JB003';
    } else {
      jbBetrag = getFee('JB005', 20);
      jbDesc = 'Jahresbeitrag Passivmitglied (keine eigene Lizenz)';
      jbKey = 'JB005';
    }
  }
  
  positions.push({ name: jbDesc, betrag: jbBetrag, typ: 'Debit', key: jbKey, konto: getFeeAccount(jbKey, '3410') });

  // Ehrenmitgliedschaft als Rabattzeile in Höhe des Grundbeitrags
  if (isEhren && jbBetrag > 0) {
    positions.push({
      name: 'Ehrenmitgliedschaft',
      betrag: -jbBetrag,
      typ: 'Credit',
      key: 'RA003',
      konto: getFeeAccount('RA003', '3410')
    });
  }
  
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
      const hatG50m = (m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || []).some(l => 
        (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate && (l.MembershipCategory || '').toLowerCase().includes('g50')
      );
      chargeGe = !isJunior && hatG50m && !isPassiv;
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

  const youthSubsidies = {}; // konto -> { total, konto, kontobezeichnung }

  // Iteriere über alle konfigurierten Events in eventsMap
  Object.entries(eventsMap).forEach(([eventKey, val]) => {
    const keyClean = String(eventKey).trim().toUpperCase();
    const numVal = Number(val || 0);
    if (numVal <= 0) return;
    if (keyClean === 'RA001' || keyClean === 'RA002' || keyClean === 'RA003') return;

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

    const itemKonto = getFeeAccount(keyClean, '');
    const itemKontoBez = feeObj ? (feeObj['Kontobezeichnung im KMU-Kontenrahmen'] || feeObj.kontobezeichnung || '') : '';

    positions.push({
      name: desc,
      betrag: totalFee,
      konto: itemKonto,
      typ: 'Debit',
      key: keyClean
    });

    // Merkmal für Zusammenzug: Kategorie = 'Kostenübernahme_Jugend'
    const feeKat = feeObj ? String(feeObj.kategorie || '').trim().toLowerCase() : '';
    const isKostenuebernahme = feeKat === 'kostenübernahme_jugend' || feeKat === 'kostenuebernahme_jugend';

    if (isKostenuebernahme && totalFee > 0) {
      // Gegenkonto variabel aus der Gebührenconfig des Eintrags oder Master-Eintrags holen
      const targetKonto = itemKonto || getFeeAccount('KOSTENUEBERNAHME_JUGEND', '3420');
      const targetKontoBez = itemKontoBez || 'Nachwuchsförderung';
      
      if (!youthSubsidies[targetKonto]) {
        youthSubsidies[targetKonto] = {
          total: 0,
          konto: targetKonto,
          kontobezeichnung: targetKontoBez
        };
      }
      youthSubsidies[targetKonto].total += totalFee;
    }
  });

  // Zusammenzug der Positionen mit Kategorie 'Kostenübernahme_Jugend'
  // Text und Gegenkonto variabel aus Gebührenconfig
  const masterSubsidy = (window._jbGebuehren || []).find(f => {
    const k = String(f.key || '').trim().toUpperCase();
    const cKat = String(f.kategorie || '').trim().toLowerCase();
    return k === 'KOSTENUEBERNAHME_JUGEND' || cKat === 'kostenübernahme_jugend' || cKat === 'kostenuebernahme_jugend';
  });

  const subsidyTitle = (masterSubsidy && (masterSubsidy.bezeichnung || masterSubsidy.bezeichnungfrontend))
    ? (masterSubsidy.bezeichnung || masterSubsidy.bezeichnungfrontend)
    : 'Beitrag Jugendförderung Verein (Übernahme SpS Muhen)';

  Object.values(youthSubsidies).forEach(sub => {
    if (sub.total > 0) {
      positions.push({
        name: subsidyTitle,
        betrag: -sub.total,
        konto: sub.konto,
        kontobezeichnung: sub.kontobezeichnung || (masterSubsidy ? (masterSubsidy['Kontobezeichnung im KMU-Kontenrahmen'] || masterSubsidy.kontobezeichnung || '') : 'Nachwuchsförderung'),
        typ: 'Kredit',
        key: 'KOSTENUEBERNAHME_JUGEND'
      });
    }
  });

  // 4. Variable Zusatzpositionen (Freie Beträge) - zu 100% dynamisch aus gebuehren_config
  const varFees = (window._jbGebuehren || []).filter(f => {
    const kat = String(f.kategorie || '').toLowerCase();
    const uiTyp = String(f.ui_typ || '').toLowerCase();
    const key = String(f.key || '').toUpperCase();
    return uiTyp === 'amount' || kat === 'variabel' || key.startsWith('Z');
  });

  varFees.forEach(f => {
    const key = String(f.key || '').toUpperCase();
    let isActive = false;
    let customText = '';
    let customBetrag = null;
    let customKonto = '';
    let isLocked = true;

    // A) Falls settings.extras als Objekt oder Array vorliegt
    if (settings.extras && typeof settings.extras === 'object' && !Array.isArray(settings.extras) && settings.extras[key]) {
      isActive = !!settings.extras[key].active;
      customText = settings.extras[key].text;
      customBetrag = settings.extras[key].betrag;
      customKonto = settings.extras[key].konto;
      isLocked = settings.extras[key].unlocked === false || !settings.extras[key].unlocked;
    } else if (Array.isArray(settings.extras)) {
      const match = settings.extras.find(ex => String(ex.key || '').toUpperCase() === key);
      if (match) {
        isActive = !!match.active;
        customText = match.text;
        customBetrag = match.betrag;
        customKonto = match.konto;
        isLocked = match.locked !== false;
      }
    } else if (key === 'Z001' && settings.z1_active !== undefined) {
      // Abwärtskompatible Brücke für historische z1-Felder
      isActive = !!settings.z1_active;
      customText = settings.z1_text;
      customBetrag = settings.z1_betrag;
      customKonto = settings.z1_konto;
      isLocked = settings.z1_unlocked === false;
    } else if (key === 'Z002' && settings.z2_active !== undefined) {
      // Abwärtskompatible Brücke für historische z2-Felder
      isActive = !!settings.z2_active;
      customText = settings.z2_text;
      customBetrag = settings.z2_betrag;
      customKonto = settings.z2_konto;
      isLocked = settings.z2_unlocked === false;
    }

    if (isActive) {
      const posName = (customText && String(customText).trim() !== '') 
        ? String(customText).trim() 
        : (f.ui_feld || f.bezeichnungfrontend || f.bezeichnung || key);
      const posBetrag = (customBetrag !== null && customBetrag !== undefined && !isNaN(Number(customBetrag))) 
        ? Number(customBetrag) 
        : Number(f.betrag || 0);
      const posKonto = (customKonto && String(customKonto).trim() !== '')
        ? String(customKonto).trim()
        : (f.konto_haben || f.konto || '8500');

      if (posBetrag !== 0) {
        positions.push({
          name: posName,
          betrag: posBetrag,
          konto: posKonto,
          locked: isLocked,
          typ: posBetrag >= 0 ? 'Debit' : 'Kredit',
          key: key
        });
      }
    }
  });
  
  // 5. Rabatte
  let isVorstand = m._istVorstand || false;
  let isHausmeister = (m._kategorie || '').toLowerCase().includes('hausmeister') ||
                      Boolean(settings.hausmeister) ||
                      Boolean(settings.events && Number(settings.events['RA002'] || 0) > 0) ||
                      Boolean(eventsMap && Number(eventsMap['RA002'] || 0) > 0);
  
  let hasRA002 = false;
  if (isVorstand && !isEhren) {
    positions.push({
      name: 'Rabatt Vorstand',
      betrag: getFee('RA001', -100),
      typ: 'Kredit',
      key: 'RA001',
      konto: getFeeAccount('RA001', '3410')
    });
  }
  
  if (isHausmeister) {
    const hmKonto = getFeeAccount('RA002', '6002');
    positions.push({
      name: 'Gutschrift Unterhalt Anlage (Hausmeister)',
      betrag: getFee('RA002', -300),
      typ: 'Kredit',
      key: 'RA002',
      konto: hmKonto
    });
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
