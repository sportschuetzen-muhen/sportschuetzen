// vorstand/js/jahresbeitrag/jahresbeitrag-calc.js
// ============================================================
// VIRTUAL LIVE CALCULATOR (Floor CHF 0.00 und alle Tarife)
// ============================================================
function jbCalculateLiveTotal(m, settings) {
  const isEhren = m._istEhren || false;
  const isPassiv = m._istPassiv || false;
  const isIntern = (m.OrganizationName || m.organization_name || '').toLowerCase().includes('intern') ||
                   String(m.OrganizationNumber || m.organization_number || '').trim() === 'INTERN' ||
                   String(m.PersonNumber || '').startsWith('INT-');
  
  const refYear = Number((typeof _jbYear !== 'undefined' && _jbYear) ? _jbYear : new Date().getFullYear());
  const birthYearMatch = m.BirthDate ? String(m.BirthDate).match(/^(\d{4})/) : null;
  const birthYear = birthYearMatch ? parseInt(birthYearMatch[1], 10) : (m.BirthDate ? new Date(m.BirthDate).getFullYear() : 0);
  const age = birthYear > 0 ? (refYear - birthYear) : 0;
  const isJunior = age > 0 && age <= 20;
  
  const configErrors = [];

  const getFeeObj = (key) => {
    const keyClean = String(key || '').trim().toUpperCase();
    return (window._jbGebuehren || []).find(g => {
      const k = String(g.key || '').trim().toUpperCase();
      return k === keyClean || k === keyClean.replace(/^Z0*/, 'Z');
    });
  };

  const getFee = (key) => {
    const obj = getFeeObj(key);
    if (!obj || obj.betrag === undefined || obj.betrag === null || isNaN(Number(obj.betrag))) {
      configErrors.push({ key: String(key || '').toUpperCase(), error: `Tarif '${key}' fehlt oder hat keinen Betrag in gebuehren_config.` });
      return null;
    }
    return Number(obj.betrag);
  };

  const getFeeAccount = (key) => {
    const matched = getFeeObj(key);
    if (matched) {
      const k = String(matched['Haben-Konto-Jahresbeitrag-Buchhaltung'] || matched['Vorgeschlagenes Haben-Konto'] || matched.konto_haben || matched.konto || '').trim();
      if (k) return k;
    }
    configErrors.push({ key: String(key || '').toUpperCase(), error: `Für Tarif '${key}' ist kein Haben-Konto in gebuehren_config hinterlegt.` });
    return null;
  };

  const getFeeName = (key, defaultFallback) => {
    const obj = getFeeObj(key);
    if (obj) {
      const name = obj.bezeichnung_frontend || obj.bezeichnungfrontend || obj.bezeichnung || obj.ui_feld;
      if (name && String(name).trim() !== '') return String(name).trim();
    }
    return defaultFallback || key;
  };

  const positions = [];
  
  // 1. Jahresbeitrag
  let jbKey = '';

  if (isEhren) {
    jbKey = 'JB004';
  } else if (isPassiv) {
    jbKey = 'JB005';
  } else if (isIntern && isJunior) {
    jbKey = 'JB006';
  } else if (isJunior) {
    jbKey = 'JB007';
  } else {
    // Aktiv (inkl. Liegend / Auflage)
    let haupt = m._hauptlizenz || '';
    if (!haupt) {
      const lics = (m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || []).filter(l => (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate);
      const is50mCat = (cat) => cat.includes('50m') || cat.includes('g50') || cat.includes('gewehr 50');
      const is10mCat = (cat) => cat.includes('10m') || cat.includes('g10') || cat.includes('luftgewehr');
      const g50 = lics.find(l => is50mCat((l.MembershipCategory || l.membership_category || '').toLowerCase()));
      const g10 = lics.find(l => is10mCat((l.MembershipCategory || l.membership_category || '').toLowerCase()));
      if (g50) {
        const g50Cat = (g50.MembershipCategory || g50.membership_category || '').toLowerCase();
        const licCat = String(g50.LicenseCategory || g50.license_category || '').trim().toUpperCase();
        const isB = licCat === 'B' || g50Cat.includes('aktiv-b') || g50Cat.includes('aktiv b') || g50Cat.includes('status b');
        haupt = isB ? 'Aktiv-B G50m' : 'Aktiv-A G50m';
      } else if (g10) {
        const g10Cat = (g10.MembershipCategory || g10.membership_category || '').toLowerCase();
        const licCat = String(g10.LicenseCategory || g10.license_category || '').trim().toUpperCase();
        const isB = licCat === 'B' || g10Cat.includes('aktiv-b') || g10Cat.includes('aktiv b') || g10Cat.includes('status b');
        haupt = isB ? 'Aktiv-B G10m' : 'Aktiv-A G10m';
      }
    }

    const hLower = haupt.toLowerCase();
    if (hLower.includes('g50') || hLower.includes('gewehr 50') || hLower.includes('50m')) {
      const isB = hLower.includes('aktiv-b') || hLower.includes('aktiv b') || hLower.includes('status b');
      jbKey = isB ? 'JB002' : 'JB001';
    } else if (hLower.includes('g10') || hLower.includes('luftgewehr') || hLower.includes('10m')) {
      jbKey = 'JB003';
    } else {
      jbKey = 'JB005';
    }
  }

  const rawJbBetrag = getFee(jbKey);
  const jbBetrag = rawJbBetrag !== null ? rawJbBetrag : 0;
  const jbDesc = getFeeName(jbKey, jbKey);
  const jbKonto = getFeeAccount(jbKey);
  
  positions.push({ name: jbDesc, betrag: jbBetrag, typ: 'Debit', key: jbKey, konto: jbKonto });

  // Fallback-Schutz: Falls JB004 manuell > 0 oder historisch ein anderer Tarif ermittelt wurde
  if (isEhren && jbKey !== 'JB004' && jbBetrag > 0) {
    const rawMaxDiscount = getFee('RA003');
    const raKonto = getFeeAccount('RA003');
    const raName = getFeeName('RA003', 'Ehrenmitgliedschaft');

    if (rawMaxDiscount !== null) {
      const maxDiscount = Math.abs(rawMaxDiscount);
      const effectiveDiscount = Math.min(jbBetrag, maxDiscount);
      if (effectiveDiscount > 0) {
        positions.push({
          name: raName,
          betrag: -effectiveDiscount,
          typ: 'Credit',
          key: 'RA003',
          konto: raKonto
        });
      }
    }
  }
  
  // 2. Lizenzen
  const licType = settings.lizenz || 'keine';
  if (licType === 'verein') {
    const licFee = getFee('LI001');
    positions.push({ name: getFeeName('LI001', 'Lizenz eigener Verein (Normal)'), betrag: licFee !== null ? licFee : 0, typ: 'Debit', key: 'LI001', konto: getFeeAccount('LI001') });
  } else if (licType === 'junior') {
    const licFee = getFee('LI002');
    positions.push({ name: getFeeName('LI002', 'Lizenz eigener Verein (Junior)'), betrag: licFee !== null ? licFee : 0, typ: 'Debit', key: 'LI002', konto: getFeeAccount('LI002') });
  } else if (licType === 'fremd') {
    const licFee = getFee('LI003');
    positions.push({ name: getFeeName('LI003', 'Lizenz anderer Verein'), betrag: licFee !== null ? licFee : 0, typ: 'Debit', key: 'LI003', konto: getFeeAccount('LI003') });
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
      const hatG50m = (m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || []).some(l => {
        const mc = (l.MembershipCategory || l.membership_category || '').toLowerCase();
        return (l.IsActive == 1 || l.IsActive === true) && !l.ExitDate && (mc.includes('g50') || mc.includes('gewehr 50') || mc.includes('50m'));
      });
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
    // Variable Zusatzpositionen (Z001, Z002, Z003 / ui_typ='amount' / kategorie='variabel')
    // dürfen hier NICHT mit dem Standardbetrag aus gebuehren_config eingerechnet werden,
    // sondern werden ausschliesslich in Schritt 4 mit dem individuellen Betrag verarbeitet.
    const feeUiTyp = feeObj ? String(feeObj.ui_typ || '').trim().toLowerCase() : '';
    const feeKatCheck = feeObj ? String(feeObj.kategorie || '').trim().toLowerCase() : '';
    if (keyClean.startsWith('Z') || feeUiTyp === 'amount' || feeKatCheck === 'variabel') return;

    const rawUnitPrice = feeObj ? Number(feeObj.betrag || 0) : getFee(keyClean);
    const unitPrice = rawUnitPrice !== null ? rawUnitPrice : 0;
    
    // Counter-Typen wie Volksschiessen multiplizieren mit der Anzahl Stiche
    const isCounter = (feeObj && feeObj.ui_typ === 'counter') || keyClean === 'KK008';
    const count = isCounter ? numVal : 1;
    const totalFee = count * unitPrice;

    let desc = feeObj ? (feeObj.bezeichnungfrontend || feeObj.bezeichnung || keyClean) : getFeeName(keyClean, keyClean);
    if (isCounter && count > 0) {
      desc += ` (${count} Stich${count > 1 ? 'e' : ''})`;
    }

    const itemKonto = getFeeAccount(keyClean);
    const itemKontoBez = feeObj ? (feeObj['Kontobezeichnung im KMU-Kontenrahmen'] || feeObj.kontobezeichnung || '') : '';

    positions.push({
      name: desc,
      betrag: totalFee,
      konto: itemKonto,
      typ: 'Debit',
      key: keyClean
    });

    // Option A: Automatische Kostenübernahme für Junioren bei allen Wettkämpfen (KK & LG)
    const feeKat = feeObj ? String(feeObj.kategorie || '').trim().toLowerCase() : '';
    const isKostenuebernahme = isJunior && (
      feeKat === 'kostenübernahme_jugend' || 
      feeKat === 'kostenuebernahme_jugend' ||
      feeKat.includes('kleinkaliber') ||
      feeKat.includes('luftgewehr') ||
      feeKat.includes('wettkampf') ||
      feeKat.includes('schiessgeld') ||
      keyClean.startsWith('KK') ||
      keyClean.startsWith('LG')
    );

    if (isKostenuebernahme && totalFee > 0) {
      // Gegenkonto variabel aus der Gebührenconfig des Eintrags oder Master-Eintrags holen
      const targetKonto = itemKonto || getFeeAccount('KOSTENUEBERNAHME_JUGEND');
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

  const subsidyTitle = (masterSubsidy && (masterSubsidy.bezeichnung || masterSubsidy.bezeichnung_frontend || masterSubsidy.bezeichnungfrontend))
    ? (masterSubsidy.bezeichnung || masterSubsidy.bezeichnung_frontend || masterSubsidy.bezeichnungfrontend)
    : 'Kostenübernahme Verein (Nachwuchsförderung)';

  Object.values(youthSubsidies).forEach(sub => {
    if (sub.total > 0) {
      positions.push({
        name: subsidyTitle,
        betrag: -sub.total,
        konto: sub.konto,
        kontobezeichnung: sub.kontobezeichnung || (masterSubsidy ? (masterSubsidy['Kontobezeichnung im KMU-Kontenrahmen'] || masterSubsidy.kontobezeichnung || '') : 'Nachwuchsförderung'),
        typ: 'Credit',
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
    } else if (typeof _jbPositionsCache !== 'undefined' && _jbPositionsCache && m && m.PersonNumber) {
      // Fallback auf bereits gespeicherte Position im Cache (z.B. bei partiellem Bulk-Update)
      const pnCleanVar = String(m.PersonNumber || '').trim();
      const yrVar = typeof _jbYear !== 'undefined' ? _jbYear : new Date().getFullYear();
      const candidateKeysVar = [`CH-${yrVar}-${pnCleanVar}`, `${yrVar}-${pnCleanVar}`, pnCleanVar];
      for (const ck of candidateKeysVar) {
        const list = _jbPositionsCache[ck];
        if (Array.isArray(list) && list.length > 0) {
          const matches = list.filter(ep => String(ep.source_field || ep.sourcefield || ep.key || '').trim().toUpperCase() === key);
          const matchedPos = matches.find(ep => Number(ep.betrag || 0) !== Number(f.betrag || 0)) || matches[matches.length - 1];
          if (matchedPos) {
            isActive = true;
            customText = matchedPos.beschreibung || matchedPos.name;
            customBetrag = Number(matchedPos.betrag || 0);
            customKonto = matchedPos.konto;
          }
          break;
        }
      }
    }

    if (isActive) {
      const posName = (customText && String(customText).trim() !== '') 
        ? String(customText).trim() 
        : (f.bezeichnung_frontend || f.bezeichnungfrontend || f.bezeichnung || f.ui_feld || key);
      const posBetrag = (customBetrag !== null && customBetrag !== undefined && !isNaN(Number(customBetrag))) 
        ? Number(customBetrag) 
        : Number(f.betrag || 0);
      const posKonto = (customKonto && String(customKonto).trim() !== '')
        ? String(customKonto).trim()
        : (f.konto_haben || f.konto || getFeeAccount(key));

      if (posBetrag !== 0) {
        positions.push({
          name: posName,
          betrag: posBetrag,
          konto: posKonto,
          locked: isLocked,
          typ: posBetrag >= 0 ? 'Debit' : 'Credit',
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
    const rawVal = getFee('RA001');
    if (rawVal !== null) {
      positions.push({
        name: getFeeName('RA001', 'Rabatt Vorstand'),
        betrag: -Math.abs(rawVal),
        typ: 'Credit',
        key: 'RA001',
        konto: getFeeAccount('RA001')
      });
    }
  }
  
  if (isHausmeister) {
    const rawVal = getFee('RA002');
    if (rawVal !== null) {
      positions.push({
        name: getFeeName('RA002', 'Gutschrift Unterhalt Anlage (Hausmeister)'),
        betrag: -Math.abs(rawVal),
        typ: 'Credit',
        key: 'RA002',
        konto: getFeeAccount('RA002')
      });
      hasRA002 = true;
    }
  }

  // 6. Gruppengewinne auswärtige Schiessen (Konto 1301) bewahren
  const pnClean = String(m.PersonNumber || '').trim();
  const yr = typeof _jbYear !== 'undefined' ? _jbYear : new Date().getFullYear();
  if (typeof _jbPositionsCache !== 'undefined' && _jbPositionsCache && pnClean) {
    const candidateKeys = [`CH-${yr}-${pnClean}`, `${yr}-${pnClean}`, pnClean];
    for (const ck of candidateKeys) {
      const list = _jbPositionsCache[ck];
      if (Array.isArray(list) && list.length > 0) {
        list.forEach(ep => {
          const sf = String(ep.source_field || ep.sourcefield || ep.key || '').trim();
          const kt = String(ep.konto || '').trim();
          if (sf === '1301' || kt === '1301') {
            const desc = ep.beschreibung || ep.name || 'Gutschrift Gruppengewinn';
            const amt = -Math.abs(Number(ep.betrag || 0));
            if (amt !== 0 && !positions.some(p => (p.key === '1301' || p.konto === '1301') && p.name === desc)) {
              positions.push({
                name: desc,
                betrag: amt,
                typ: 'Credit',
                key: '1301',
                konto: '1301'
              });
            }
          }
        });
        break;
      }
    }
  }
  
  // Summing up
  let total = 0;
  positions.forEach(p => { total += p.betrag; });
  
  // Floor check: If not janitor (Hausmeister), floor at 0
  if (!hasRA002) {
    total = Math.max(0, total);
  }
  
  return { positions, total, configErrors };
}

// ============================================================
// FORMAT HELPERS (Delegation an globales UIFormatKit)
// ============================================================
function fmtChf(val) {
  if (window.UIFormatKit && typeof window.UIFormatKit.money === 'function') {
    return window.UIFormatKit.money(Number(val || 0), { fallback: 'CHF 0.00' });
  }
  const num = Number(val || 0);
  const absFixed = Math.abs(num).toFixed(2).split('.');
  absFixed[0] = absFixed[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
  return (num < 0 ? '- CHF ' : 'CHF ') + absFixed.join('.');
}
function fmtDate(val) {
  if (window.UIFormatKit && typeof window.UIFormatKit.date === 'function') {
    return window.UIFormatKit.date(val, { fallback: '–' });
  }
  if (!val || val === '') return '–';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('de-CH');
}
