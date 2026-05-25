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
  
  const positions = [];
  
  // 1. Jahresbeitrag
  let jbBetrag = 0;
  let jbDesc = '';
  if (isEhren) {
    jbBetrag = 0;
    jbDesc = 'Jahresbeitrag Ehrenmitglied';
  } else if (isPassiv) {
    jbBetrag = 20;
    jbDesc = 'Jahresbeitrag Passivmitglied';
  } else if (isIntern) {
    jbBetrag = 0;
    jbDesc = 'Schüler intern (ohne Lizenz)';
  } else if (isJunior) {
    jbBetrag = 0;
    jbDesc = 'Jahresbeitrag Junior';
  } else {
    // Aktiv
    const haupt = m._hauptlizenz || '';
    if (haupt.includes('G50m')) {
      if (haupt.includes('Aktiv-A')) {
        jbBetrag = 100;
        jbDesc = 'Jahresbeitrag Aktiv A G50m';
      } else {
        jbBetrag = 70;
        jbDesc = 'Jahresbeitrag Aktiv B G50m';
      }
    } else if (haupt.includes('G10m')) {
      jbBetrag = 10;
      jbDesc = 'Jahresbeitrag Aktiv nur 10m';
    } else {
      // Kein eigener Muhen-Lizenz-Typ erkannt (z.B. nur Fremdlizenz G300)
      // → Mitglied gilt als Passivmitglied (JB005 = 20 CHF)
      jbBetrag = 20;
      jbDesc = 'Jahresbeitrag Passivmitglied (keine eigene Lizenz)';
    }
  }
  
  positions.push({ name: jbDesc, betrag: jbBetrag, typ: 'Debit' });
  
  // 2. Lizenzen
  const licType = settings.lizenz || 'keine';
  if (licType === 'verein') {
    positions.push({ name: 'Lizenz eigener Verein (Normal)', betrag: 18, typ: 'Debit' });
  } else if (licType === 'junior') {
    positions.push({ name: 'Lizenz eigener Verein (Junior)', betrag: 0, typ: 'Debit' });
  } else if (licType === 'fremd') {
    positions.push({ name: 'Lizenz anderer Verein', betrag: 0, typ: 'Debit' });
  }
  
  // 3. Schützenhaus (GE001)
  // G50m Lizenzinhaber, nicht Junior, nicht Passiv
  const hatG50mOwn = (m._lizenzen || []).some(l => l.istMuhen && l.MembershipCategory.toLowerCase().includes('g50'));
  if (!isJunior && hatG50mOwn && !isPassiv) {
    positions.push({ name: 'Schützenhaus (Infrastrukturbeitrag)', betrag: 50, typ: 'Debit' });
  }
  
  // 4. Turniere
  // KK Volksschiessen (KK008)
  const volk = settings.kk_volksschiessen || 'keine';
  if (volk !== 'keine') {
    let stiche = 1;
    if (volk === '2') stiche = 2;
    if (volk === '3') stiche = 3;
    positions.push({ name: `KK Volksschiessen (${stiche} Stich${stiche > 1 ? 'e' : ''})`, betrag: stiche * 15, typ: 'Debit' });
  }
  
  // SSV dez (KK002/003/004/005)
  const ssvdez = settings.ssv_dez || 'keine';
  if (ssvdez !== 'keine') {
    if (ssvdez === 'liegend') {
      positions.push({ name: '50m AG DEZ liegend', betrag: 24, typ: 'Debit' });
    } else if (ssvdez === '2-stellung') {
      positions.push({ name: '50m AG DEZ 2-Stellung', betrag: 24, typ: 'Debit' });
    } else if (ssvdez === '3-stellung') {
      positions.push({ name: '50m AG DEZ 3-Stellung', betrag: 24, typ: 'Debit' });
    } else if (ssvdez === 'liegend_2_3') {
      positions.push({ name: '50m AG DEZ liegend & 2-Stellung & 3-Stellung', betrag: 72, typ: 'Debit' });
    } else if (ssvdez === 'js') {
      positions.push({ name: '50m AG DEZ (Jungschütze)', betrag: 0, typ: 'Debit' });
    }
  }
  
  // KK Grenzland (KK001)
  const grenz = settings.kk_grenzland || 'keine';
  if (grenz === '1') {
    positions.push({ name: '50m Grenzland', betrag: 15, typ: 'Debit' });
  } else if (grenz === 'js') {
    positions.push({ name: '50m Grenzland (Jungschütze)', betrag: 0, typ: 'Debit' });
  }
  
  // Toggles for 50m
  if (settings.kk_verband) positions.push({ name: '50m Verbandsschiessen', betrag: 15, typ: 'Debit' });
  if (settings.kk_verein)  positions.push({ name: '50m Vereinsschiessen', betrag: 15, typ: 'Debit' });
  
  // Toggles for 10m
  if (settings.lg_ag_dez)         positions.push({ name: '10m AG DEZ', betrag: 17, typ: 'Debit' });
  if (settings.lg_ag_dez_auflage) positions.push({ name: '10m AG DEZ Auflage', betrag: 17, typ: 'Debit' });
  if (settings.lg_ch_dez)         positions.push({ name: '10m CH DEZ', betrag: 20, typ: 'Debit' });
  if (settings.lg_ch_dez_auflage) positions.push({ name: '10m CH DEZ Auflage', betrag: 20, typ: 'Debit' });
  if (settings.lg_verband)        positions.push({ name: '10m Verbandsschiessen', betrag: 11, typ: 'Debit' });
  if (settings.lg_verein)         positions.push({ name: '10m Vereinsschiessen', betrag: 14, typ: 'Debit' });
  if (settings.lg_ch_kniend)      positions.push({ name: '10m CH Kniendmeisterschaft', betrag: 20, typ: 'Debit' });
  
  // 5. Rabatte
  let isVorstand = m._istVorstand || false;
  let isHausmeister = (m._kategorie || '').toLowerCase().includes('hausmeister');
  
  let hasRA002 = false;
  if (isVorstand && !isEhren) {
    positions.push({ name: 'Rabatt Vorstand', betrag: -100, typ: 'Kredit' });
  }
  
  if (isHausmeister) {
    positions.push({ name: 'Gutschrift Unterhalt Anlage (Hausmeister)', betrag: -300, typ: 'Kredit' });
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
