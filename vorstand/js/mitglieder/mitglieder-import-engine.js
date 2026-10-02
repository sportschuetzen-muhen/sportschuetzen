// ==============================================================================
// mitglieder-import-engine.js
// Client-native SSV-Import- und Diff-Engine für ultraschnellen Import und
// atomare Persistierung via PostgreSQL RPC (apply_ssv_import_batch).
// Supabase Single Source of Truth (Sportschützen Muhen)
// ==============================================================================

(function(window) {
  'use strict';

  // --- 1. KONSTANTEN & FELDER ---

  const BOOLEANFIELDS = ['IsActive', 'IsPassive', 'Deceased', 'IsHonoraryMember', 'Ist_Aktuell'];
  const PHONEFIELDS = [
    'BusinessLandlinePhone',
    'BusinessMobilePhone',
    'PrivateLandlinePhone',
    'PrivateMobilePhone'
  ];
  const MEMBERSMANUALPROTECTEDFIELDS = ['IsPassive', 'IsHonoraryMember', 'ClubEntryDate', 'HonoraryMemberSince'];

  const STAMMDATENFELDER = [
    'FirstName', 'LastName', 'Street', 'PostCode', 'City', 'PrimaryEmail',
    'BirthDate', 'Nationality',
    'BusinessLandlinePhone', 'BusinessMobilePhone',
    'PrivateLandlinePhone', 'PrivateMobilePhone'
  ];

  const DATEFIELDS = [
    'BirthDate', 'ClubEntryDate', 'FirstClubEntryDateSSV', 'HonoraryMemberSince',
    'Todesdatum', 'Vereinsaustritt', 'EntryDate', 'ExitDate',
    'OfficialFunctionEntryDate', 'OfficialFunctionExitDate',
    'CompletedTrainingDate', 'CompletedTrainingExpirationDate',
    'ExportedOn', 'Valid_From', 'Valid_To'
  ];

  // --- 2. HILFSFUNKTIONEN (NORMALISIERUNG & PARSING) ---

  function isTruthy(v) {
    if (v === true || v === 1) return true;
    const s = String(v || '').trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'wahr';
  }

  function normalizePhone(raw) {
    if (!raw) return '';
    let num = String(raw).trim().replace(/^[='\s]+/, '');
    if (num.startsWith('#') || num.startsWith('=')) return '';

    const hatPlus = num.startsWith('+');
    num = num.replace(/\D/g, '');
    if (!num) return '';

    if (num.startsWith('0041')) {
      num = '41' + num.slice(4);
    } else if (num.startsWith('41') && num.length === 11) {
    } else if (num.startsWith('0')) {
      num = '41' + num.slice(1);
    } else if (!hatPlus && !num.startsWith('41')) {
      num = '41' + num;
    }

    if (num.startsWith('41')) {
      if (num.length !== 11) return '+' + num + ' ⚠️';
    } else {
      if (num.length < 10 || num.length > 15) return '+' + num + ' ⚠️';
    }
    return '+' + num;
  }

  function normalizeDateValue(val) {
    if (val === null || val === undefined || val === '') return '';

    function isNullIsoDate(iso) {
      return iso === '1899-12-30' || iso === '1899-12-31';
    }

    if (val instanceof Date) {
      if (isNaN(val.getTime())) return '';
      const iso = val.toISOString().split('T')[0];
      return isNullIsoDate(iso) ? '' : iso;
    }

    if (typeof val === 'number') {
      if (!isFinite(val) || val <= 1) return '';
      const baseUtc = Date.UTC(1899, 11, 30);
      const d = new Date(baseUtc + Math.round(val) * 86400000);
      if (isNaN(d.getTime())) return '';
      const iso = d.toISOString().split('T')[0];
      return isNullIsoDate(iso) ? '' : iso;
    }

    const s = String(val).trim();
    if (!s || s === '0' || s === '00.00.0000') return '';

    // Schweizer Format DD.MM.YYYY
    const dmy = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (dmy) {
      const iso = [dmy[3], dmy[2].padStart(2, '0'), dmy[1].padStart(2, '0')].join('-');
      return isNullIsoDate(iso) ? '' : iso;
    }

    // ISO Format YYYY-MM-DD
    const isoTs = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (isoTs) {
      const iso = [isoTs[1], isoTs[2], isoTs[3]].join('-');
      return isNullIsoDate(iso) ? '' : iso;
    }

    const d = new Date(s);
    if (!isNaN(d.getTime())) {
      const iso = d.toISOString().split('T')[0];
      return isNullIsoDate(iso) ? '' : iso;
    }
    return '';
  }

  function normalizeCompareValue(field, value) {
    if (value === null || value === undefined) return '';
    if (BOOLEANFIELDS.includes(field)) {
      return isTruthy(value) ? '1' : '0';
    }
    if (DATEFIELDS.includes(field)) {
      return normalizeDateValue(value);
    }
    if (PHONEFIELDS.includes(field)) {
      return normalizePhone(value);
    }
    return String(value).trim();
  }

  function formatValueForDiff(field, value) {
    if (value === null || value === undefined || value === '') return '';
    if (BOOLEANFIELDS.includes(field)) {
      return isTruthy(value) ? 'WAHR' : 'FALSCH';
    }
    if (DATEFIELDS.includes(field)) {
      return normalizeDateValue(value);
    }
    if (PHONEFIELDS.includes(field)) {
      return normalizePhone(value);
    }
    return String(value).trim();
  }

  const MUHEN_CLUB_NUMBER = '1.19.0.01.029';

  function isStatusCategory(cat) {
    const s = String(cat || '').trim().toLowerCase();
    return s === 'passiv' || s.startsWith('ehren');
  }

  function isLicenseCategory(cat) {
    return String(cat || '').trim().toLowerCase().startsWith('aktiv-');
  }

  function getDisciplineKey(cat) {
    const s = String(cat || '').trim();
    if (/g10m.*auflage/i.test(s)) return 'G10m Auflage';
    if (/g50m.*auflage/i.test(s)) return 'G50m Auflage';
    if (/g50m|50m/i.test(s)) return 'G50m';
    if (/g10m|10m/i.test(s)) return 'G10m';
    if (/300m/i.test(s)) return 'G300m';
    if (/pisto/i.test(s)) return 'Pistole';
    const clean = s.replace(/^Aktiv-[AB]\s*/i, '').trim();
    return clean || 'Lizenz';
  }

  function getFullName(obj) {
    return [obj.FirstName || '', obj.LastName || ''].join(' ').trim();
  }

  function dedupeBy(arr, keyFn) {
    const map = new Map();
    arr.forEach(item => {
      const key = keyFn(item);
      if (!map.has(key)) {
        map.set(key, item);
      } else {
        const oldItem = map.get(key);
        const oldEnd = oldItem.ExitDate || oldItem.OfficialFunctionExitDate;
        const newEnd = item.ExitDate || item.OfficialFunctionExitDate;
        if (!oldEnd && newEnd) map.set(key, item);
      }
    });
    return Array.from(map.values());
  }

  // --- 3. EXTRAKTOREN (1:1 aus extractors.js) ---

  function extractMembershipStatus(rows) {
    const statusRows = rows.filter(
      r => r.MembershipCategory && !r.OfficialFunctionCategory && isStatusCategory(r.MembershipCategory)
    );
    const passiveRows = statusRows.filter(
      r => String(r.MembershipCategory).trim().toLowerCase() === 'passiv'
    );
    const honoraryRows = statusRows.filter(
      r => /^ehren/i.test(String(r.MembershipCategory).trim())
    );

    const passiveSince = passiveRows
      .map(r => normalizeDateValue(r.EntryDate))
      .filter(Boolean)
      .sort()[0] || '';

    const honorarySince = honoraryRows
      .map(r => normalizeDateValue(r.EntryDate))
      .filter(Boolean)
      .sort()[0] || '';

    const isActive = rows.some(r => isTruthy(r.IsActive)) ? 1 : 0;
    const isDeceased = rows.some(r => isTruthy(r.Deceased)) ? 1 : 0;

    const entryDates = rows
      .filter(r => r.MembershipCategory && !r.OfficialFunctionCategory)
      .map(r => normalizeDateValue(r.EntryDate))
      .filter(Boolean)
      .sort();

    return {
      IsActive: isActive,
      Deceased: isDeceased,
      IsPassive: passiveRows.length ? 1 : 0,
      PassiveSince: passiveSince,
      IsHonoraryMember: honoraryRows.length ? 1 : 0,
      HonoraryMemberSince: honorarySince,
      HonoraryMemberSinceSource: honorarySince ? 'ssvsync' : '',
      FirstClubEntryDateSSV: entryDates[0] || ''
    };
  }

  function extractAllLicenses(rows) {
    return dedupeBy(
      rows
        .filter(r => r.MembershipCategory && !r.OfficialFunctionCategory && isLicenseCategory(r.MembershipCategory))
        .map(r => ({
          MembershipCategory: String(r.MembershipCategory).trim(),
          EntryDate: normalizeDateValue(r.EntryDate),
          ExitDate: normalizeDateValue(r.ExitDate),
          LicenseCategory: r.LicenseCategory || '',
          LicenseType: r.LicenseType || '',
          LicenseInvoicingClubNumber: r.LicenseInvoicingClubNumber || '',
          LicenseInvoicingClubName: r.LicenseInvoicingClubName || '',
          IsActive: isTruthy(r.IsActive) ? 1 : 0
        })),
      x => [x.MembershipCategory, x.EntryDate, x.ExitDate].join('|')
    ).sort((a, b) => String(a.EntryDate).localeCompare(String(b.EntryDate)));
  }

  function extractActiveFunctions(rows) {
    return rows
      .filter(z => z.OfficialFunctionCategory && !z.OfficialFunctionExitDate)
      .map(z => ({
        OfficialFunctionCategory: String(z.OfficialFunctionCategory).trim(),
        OfficialFunctionRemark: z.OfficialFunctionRemark || '',
        OfficialFunctionEntryDate: normalizeDateValue(z.OfficialFunctionEntryDate),
        OfficialFunctionExitDate: normalizeDateValue(z.OfficialFunctionExitDate),
        UseOnBoardAndFunctionaryReport: isTruthy(z.UseOnBoardAndFunctionaryReport)
      }));
  }

  function extractTraining(rows) {
    return dedupeBy(
      rows
        .filter(r => r.CourseCategory && r.Module)
        .map(r => ({
          CourseCategory: r.CourseCategory || '',
          Module: r.Module || '',
          CompletedTrainingDate: normalizeDateValue(r.CompletedTrainingDate),
          TrainingStatus: r.TrainingStatus || '',
          CompletedTrainingExpirationDate: normalizeDateValue(r.CompletedTrainingExpirationDate)
        })),
      x => [x.CourseCategory, x.Module, x.CompletedTrainingDate].join('|')
    );
  }

  // --- 4. BROWSER-DIFF ENGINE (1:1 aus diffBuilder.js) ---

  function runClientSSVDiffCalculation(rawRows, currentMembers, currentLicenses, currentFunctions, currentTraining) {
    if (!rawRows || rawRows.length < 2) {
      throw new Error('Keine Zeilen im Excel-Upload gefunden.');
    }

    const headers = rawRows[0].map(h => String(h || '').trim());
    const byPerson = {};

    for (let i = 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = row[idx] !== undefined ? row[idx] : '';
      });
      const pn = String(obj.PersonNumber || '').trim();
      if (!pn) continue;
      if (!byPerson[pn]) byPerson[pn] = [];
      byPerson[pn].push(obj);
    }

    const importId = 'IMP-' + new Date().toISOString().replace(/\D/g, '').slice(0, 14);

    const memberMap = new Map();
    (currentMembers || []).forEach(m => {
      const pn = String(m.PersonNumber || m.person_number || '').trim();
      if (pn) memberMap.set(pn, m);
    });

    const licMap = {};
    (currentLicenses || []).forEach(l => {
      const pn = String(l.PersonNumber || l.person_number || '').trim();
      if (!licMap[pn]) licMap[pn] = [];
      licMap[pn].push(l);
    });

    const fnMap = {};
    (currentFunctions || []).forEach(f => {
      const pn = String(f.PersonNumber || f.person_number || '').trim();
      if (!fnMap[pn]) fnMap[pn] = [];
      fnMap[pn].push(f);
    });

    const trMap = {};
    (currentTraining || []).forEach(t => {
      const pn = String(t.PersonNumber || t.person_number || '').trim();
      if (!trMap[pn]) trMap[pn] = [];
      trMap[pn].push(t);
    });

    const diffRows = [];

    // 1. ABGANG-Logik: Lokal aktiv, im Export fehlend
    memberMap.forEach((m, pn) => {
      if (!byPerson[pn] && !pn.startsWith('intern')) {
        const isActive = isTruthy(m.IsActive !== undefined ? m.IsActive : m.is_active);
        if (isActive) {
          diffRows.push([
            importId, pn, getFullName(m), 'members', 'IsActive',
            'WAHR', 'FALSCH', 'ABGANG', 'Update',
            'Im aktuellen Verbandsexport nicht mehr aufgeführt.'
          ]);
        }
      }
    });

    // 2. NEUE & GEÄNDERTE MITGLIEDER
    Object.entries(byPerson).forEach(([pn, rows]) => {
      const base = rows[0];
      const existing = memberMap.get(pn);
      const fullName = getFullName(base);
      const status = extractMembershipStatus(rows);

      if (!existing) {
        // Neues Mitglied
        diffRows.push([
          importId, pn, fullName, 'members', 'PersonNumber',
          '', pn, 'NEU', 'Update',
          'Neues Vereinsmitglied im Verband erfasst. Neue Stammdaten anlegen.'
        ]);
      } else {
        // Stammdaten-Vergleich
        STAMMDATENFELDER.forEach(feld => {
          // Feld-Mapping für Supabase/Legacy
          const legacyVal = existing[feld] !== undefined ? existing[feld] : existing[feld.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')];
          const neu = normalizeCompareValue(feld, base[feld]);
          const alt = normalizeCompareValue(feld, legacyVal);
          if (neu !== alt && neu !== '') {
            diffRows.push([
              importId, pn, fullName, 'members', feld,
              formatValueForDiff(feld, alt), formatValueForDiff(feld, neu),
              'AENDERUNG', 'Update',
              `Stammdaten im Verband aktualisiert (${feld} abgeglichen).`
            ]);
          }
        });

        // Status-Vergleich mit Source-Protection
        const localIsActive = isTruthy(existing.IsActive !== undefined ? existing.IsActive : existing.is_active) ? 1 : 0;
        const localIsDeceased = isTruthy(existing.Deceased !== undefined ? existing.Deceased : existing.deceased) ? 1 : 0;
        const localIsPassive = isTruthy(existing.IsPassive !== undefined ? existing.IsPassive : existing.is_passive) ? 1 : 0;
        const localIsHonorary = isTruthy(existing.IsHonoraryMember !== undefined ? existing.IsHonoraryMember : existing.is_honorary) ? 1 : 0;
        const localHonorarySince = String(existing.HonoraryMemberSince || existing.honorary_member_since || '').trim();

        const passiveProt = String(existing.IsPassiveSource || existing.is_passive_source || '').trim().toLowerCase() === 'manual';
        const honoraryProt = String(existing.IsHonoraryMemberSource || existing.is_honorary_source || '').trim().toLowerCase() === 'manual';

        if (status.IsActive !== localIsActive) {
          diffRows.push([
            importId, pn, fullName, 'members', 'IsActive',
            formatValueForDiff('IsActive', localIsActive), formatValueForDiff('IsActive', status.IsActive),
            'AENDERUNG', 'Update',
            'Stammdaten im Verband aktualisiert (Aktiv-Status).'
          ]);
        }
        if (status.Deceased !== localIsDeceased) {
          diffRows.push([
            importId, pn, fullName, 'members', 'Deceased',
            formatValueForDiff('Deceased', localIsDeceased), formatValueForDiff('Deceased', status.Deceased),
            'AENDERUNG', 'Update',
            'Stammdaten im Verband aktualisiert (Todesfall).'
          ]);
        }
        if (status.IsPassive !== localIsPassive && !passiveProt) {
          diffRows.push([
            importId, pn, fullName, 'members', 'IsPassive',
            formatValueForDiff('IsPassive', localIsPassive), formatValueForDiff('IsPassive', status.IsPassive),
            'AENDERUNG', 'Update',
            'Stammdaten im Verband aktualisiert (Passiv-Status).'
          ]);
        }
        if (status.IsHonoraryMember !== localIsHonorary && !honoraryProt) {
          diffRows.push([
            importId, pn, fullName, 'members', 'IsHonoraryMember',
            formatValueForDiff('IsHonoraryMember', localIsHonorary), formatValueForDiff('IsHonoraryMember', status.IsHonoraryMember),
            'AENDERUNG', 'Update',
            'Stammdaten im Verband aktualisiert (Ehrenmitglied-Status).'
          ]);
        }
        if (status.HonoraryMemberSince && normalizeDateValue(status.HonoraryMemberSince) !== normalizeDateValue(localHonorarySince) && !honoraryProt) {
          diffRows.push([
            importId, pn, fullName, 'members', 'HonoraryMemberSince',
            formatValueForDiff('HonoraryMemberSince', localHonorarySince), formatValueForDiff('HonoraryMemberSince', status.HonoraryMemberSince),
            'AENDERUNG', 'Update',
            'Stammdaten im Verband aktualisiert (Ehrenmitglied seit).'
          ]);
        }
      }

      // 3. LIZENZEN-VERGLEICH (Disziplinen-basiert nach Variante A)
      const ssvAllLizenzen = extractAllLicenses(rows);
      const ssvLizenzenAktiv = ssvAllLizenzen.filter(l =>
        isLicenseCategory(l.MembershipCategory) &&
        isTruthy(l.IsActive) &&
        !l.ExitDate
      );
      const lokLicAktiv = (licMap[pn] || []).filter(l =>
        isTruthy(l.IsActive !== undefined ? l.IsActive : l.is_active) &&
        !(l.ExitDate || l.exit_date)
      );

      const dispSet = new Set();
      ssvAllLizenzen.forEach(l => {
        if (isLicenseCategory(l.MembershipCategory)) dispSet.add(getDisciplineKey(l.MembershipCategory));
      });
      lokLicAktiv.forEach(l => {
        const cat = l.MembershipCategory || l.membership_category;
        if (isLicenseCategory(cat)) dispSet.add(getDisciplineKey(cat));
      });

      const processedDisciplines = Array.from(dispSet).sort();

      processedDisciplines.forEach(disp => {
        const ssvDispActive = ssvLizenzenAktiv.find(l => getDisciplineKey(l.MembershipCategory) === disp);
        const lokDispActive = lokLicAktiv.find(l => getDisciplineKey(l.MembershipCategory || l.membership_category) === disp);
        const ssvDispHist = ssvAllLizenzen.find(l => getDisciplineKey(l.MembershipCategory) === disp && (l.ExitDate || !isTruthy(l.IsActive)));

        // Fall 1: Sowohl lokal als auch im SSV aktiv vorhanden
        if (lokDispActive && ssvDispActive) {
          const lokCat = String(lokDispActive.MembershipCategory || lokDispActive.membership_category || '').trim();
          const ssvCat = String(ssvDispActive.MembershipCategory || '').trim();
          const lokClubNr = String(lokDispActive.license_invoicing_club_number || lokDispActive.LicenseInvoicingClubNumber || '').trim();
          const ssvClubNr = String(ssvDispActive.LicenseInvoicingClubNumber || '').trim();
          const lokClubName = String(lokDispActive.license_invoicing_club_name || lokDispActive.LicenseInvoicingClubName || 'Fremdverein').trim();
          const ssvClubName = String(ssvDispActive.LicenseInvoicingClubName || (ssvClubNr === MUHEN_CLUB_NUMBER ? 'Muhen Sportschützen' : 'Fremdverein')).trim();
          const lokEntry = normalizeDateValue(lokDispActive.EntryDate || lokDispActive.entry_date);
          const ssvEntry = normalizeDateValue(ssvDispActive.EntryDate);

          const isSsvA = ssvCat.includes('Aktiv-A') || ssvDispActive.LicenseCategory === 'A';
          const isLokA = lokCat.includes('Aktiv-A') || (lokDispActive.LicenseCategory === 'A');
          const isSsvB = ssvCat.includes('Aktiv-B') || ssvDispActive.LicenseCategory === 'B';
          const isLokB = lokCat.includes('Aktiv-B') || (lokDispActive.LicenseCategory === 'B');

          // Neuer Wert Anzeige: Bei A-Lizenz ohne Klammerzusatz, bei B-Lizenz mit Stammverein in Klammern
          const ssvDisplayVal = isSsvA ? ssvCat : `${ssvCat} [${ssvClubName}]`;
          const lokDisplayVal = isLokA ? lokCat : `${lokCat} [${lokClubName}]`;

          // 1a: Stammverein-Wechsel zu Muhen (Übernahme B ➔ A)
          if ((isSsvA && isLokB) || (isSsvA && ssvClubNr === MUHEN_CLUB_NUMBER && lokClubNr !== MUHEN_CLUB_NUMBER)) {
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              lokDisplayVal, ssvDisplayVal,
              'LIZENZ-UEBERNAHME', 'Update',
              `Stammverein zu Muhen gewechselt (vorher ${lokClubName}).`
            ]);
          }
          // 1b: Stammverein-Wechsel weg von Muhen (Abgabe A ➔ B/Drittclub)
          else if ((isLokA && isSsvB) || (isLokA && lokClubNr === MUHEN_CLUB_NUMBER && ssvClubNr !== MUHEN_CLUB_NUMBER && !isSsvA)) {
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              lokDisplayVal, ssvDisplayVal,
              'LIZENZ-ABGABE', 'Update',
              `Stammverein wechselt von Muhen zu ${ssvClubName}.`
            ]);
          }
          // 1c: Kategoriewechsel
          else if (lokCat !== ssvCat) {
            const isUpgrade = isSsvA && isLokB;
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              lokDisplayVal, ssvDisplayVal,
              isUpgrade ? 'LIZENZ-UEBERNAHME' : 'LIZENZAENDERUNG', 'Update',
              `Lizenzkategorie angepasst (${lokCat} ➔ ${ssvCat}).`
            ]);
          }
          // 1d: Datumskorrektur
          else if (lokEntry !== ssvEntry && ssvEntry) {
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              `${lokCat} (ab ${lokEntry})`, `${ssvCat} (ab ${ssvEntry})`,
              'LIZENZDATUMSKORREKTUR', 'Update',
              'Verbandsdatum synchronisiert.'
            ]);
          }
        }
        // Fall 2: In lokaler DB nicht aktiv, aber im SSV aktiv vorhanden (neue Lizenz)
        else if (!lokDispActive && ssvDispActive) {
          const ssvCat = String(ssvDispActive.MembershipCategory || '').trim();
          const ssvClubNr = String(ssvDispActive.LicenseInvoicingClubNumber || '').trim();
          const ssvClubName = String(ssvDispActive.LicenseInvoicingClubName || (ssvClubNr === MUHEN_CLUB_NUMBER ? 'Muhen Sportschützen' : 'Fremdverein')).trim();

          const isALic = ssvCat.includes('Aktiv-A') || ssvDispActive.LicenseCategory === 'A';

          if (isALic) {
            // A-Lizenz: Bei A-Lizenz Angabe in der Klammer weglassen
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              '—', ssvCat,
              'A-LIZENZ-NEU', 'Update',
              'Neue Voll-Lizenz bei Muhen als Stammverein.'
            ]);
          } else {
            // B-Lizenz (z.B. Patrick Fleischli): Mit Stammverein in Klammern
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              '—', `${ssvCat} [${ssvClubName}]`,
              'B-LIZENZ-NEU', 'Update',
              `Zweitmitgliedschaft (Stammverein ${ssvClubName}).`
            ]);
          }
        }
        // Fall 3: In lokaler DB aktiv, aber im SSV nicht mehr aktiv vorhanden
        else if (lokDispActive && !ssvDispActive) {
          const lokCat = String(lokDispActive.MembershipCategory || lokDispActive.membership_category || '').trim();
          const lokClubName = String(lokDispActive.license_invoicing_club_name || lokDispActive.LicenseInvoicingClubName || 'Muhen Sportschützen').trim();
          const isLokA = lokCat.includes('Aktiv-A') || (lokDispActive.LicenseCategory === 'A');
          const lokDisplayVal = isLokA ? lokCat : `${lokCat} [${lokClubName}]`;

          if (ssvDispHist && ssvDispHist.LicenseInvoicingClubNumber && ssvDispHist.LicenseInvoicingClubNumber !== MUHEN_CLUB_NUMBER) {
            const foreignClub = String(ssvDispHist.LicenseInvoicingClubName || 'Fremdverein').trim();
            const exitDateStr = normalizeDateValue(ssvDispHist.ExitDate) || '';
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              lokDisplayVal, exitDateStr ? `ExitDate ${exitDateStr} [${foreignClub}]` : `Wechsel [${foreignClub}]`,
              'LIZENZ-ABGABE', 'Update',
              `Stammverein wechselt von Muhen zu ${foreignClub}.`
            ]);
          } else if (ssvDispHist && ssvDispHist.ExitDate) {
            const exitDateStr = normalizeDateValue(ssvDispHist.ExitDate);
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              lokDisplayVal, `ExitDate ${exitDateStr}`,
              'LIZENZWEG', 'Update',
              `Lizenz in dieser Disziplin beendet (ExitDate ${exitDateStr}).`
            ]);
          } else {
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', disp,
              lokDisplayVal, 'Austritt (Export)',
              'LIZENZWEG', 'Update',
              'Im aktuellen Verbandsexport nicht mehr aufgeführt.'
            ]);
          }
        }
      });

      // 4. FUNKTIONEN-VERGLEICH
      const ssvFunktionenAktiv = extractActiveFunctions(rows);
      const lokFnAktiv = (fnMap[pn] || []).filter(f => !(f.OfficialFunctionExitDate || f.official_function_exit_date));
      const lokFnMap = lokFnAktiv.reduce((acc, f) => {
        const cat = f.OfficialFunctionCategory || f.official_function_category;
        const entry = f.OfficialFunctionEntryDate || f.official_function_entry_date;
        const k = [cat, normalizeDateValue(entry)].join('|');
        acc[k] = f;
        return acc;
      }, {});

      // Funktionen neu
      ssvFunktionenAktiv.forEach(fn => {
        const k = [fn.OfficialFunctionCategory, normalizeDateValue(fn.OfficialFunctionEntryDate)].join('|');
        if (!lokFnMap[k]) {
          const entscheidung = String(fn.OfficialFunctionCategory).toLowerCase().includes('hausmeister') ? 'Verworfen' : 'Update';
          diffRows.push([
            importId, pn, fullName, 'memberfunctions', 'OfficialFunctionCategory',
            '', fn.OfficialFunctionCategory, 'FUNKTIONNEU', entscheidung,
            'Vereinsfunktion im Verein neu erfasst.'
          ]);
        }
      });

      // Funktionen weg
      const ssvFnKeys = new Set(ssvFunktionenAktiv.map(f => [f.OfficialFunctionCategory, normalizeDateValue(f.OfficialFunctionEntryDate)].join('|')));
      Object.entries(lokFnMap).forEach(([k, fn]) => {
        const cat = fn.OfficialFunctionCategory || fn.official_function_category;
        const entry = fn.OfficialFunctionEntryDate || fn.official_function_entry_date;
        const histMatch = rows.find(z =>
          z.OfficialFunctionCategory === cat &&
          normalizeDateValue(z.OfficialFunctionEntryDate) === normalizeDateValue(entry) &&
          z.OfficialFunctionExitDate && String(z.OfficialFunctionExitDate).trim()
        );
        if (histMatch) {
          diffRows.push([
            importId, pn, fullName, 'memberfunctions', 'OfficialFunctionCategory',
            k, 'ExitDate ' + normalizeDateValue(histMatch.OfficialFunctionExitDate), 'FUNKTIONWEG', 'Update',
            'Vereinsfunktion im Verein beendet.'
          ]);
        } else if (!ssvFnKeys.has(k)) {
          diffRows.push([
            importId, pn, fullName, 'memberfunctions', 'OfficialFunctionCategory',
            k, 'Austritt (Export)', 'FUNKTIONWEG', 'Update',
            'Vereinsfunktion im Verein beendet.'
          ]);
        }
      });

      // 5. TRAINING
      const ssvTraining = extractTraining(rows);
      const existingTr = new Set((trMap[pn] || []).map(t => [
        t.CourseCategory || t.course_category,
        t.Module || t.module,
        normalizeDateValue(t.CompletedTrainingDate || t.completed_training_date)
      ].join('|')));

      ssvTraining.forEach(tr => {
        const k = [tr.CourseCategory, tr.Module, normalizeDateValue(tr.CompletedTrainingDate)].join('|');
        if (!existingTr.has(k)) {
          diffRows.push([
            importId, pn, fullName, 'membertraining', 'CourseCategory',
            '', tr.CourseCategory + '|' + tr.Module, 'TRAININGNEU', 'Update',
            'Ausbildung / Kurs im Verband erfasst.'
          ]);
        }
      });
    });

    return {
      importId,
      diffRows,
      byPerson
    };
  }

  // --- 5. ATOMARE SPEICHERUNG IN SUPABASE POSTGRESQL ---

  async function applySSVDiffClient(importId, diffRows, byPerson, onProgress) {
    const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (!supa) throw new Error('Supabase Client nicht initialisiert.');

    const approvedRows = diffRows.filter(r => r[8] === 'Update');
    if (approvedRows.length === 0) {
      return { created: 0, updated: 0, licenses: 0, functions: 0, training: 0, history: 0, skipped: diffRows.length };
    }

    if (onProgress) onProgress('Bereite Datenpaket für atomare Persistierung in Supabase vor...');

    const membersToSync = [];
    const licensesToSync = [];
    const functionsToSync = [];
    const trainingToSync = [];
    const historyEntries = [];

    // Nach PersonNumber gruppieren
    const approvedByPn = {};
    approvedRows.forEach(row => {
      const pn = String(row[1]).trim();
      if (!approvedByPn[pn]) approvedByPn[pn] = [];
      approvedByPn[pn].push(row);
    });

    const currentUserStr = (window.currentUser ? window.currentUser.email || window.currentUser.name : 'Vorstand Admin');

    for (const [pn, pDiffs] of Object.entries(approvedByPn)) {
      const ssvRows = byPerson[pn] || [];
      const base = ssvRows[0] || {};
      const status = extractMembershipStatus(ssvRows);
      const isAbgang = pDiffs.some(d => d[7] === 'ABGANG');

      // 1. Stammdaten-Datensatz
      membersToSync.push({
        person_number: parseInt(pn, 10),
        address_number: base.AddressNumber ? String(base.AddressNumber) : null,
        salutation: base.Salutation || null,
        first_name: base.FirstName || '',
        last_name: base.LastName || '',
        company: base.Company || null,
        addition: base.Addition || null,
        street: base.Street || null,
        post_code: base.PostCode ? String(base.PostCode) : null,
        city: base.City || null,
        country: base.Country || 'CH',
        business_landline_phone: normalizePhone(base.BusinessLandlinePhone) || null,
        business_mobile_phone: normalizePhone(base.BusinessMobilePhone) || null,
        private_landline_phone: normalizePhone(base.PrivateLandlinePhone) || null,
        private_mobile_phone: normalizePhone(base.PrivateMobilePhone) || null,
        primary_email: base.PrimaryEmail || null,
        additional_email: base.AdditionalEmail || null,
        webpage: base.Webpage || null,
        gender: base.Gender || null,
        birth_date: normalizeDateValue(base.BirthDate) || null,
        insurance_number: base.InsuranceNumber || null,
        language: base.Language || 'de',
        nationality: base.Nationality || 'Schweiz',
        organization_number: base.OrganizationNumber || null,
        organization_name: base.OrganizationName || null,
        is_active: isAbgang ? false : (status.IsActive === 1),
        is_passive: status.IsPassive === 1,
        is_honorary: status.IsHonoraryMember === 1,
        honorary_member_since: normalizeDateValue(status.HonoraryMemberSince) || null,
        first_club_entry_date_ssv: normalizeDateValue(status.FirstClubEntryDateSSV) || null,
        deceased: status.Deceased === 1,
        raw_data: base
      });

      // 2. Lizenzen
      const ssvLicenses = extractAllLicenses(ssvRows);
      for (const lic of ssvLicenses) {
        licensesToSync.push({
          person_number: parseInt(pn, 10),
          membership_category: lic.MembershipCategory,
          entry_date: normalizeDateValue(lic.EntryDate) || null,
          exit_date: normalizeDateValue(lic.ExitDate) || null,
          license_category: lic.LicenseCategory || null,
          license_type: lic.LicenseType || null,
          license_invoicing_club_number: lic.LicenseInvoicingClubNumber || null,
          license_invoicing_club_name: lic.LicenseInvoicingClubName || null,
          is_active: lic.IsActive === 1,
          import_quelle: 'SSV-Import'
        });
      }

      // 3. Funktionen
      const ssvFunctions = extractActiveFunctions(ssvRows);
      for (const fn of ssvFunctions) {
        functionsToSync.push({
          person_number: parseInt(pn, 10),
          official_function_category: fn.OfficialFunctionCategory,
          official_function_remark: fn.OfficialFunctionRemark || null,
          official_function_entry_date: normalizeDateValue(fn.OfficialFunctionEntryDate) || null,
          official_function_exit_date: normalizeDateValue(fn.OfficialFunctionExitDate) || null,
          use_on_board_and_functionary_report: fn.UseOnBoardAndFunctionaryReport === true,
          import_quelle: 'SSV-Import'
        });
      }

      // 4. Training
      const ssvTraining = extractTraining(ssvRows);
      for (const tr of ssvTraining) {
        trainingToSync.push({
          person_number: parseInt(pn, 10),
          course_category: tr.CourseCategory || null,
          module: tr.Module || null,
          completed_training_date: normalizeDateValue(tr.CompletedTrainingDate) || null,
          training_status: tr.TrainingStatus || null,
          completed_training_expiration_date: normalizeDateValue(tr.CompletedTrainingExpirationDate) || null
        });
      }

      // 5. Historie-Einträge
      pDiffs.forEach(diff => {
        historyEntries.push({
          person_number: parseInt(pn, 10),
          name: diff[2] || getFullName(base),
          datum: new Date().toISOString().split('T')[0],
          ereignistyp: diff[7] || 'AENDERUNG',
          alterwert: String(diff[5] || ''),
          neuerwert: String(diff[6] || ''),
          source: 'SSV-Import',
          importid: importId,
          erfasstvon: currentUserStr
        });
      });
    }

    if (onProgress) onProgress('Speichere Datensätze atomar in Supabase PostgreSQL...');

    const payload = {
      import_id: importId,
      user: currentUserStr,
      members: membersToSync,
      licenses: licensesToSync,
      functions: functionsToSync,
      training: trainingToSync,
      history: historyEntries
    };

    const { data: res, error: rpcErr } = await supa.rpc('apply_ssv_import_batch', { p_payload: payload });
    if (rpcErr) {
      console.error('❌ Fehler beim Ausführen von apply_ssv_import_batch:', rpcErr);
      throw new Error(rpcErr.message || 'Fehler beim Speichern in Supabase.');
    }

    return {
      created: res?.members_created || 0,
      updated: res?.members_updated || 0,
      licenses: res?.licenses_synced || 0,
      functions: res?.functions_synced || 0,
      training: res?.training_synced || 0,
      history: res?.history_logged || 0,
      skipped: diffRows.length - approvedRows.length
    };
  }

  // Exports an das globale Window-Objekt
  window.SSVImportEngine = {
    runClientSSVDiffCalculation,
    applySSVDiffClient,
    normalizePhone,
    normalizeDateValue,
    formatValueForDiff
  };

})(window);
