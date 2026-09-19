// ==============================================================================
// mitglieder-import-engine.js
// 1:1 Portierung der SSV-Import- und Diff-Berechnungs-Logik von Google Apps Script
// ins Client-Frontend für ultraschnellen Import und direkte Supabase-Persistierung.
// Unterstützt Dual-Write / Synchronisation zur Test-Spreadsheet-Kopie:
// 1GdoopFudDXcmrP-DH8z2Ge_ALG3YDmHybJpXe1HgZQ0
// ==============================================================================

(function(window) {
  'use strict';

  // --- 1. KONSTANTEN & FELDER (1:1 aus Members100 config.js) ---
  const TEST_SPREADSHEET_ID = '1GdoopFudDXcmrP-DH8z2Ge_ALG3YDmHybJpXe1HgZQ0';

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

  function isStatusCategory(cat) {
    const s = String(cat || '').trim().toLowerCase();
    return s === 'passiv' || s.startsWith('ehren');
  }

  function isLicenseCategory(cat) {
    return String(cat || '').trim().toLowerCase().startsWith('aktiv-');
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
            'WAHR', 'FALSCH', 'ABGANG', 'Update', ''
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
        diffRows.push([importId, pn, fullName, 'members', 'PersonNumber', '', pn, 'NEU', 'Update', '']);
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
              'AENDERUNG', 'Update', ''
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
            'AENDERUNG', 'Update', ''
          ]);
        }
        if (status.Deceased !== localIsDeceased) {
          diffRows.push([
            importId, pn, fullName, 'members', 'Deceased',
            formatValueForDiff('Deceased', localIsDeceased), formatValueForDiff('Deceased', status.Deceased),
            'AENDERUNG', 'Update', ''
          ]);
        }
        if (status.IsPassive !== localIsPassive && !passiveProt) {
          diffRows.push([
            importId, pn, fullName, 'members', 'IsPassive',
            formatValueForDiff('IsPassive', localIsPassive), formatValueForDiff('IsPassive', status.IsPassive),
            'AENDERUNG', 'Update', ''
          ]);
        }
        if (status.IsHonoraryMember !== localIsHonorary && !honoraryProt) {
          diffRows.push([
            importId, pn, fullName, 'members', 'IsHonoraryMember',
            formatValueForDiff('IsHonoraryMember', localIsHonorary), formatValueForDiff('IsHonoraryMember', status.IsHonoraryMember),
            'AENDERUNG', 'Update', ''
          ]);
        }
        if (status.HonoraryMemberSince && normalizeDateValue(status.HonoraryMemberSince) !== normalizeDateValue(localHonorarySince) && !honoraryProt) {
          diffRows.push([
            importId, pn, fullName, 'members', 'HonoraryMemberSince',
            formatValueForDiff('HonoraryMemberSince', localHonorarySince), formatValueForDiff('HonoraryMemberSince', status.HonoraryMemberSince),
            'AENDERUNG', 'Update', ''
          ]);
        }
      }

      // 3. LIZENZEN-VERGLEICH
      const ssvLizenzenAktiv = extractAllLicenses(rows).filter(l =>
        isLicenseCategory(l.MembershipCategory) &&
        isTruthy(l.IsActive) &&
        !l.ExitDate
      );
      const lokLicAktiv = (licMap[pn] || []).filter(l =>
        isTruthy(l.IsActive !== undefined ? l.IsActive : l.is_active) &&
        !(l.ExitDate || l.exit_date)
      );

      const matchedSsvKeys = new Set();
      const matchedLokKeys = new Set();

      ssvLizenzenAktiv.forEach(ssvLic => {
        const ssvK = [ssvLic.MembershipCategory, normalizeDateValue(ssvLic.EntryDate)].join('|');
        const matchingLok = lokLicAktiv.find(lokLic => {
          const cat = lokLic.MembershipCategory || lokLic.membership_category;
          const entry = lokLic.EntryDate || lokLic.entry_date;
          return String(cat || '').trim() === String(ssvLic.MembershipCategory || '').trim() &&
            normalizeDateValue(entry) !== normalizeDateValue(ssvLic.EntryDate);
        });

        if (matchingLok) {
          const lokCat = matchingLok.MembershipCategory || matchingLok.membership_category;
          const lokEntry = matchingLok.EntryDate || matchingLok.entry_date;
          const lokK = [lokCat, normalizeDateValue(lokEntry)].join('|');
          if (!matchedLokKeys.has(lokK)) {
            matchedSsvKeys.add(ssvK);
            matchedLokKeys.add(lokK);
            diffRows.push([
              importId, pn, fullName, 'memberlicenses', 'EntryDate',
              lokK, ssvK, 'LIZENZDATUMSKORREKTUR', 'Update', ''
            ]);
          }
        }
      });

      const lokKeys = new Set(lokLicAktiv.map(l => [
        l.MembershipCategory || l.membership_category,
        normalizeDateValue(l.EntryDate || l.entry_date)
      ].join('|')));

      // Lizenzen neu
      ssvLizenzenAktiv.forEach(lic => {
        const k = [lic.MembershipCategory, normalizeDateValue(lic.EntryDate)].join('|');
        if (!matchedSsvKeys.has(k) && !lokKeys.has(k)) {
          diffRows.push([
            importId, pn, fullName, 'memberlicenses', 'MembershipCategory',
            '', lic.MembershipCategory, 'LIZENZNEU', 'Update', ''
          ]);
        }
      });

      // Lizenzen weg
      const ssvAllLizenzen = extractAllLicenses(rows);
      const ssvKeysActive = new Set(ssvLizenzenAktiv.map(l => [l.MembershipCategory, normalizeDateValue(l.EntryDate)].join('|')));
      lokLicAktiv.forEach(lic => {
        const cat = lic.MembershipCategory || lic.membership_category;
        const entry = lic.EntryDate || lic.entry_date;
        const k = [cat, normalizeDateValue(entry)].join('|');
        if (!matchedLokKeys.has(k) && !ssvKeysActive.has(k)) {
          const histMatch = ssvAllLizenzen.find(l =>
            l.MembershipCategory === cat &&
            normalizeDateValue(l.EntryDate) === normalizeDateValue(entry) &&
            l.ExitDate
          );
          const neuValue = histMatch ? 'ExitDate ' + histMatch.ExitDate : 'Austritt (Export)';
          diffRows.push([
            importId, pn, fullName, 'memberlicenses', 'MembershipCategory',
            k, neuValue, 'LIZENZWEG', 'Update', ''
          ]);
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
            '', fn.OfficialFunctionCategory, 'FUNKTIONNEU', entscheidung, ''
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
            k, 'ExitDate ' + normalizeDateValue(histMatch.OfficialFunctionExitDate), 'FUNKTIONWEG', 'Update', ''
          ]);
        } else if (!ssvFnKeys.has(k)) {
          diffRows.push([
            importId, pn, fullName, 'memberfunctions', 'OfficialFunctionCategory',
            k, 'Austritt (Export)', 'FUNKTIONWEG', 'Update', ''
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
            '', tr.CourseCategory + '|' + tr.Module, 'TRAININGNEU', 'Update', ''
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

  // --- 5. SPEICHERUNG IN SUPABASE & DUAL-WRITE ZUM GOOGLE SHEET ---

  async function applySSVDiffClient(importId, diffRows, byPerson, onProgress) {
    const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (!supa) throw new Error('Supabase Client nicht initialisiert.');

    const approvedRows = diffRows.filter(r => r[8] === 'Update');
    if (approvedRows.length === 0) {
      return { created: 0, updated: 0, skipped: diffRows.length };
    }

    if (onProgress) onProgress('Speichere Mutationen in Supabase PostgreSQL...');

    let stats = { created: 0, updated: 0, skipped: diffRows.length - approvedRows.length };
    const historyEntries = [];

    // Nach PersonNumber gruppieren
    const approvedByPn = {};
    approvedRows.forEach(row => {
      const pn = String(row[1]).trim();
      if (!approvedByPn[pn]) approvedByPn[pn] = [];
      approvedByPn[pn].push(row);
    });

    for (const [pn, pDiffs] of Object.entries(approvedByPn)) {
      const ssvRows = byPerson[pn] || [];
      const base = ssvRows[0] || {};
      const status = extractMembershipStatus(ssvRows);
      const isNeu = pDiffs.some(d => d[7] === 'NEU');
      const isAbgang = pDiffs.some(d => d[7] === 'ABGANG');

      // 1. Stammdaten-Datensatz für Supabase bauen
      const memberRecord = {
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
        raw_data: base,
        last_updated_by: 'SSV-Import (' + importId + ')',
        synced_at: new Date().toISOString()
      };

      // In Supabase upserten
      const { error: mErr } = await supa.from('members').upsert(memberRecord, { onConflict: 'person_number' });
      if (mErr) console.warn('⚠️ Fehler beim Speichern von Mitglied ' + pn + ' in Supabase:', mErr);

      if (isNeu) stats.created++;
      else stats.updated++;

      // 2. Lizenzen aktualisieren
      const ssvLicenses = extractAllLicenses(ssvRows);
      for (const lic of ssvLicenses) {
        const licRecord = {
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
        };
        await supa.from('member_licenses').upsert(licRecord, {
          onConflict: 'person_number,membership_category,entry_date'
        }).catch(e => console.warn('Lizenz-Fehler:', e));
      }

      // 3. Historie-Einträge für jedes freigegebene Diff erzeugen
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
          erfasstvon: (window.currentUser ? window.currentUser.email || window.currentUser.name : 'System')
        });
      });
    }

    // Historie batch-eintragen
    if (historyEntries.length > 0) {
      await supa.from('member_history').insert(historyEntries).catch(e => console.warn('History Insert:', e));
    }

    // 4. DUAL-WRITE: Synchronisation zum Google Sheet (Test-Kopie)
    if (onProgress) onProgress('Synchronisiere Änderungen zur Google Sheet Test-Kopie (1GdoopFudDXcmrP-DH8z2Ge_ALG3YDmHybJpXe1HgZQ0)...');
    try {
      if (typeof apiFetch === 'function') {
        const syncPayload = {
          action: 'applySSVDiff',
          importId: importId,
          diffRows: approvedRows,
          targetSpreadsheetId: TEST_SPREADSHEET_ID
        };
        const res = await apiFetch('mitglieder', syncPayload, 'POST');
        const resData = await res.json();
        console.log('✅ Google Sheet Test-Kopie synchronisiert:', resData);
      }
    } catch (sheetErr) {
      console.warn('⚠️ Google Sheet Sync Hintergrundwarnung:', sheetErr);
      // Fällt nicht hart aus, da Supabase bereits aktuell ist
    }

    return stats;
  }

  // Exports an das globale Window-Objekt
  window.SSVImportEngine = {
    TEST_SPREADSHEET_ID,
    runClientSSVDiffCalculation,
    applySSVDiffClient,
    normalizePhone,
    normalizeDateValue,
    formatValueForDiff
  };

})(window);
