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
  
  // 3. Schützenhaus (GE001)
  // G50m Lizenzinhaber, nicht Junior, nicht Passiv
  const hatG50mOwn = (m._lizenzen || []).some(l => l.istMuhen && l.MembershipCategory.toLowerCase().includes('g50'));
  if (!isJunior && hatG50mOwn && !isPassiv) {
    positions.push({ name: 'Schützenhaus (Infrastrukturbeitrag)', betrag: getFee('GE001', 50), typ: 'Debit' });
  }
  
  // 4. Turniere
  // KK Volksschiessen (KK008)
  const volk = settings.kk_volksschiessen || 'keine';
  if (volk !== 'keine') {
    let stiche = 1;
    if (volk === '2') stiche = 2;
    if (volk === '3') stiche = 3;
    const volkFee = getFee('KK008', 15);
    positions.push({ name: `KK Volksschiessen (${stiche} Stich${stiche > 1 ? 'e' : ''})`, betrag: stiche * volkFee, typ: 'Debit' });
  }
  
  // SSV dez (KK002/003/004/005)
  const ssvdez = settings.ssv_dez || 'keine';
  if (ssvdez !== 'keine') {
    if (ssvdez === 'liegend') {
      positions.push({ name: '50m AG DEZ liegend', betrag: getFee('KK002', 24), typ: 'Debit' });
    } else if (ssvdez === '2-stellung') {
      positions.push({ name: '50m AG DEZ 2-Stellung', betrag: getFee('KK003', 24), typ: 'Debit' });
    } else if (ssvdez === '3-stellung') {
      positions.push({ name: '50m AG DEZ 3-Stellung', betrag: getFee('KK004', 24), typ: 'Debit' });
    } else if (ssvdez === 'liegend_2_3') {
      const sumDez = getFee('KK002', 24) + getFee('KK003', 24) + getFee('KK004', 24);
      positions.push({ name: '50m AG DEZ liegend & 2-Stellung & 3-Stellung', betrag: sumDez, typ: 'Debit' });
    } else if (ssvdez === 'js') {
      positions.push({ name: '50m AG DEZ (Jungschütze)', betrag: 0, typ: 'Debit' });
    }
  }
  
  // KK Grenzland (KK001)
  const grenz = settings.kk_grenzland || 'keine';
  if (grenz === '1') {
    positions.push({ name: '50m Grenzland', betrag: getFee('KK001', 15), typ: 'Debit' });
  } else if (grenz === 'js') {
    positions.push({ name: '50m Grenzland (Jungschütze)', betrag: 0, typ: 'Debit' });
  }
  
  // Toggles for 50m
  if (settings.kk_verband) positions.push({ name: '50m Verbandsschiessen', betrag: getFee('KK006', 15), typ: 'Debit' });
  if (settings.kk_verein)  positions.push({ name: '50m Vereinsschiessen', betrag: getFee('KK007', 15), typ: 'Debit' });
  
  // Toggles for 10m
  if (settings.lg_ag_dez)         positions.push({ name: '10m AG DEZ', betrag: getFee('LG001', 17), typ: 'Debit' });
  if (settings.lg_ag_dez_auflage) positions.push({ name: '10m AG DEZ Auflage', betrag: getFee('LG002', 17), typ: 'Debit' });
  if (settings.lg_ch_dez)         positions.push({ name: '10m CH DEZ', betrag: getFee('LG003', 20), typ: 'Debit' });
  if (settings.lg_ch_dez_auflage) positions.push({ name: '10m CH DEZ Auflage', betrag: getFee('LG004', 20), typ: 'Debit' });
  if (settings.lg_verband)        positions.push({ name: '10m Verbandsschiessen', betrag: getFee('LG005', 11), typ: 'Debit' });
  if (settings.lg_verein)         positions.push({ name: '10m Vereinsschiessen', betrag: getFee('LG006', 14), typ: 'Debit' });
  if (settings.lg_ch_kniend)      positions.push({ name: '10m CH Kniendmeisterschaft', betrag: getFee('LG007', 20), typ: 'Debit' });
  
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
