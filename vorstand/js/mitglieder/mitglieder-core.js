// === SUB-MODUL: MITGLIEDER - CORE ===

window._mglData = window._mglData || [];
window._mglFiltered = window._mglFiltered || [];
window._mglSort = window._mglSort || { field: 'LastName', dir: 'asc' };
window._mglActiveTab = window._mglActiveTab || 'liste';

// Lokale Cache-Variablen für Mitglieder-Details (Lizenzen, Funktionen, Historie)
window._mglLizenzenCache = window._mglLizenzenCache || {};
window._mglFunktionenCache = window._mglFunktionenCache || {};
window._mglHistoryCache = window._mglHistoryCache || {};

// Globaler Singleton-Promise zur Vermeidung paralleler Anfragen
window._mglLoadPromise = null;

// --- MAPPING HELPER FÜR SUPABASE POSTGREST ---
function mapMemberFromSupabase(r) {
  return {
    PersonNumber: r.person_number,
    AddressNumber: r.address_number,
    Salutation: r.salutation,
    FirstName: r.first_name,
    LastName: r.last_name,
    Company: r.company,
    Addition: r.addition,
    Street: r.street,
    PostCode: r.post_code,
    City: r.city,
    Country: r.country,
    BusinessLandlinePhone: r.business_landline_phone,
    BusinessMobilePhone: r.business_mobile_phone,
    PrivateLandlinePhone: r.private_landline_phone,
    PrivateMobilePhone: r.private_mobile_phone,
    PrimaryEmail: r.primary_email,
    AdditionalEmail: r.additional_email,
    Webpage: r.webpage,
    Gender: r.gender,
    BirthDate: r.birth_date,
    InsuranceNumber: r.insurance_number,
    Language: r.language,
    Nationality: r.nationality,
    OrganizationNumber: r.organization_number,
    OrganizationName: r.organization_name,
    IsActive: r.is_active ? 1 : 0,
    IsPassive: r.is_passive ? 1 : 0,
    IsPassiveSource: r.is_passive_source,
    IsHonoraryMember: r.is_honorary ? 1 : 0,
    IsHonoraryMemberSource: r.is_honorary_source,
    ClubEntryDate: r.club_entry_date,
    ClubEntryDateSource: r.club_entry_date_source,
    FirstClubEntryDateSSV: r.first_club_entry_date_ssv,
    HonoraryMemberSince: r.honorary_member_since,
    HonoraryMemberSinceSource: r.honorary_member_since_source,
    Deceased: r.deceased ? 1 : 0,
    Todesdatum: r.death_date,
    Vereinsaustritt: r.club_exit_date,
    Remark: r.remark,
    NewsletterSSVType: r.newsletter_ssv_type,
    ExportedOn: r.exported_on,
    Rechnungsversand: r.rechnungsversand,
    Niemahnen: r.nie_mahnen ? 1 : 0,
    IBAN: r.iban,
    BIC: r.bic,
    Kontoinhaber: r.kontoinhaber,
    synced_at: r.synced_at,
    _istEhren: Boolean(r.is_honorary),
    _istPassiv: Boolean(r.is_passive),
    _badgeAktiv: Boolean(r.is_active) && !r.is_passive && !r.deceased,
    _isU21: mglIsU21({ BirthDate: r.birth_date, PersonNumber: r.person_number })
  };
}

// Ermittelt ob ein Mitglied gemäss SSV-Definition der Alterskategorie U21 (Jugend/Junioren) angehört
function mglIsU21(m) {
  if (!m) return false;
  if (m.BirthDate) {
    const d = new Date(m.BirthDate);
    if (!isNaN(d.getTime())) {
      const currentYear = new Date().getFullYear();
      const age = currentYear - d.getFullYear();
      if (age <= 20 && age >= 5) return true;
    }
  }
  const lics = m._lizenzen || window._mglLizenzenCache?.[String(m.PersonNumber)] || [];
  if (Array.isArray(lics)) {
    return lics.some(l => {
      const t = String(l.LicenseType || l.license_type || l.membership_category || '').toUpperCase();
      return t.includes('U21') || t.includes('U17') || t.includes('U15') || t.includes('JUNIOR') || t.includes('JUGEND') || t.includes('NACHWUCHS');
    });
  }
  return false;
}
window.mglIsU21 = mglIsU21;

function mapLicenseFromSupabase(r) {
  return {
    PersonNumber: r.person_number,
    MembershipCategory: r.membership_category,
    EntryDate: r.entry_date,
    ExitDate: r.exit_date,
    LicenseCategory: r.license_category,
    LicenseType: r.license_type,
    LicenseInvoicingClubNumber: r.license_invoicing_club_number,
    LicenseInvoicingClubName: r.license_invoicing_club_name,
    IsActive: r.is_active ? 1 : 0,
    istMuhen: String(r.license_invoicing_club_number || '').trim() === '1.02.0.01.087' || String(r.license_invoicing_club_number || '').trim() === '1.19.0.01.029'
  };
}

function mapFunctionFromSupabase(r) {
  return {
    PersonNumber: r.person_number,
    OfficialFunctionCategory: r.official_function_category,
    OfficialFunctionRemark: r.official_function_remark,
    OfficialFunctionEntryDate: r.official_function_entry_date,
    OfficialFunctionExitDate: r.official_function_exit_date,
    UseOnBoardAndFunctionaryReport: r.use_on_board_and_functionary_report ? 1 : 0,
    rabattkategorie: r.rabattkategorie
  };
}

// Zentraler, deduplizierter Loader für Mitgliederdaten (Supabase First, Fallback auf GAS)
window.ensureMitgliederLoaded = async function(forceReload = false) {
  // 1. Bereits im RAM vorhanden?
  if (!forceReload && Array.isArray(window._mglData) && window._mglData.length > 0) {
    return window._mglData;
  }

  // 2. Blitzschnell aus AppCache (localStorage) laden (0 ms Wartezeit)
  if (!forceReload && window.AppCache) {
    const cached = window.AppCache.get('mitglieder');
    if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
      window._mglData = cached.data;
      if (cached.lizenzen) window._mglLizenzenCache = cached.lizenzen;
      if (cached.funktionen) window._mglFunktionenCache = cached.funktionen;
      if (cached.historie) window._mglHistoryCache = cached.historie;
      return window._mglData;
    }
  }

  // 3. Läuft bereits ein Netzwerk-Request? Genau denselben Promise mitbenutzen!
  if (window._mglLoadPromise) {
    return window._mglLoadPromise;
  }

  // 4. SUPABASE FIRST LOADER (< 50 ms Ladezeit)
  window._mglLoadPromise = (async () => {
    try {
      const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
      if (supa) {
        console.log("⚡ ensureMitgliederLoaded: Lade Mitglieder blitzschnell aus Supabase...");
        const { data: supaMembers, error: supaErr } = await supa
          .from('members')
          .select('*')
          .order('last_name', { ascending: true });

        if (!supaErr && Array.isArray(supaMembers) && supaMembers.length > 0) {
          window._mglData = supaMembers.map(mapMemberFromSupabase);

          // Parallel Lizenzen und Funktionen im Hintergrund laden
          (async () => {
            try {
              const [{ data: lics }, { data: fns }, { data: hists }] = await Promise.all([
                supa.from('member_licenses').select('*'),
                supa.from('member_functions').select('*'),
                supa.from('member_history').select('*').order('datum', { ascending: false }).limit(500)
              ]);

              if (Array.isArray(lics)) {
                window._mglLizenzenCache = {};
                lics.forEach(l => {
                  const pn = String(l.person_number);
                  if (!window._mglLizenzenCache[pn]) window._mglLizenzenCache[pn] = [];
                  window._mglLizenzenCache[pn].push(mapLicenseFromSupabase(l));
                });
              }

              if (Array.isArray(fns)) {
                window._mglFunktionenCache = {};
                fns.forEach(f => {
                  const pn = String(f.person_number);
                  if (!window._mglFunktionenCache[pn]) window._mglFunktionenCache[pn] = [];
                  window._mglFunktionenCache[pn].push(mapFunctionFromSupabase(f));
                });
              }

              if (Array.isArray(hists)) {
                window._mglHistoryCache = {};
                hists.forEach(h => {
                  const pn = String(h.person_number);
                  if (!window._mglHistoryCache[pn]) window._mglHistoryCache[pn] = [];
                  window._mglHistoryCache[pn].push(h);
                });
              }

              // Enrichment-Counts für Badges direkt auf _mglData anheften
              window._mglData.forEach(m => {
                const pn = String(m.PersonNumber);
                const mLics = window._mglLizenzenCache[pn] || [];
                const mFns = window._mglFunktionenCache[pn] || [];
                m._aktiveLizenzenCount = mLics.filter(l => l.IsActive && !l.ExitDate).length;
                m._aktiveFunktionenCount = mFns.filter(f => !f.OfficialFunctionExitDate).length;
              });

              if (window.AppCache) {
                window.AppCache.set('mitglieder', {
                  data: window._mglData,
                  lizenzen: window._mglLizenzenCache,
                  funktionen: window._mglFunktionenCache,
                  historie: window._mglHistoryCache
                }, 120);
              }
            } catch (bgErr) {
              console.warn('⚠️ Supabase Detail-Cache Hintergrundfehler:', bgErr);
            }
          })();

          window.dispatchEvent(new CustomEvent('mitglieder-loaded', { detail: window._mglData }));
          return window._mglData;
        }
      }

      // 5. FALLBACK AUF GAS (falls Supabase noch leer ist oder Offline)
      console.log("📡 ensureMitgliederLoaded: Supabase leer oder nicht erreichbar -> Fallback auf Google Apps Script...");
      const res = await apiFetch('mitglieder', 'action=getAll');
      const rawText = await res.text();

      let data = null;
      try {
        data = JSON.parse(rawText);
      } catch (jsonErr) {
        console.warn('⚠️ Mitglieder API: HTML statt JSON erhalten:', rawText.slice(0, 180));
      }

      if (data && data.success && Array.isArray(data.data)) {
        window._mglData = data.data;
        if (window.AppCache) {
          const prev = window.AppCache.get('mitglieder') || {};
          window.AppCache.set('mitglieder', { ...prev, data: window._mglData }, 120);
        }
        window.dispatchEvent(new CustomEvent('mitglieder-loaded', { detail: window._mglData }));
        return window._mglData;
      }

      // Fallback auf gecachte Daten
      if (window.AppCache) {
        const fallback = window.AppCache.get('mitglieder');
        if (fallback && Array.isArray(fallback.data) && fallback.data.length > 0) {
          window._mglData = fallback.data;
          window.dispatchEvent(new CustomEvent('mitglieder-loaded', { detail: window._mglData }));
          return window._mglData;
        }
      }
    } catch (e) {
      console.error('❌ ensureMitgliederLoaded Fehler:', e);
    } finally {
      window._mglLoadPromise = null;
    }

    return window._mglData || [];
  })();

  return window._mglLoadPromise;
};

// Batch-Synchronisation aller bestehenden Mitglieder nach Supabase (initiales Seeding)
window.syncAllMitgliederToSupabase = async function() {
  const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
  if (!supa) throw new Error('Supabase Client nicht bereit.');

  const list = window._mglData;
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error('Keine Mitgliederdaten zum Synchronisieren vorhanden.');
  }

  console.log(`🚀 Synchronisiere ${list.length} Mitglieder nach Supabase...`);
  const records = list.map(m => ({
    person_number: parseInt(m.PersonNumber, 10),
    address_number: m.AddressNumber ? String(m.AddressNumber) : null,
    salutation: m.Salutation || null,
    first_name: m.FirstName || '',
    last_name: m.LastName || '',
    company: m.Company || null,
    addition: m.Addition || null,
    street: m.Street || null,
    post_code: m.PostCode ? String(m.PostCode) : null,
    city: m.City || null,
    country: m.Country || 'CH',
    business_landline_phone: m.BusinessLandlinePhone || null,
    business_mobile_phone: m.BusinessMobilePhone || null,
    private_landline_phone: m.PrivateLandlinePhone || null,
    private_mobile_phone: m.PrivateMobilePhone || null,
    primary_email: m.PrimaryEmail || m.Email || null,
    additional_email: m.AdditionalEmail || null,
    webpage: m.Webpage || null,
    gender: m.Gender || null,
    birth_date: mglFmtDateIso(m.BirthDate) || null,
    insurance_number: m.InsuranceNumber || null,
    language: m.Language || 'de',
    nationality: m.Nationality || 'Schweiz',
    organization_number: m.OrganizationNumber || null,
    organization_name: m.OrganizationName || null,
    is_active: Boolean(m.IsActive == 1 || m.IsActive === true || m.IsActive === '1'),
    is_passive: Boolean(m.IsPassive == 1 || m.IsPassive === true || m.IsPassive === '1'),
    is_passive_source: m.IsPassiveSource || 'ssv',
    is_honorary: Boolean(m.IsHonoraryMember == 1 || m.IsHonoraryMember === true || m.IsHonoraryMember === '1'),
    is_honorary_source: m.IsHonoraryMemberSource || 'ssv',
    club_entry_date: mglFmtDateIso(m.ClubEntryDate) || null,
    first_club_entry_date_ssv: mglFmtDateIso(m.FirstClubEntryDateSSV) || null,
    honorary_member_since: mglFmtDateIso(m.HonoraryMemberSince) || null,
    deceased: Boolean(m.Deceased == 1 || m.Deceased === true || m.Deceased === '1'),
    death_date: mglFmtDateIso(m.Todesdatum) || null,
    club_exit_date: mglFmtDateIso(m.Vereinsaustritt) || null,
    remark: m.Remark || null,
    iban: m.IBAN || null,
    bic: m.BIC || null,
    kontoinhaber: m.Kontoinhaber || null,
    synced_at: new Date().toISOString()
  })).filter(r => !isNaN(r.person_number));

  // Chunked Upsert (jeweils 50 Records pro Call)
  for (let i = 0; i < records.length; i += 50) {
    const chunk = records.slice(i, i + 50);
    const { error } = await supa.from('members').upsert(chunk, { onConflict: 'person_number' });
    if (error) throw error;
  }

  // Lizenzen synchronisieren
  const allLics = Object.values(window._mglLizenzenCache || {}).flat();
  if (allLics.length > 0) {
    const licRecords = allLics.map(l => ({
      person_number: parseInt(l.PersonNumber, 10),
      membership_category: l.MembershipCategory,
      entry_date: mglFmtDateIso(l.EntryDate) || null,
      exit_date: mglFmtDateIso(l.ExitDate) || null,
      license_category: l.LicenseCategory || null,
      license_type: l.LicenseType || null,
      license_invoicing_club_number: l.LicenseInvoicingClubNumber || null,
      license_invoicing_club_name: l.LicenseInvoicingClubName || null,
      is_active: Boolean(l.IsActive == 1 || l.IsActive === true),
      import_quelle: 'Initial-Sync'
    })).filter(r => !isNaN(r.person_number) && r.membership_category);

    for (let i = 0; i < licRecords.length; i += 50) {
      const chunk = licRecords.slice(i, i + 50);
      await supa.from('member_licenses').upsert(chunk, {
        onConflict: 'person_number,membership_category,entry_date'
      }).catch(e => console.warn('Sync Lic Chunk Error:', e));
    }
  }

  // Funktionen synchronisieren
  const allFns = Object.values(window._mglFunktionenCache || {}).flat();
  if (allFns.length > 0) {
    const fnRecords = allFns.map(f => ({
      person_number: parseInt(f.PersonNumber, 10),
      official_function_category: f.OfficialFunctionCategory,
      official_function_remark: f.OfficialFunctionRemark || null,
      official_function_entry_date: mglFmtDateIso(f.OfficialFunctionEntryDate) || null,
      official_function_exit_date: mglFmtDateIso(f.OfficialFunctionExitDate) || null,
      use_on_board_and_functionary_report: Boolean(f.UseOnBoardAndFunctionaryReport),
      rabattkategorie: f.rabattkategorie || null,
      import_quelle: 'Initial-Sync'
    })).filter(r => !isNaN(r.person_number) && r.official_function_category);

    for (let i = 0; i < fnRecords.length; i += 50) {
      const chunk = fnRecords.slice(i, i + 50);
      await supa.from('member_functions').upsert(chunk).catch(e => console.warn('Sync Fn Chunk Error:', e));
    }
  }

  return { success: true, count: records.length };
};


async function loadMitgliederData(forceReload = false) {
  const container = document.getElementById('mitglieder-container');
  
  // 1. Schneller Vorab-Check (RAM oder AppCache)
  if (!forceReload) {
    if (window._mglData && window._mglData.length > 0) {
      console.log("⚡ loadMitgliederData: Lade aus RAM-Cache...");
      if (container) {
        renderMitgliederView(window._mglData);
        if (typeof mglFilter === 'function') mglFilter();
      }
      return;
    }
    if (window.AppCache) {
      const cached = window.AppCache.get('mitglieder');
      if (cached && Array.isArray(cached.data) && cached.data.length > 0) {
        console.log("⚡ loadMitgliederData: Lade ohne Netzwerk-Wartezeit aus AppCache (localStorage)...");
        window._mglData = cached.data;
        window._mglLizenzenCache = cached.lizenzen || {};
        window._mglFunktionenCache = cached.funktionen || {};
        window._mglHistoryCache = cached.historie || {};
        if (container) {
          renderMitgliederView(window._mglData);
          if (typeof mglFilter === 'function') mglFilter();
        }
        return;
      }
    }
  }

  if (container) {
    container.innerHTML = `
      <div class="text-center py-5">
        <div class="spinner-border text-primary"></div>
        <p class="mt-2 text-muted">Lade Mitglieder…</p>
      </div>`;
  }

  try {
    // 2. Mitgliederliste abrufen (dedupliziert, einzelner fokussierter Call)
    const list = await window.ensureMitgliederLoaded(forceReload);

    if (!list || list.length === 0) {
      if (container) {
        container.innerHTML = `
          <div class="alert alert-warning">
            <h5>⚠️ Mitglieder konnten nicht geladen werden</h5>
            <p>Das Google Apps Script Backend antwortete nicht rechtzeitig oder lieferte ein ungültiges Format.</p>
            <button class="btn btn-sm btn-outline-primary mt-2" onclick="loadMitgliederData(true)">Erneut versuchen</button>
          </div>`;
      }
      return;
    }

    // Mitglieder sofort anzeigen!
    if (container) {
      renderMitgliederView(window._mglData);
      if (typeof mglFilter === 'function') mglFilter();
    }

    // 3. Sekundäre Detail-Caches (Lizenzen, Funktionen, Historie)
    // UNTERBINDUNG PARALLELER CALLS: Sequentiell und non-blocking im Hintergrund laden
    (async () => {
      try {
        // 3a. Lizenzen
        if (!window._mglLizenzenCache || Object.keys(window._mglLizenzenCache).length === 0 || forceReload) {
          try {
            const resLizz = await apiFetch('mitglieder', 'action=getLizenzen');
            const lizzData = await resLizz.json();
            if (lizzData && lizzData.success && Array.isArray(lizzData.data)) {
              window._mglLizenzenCache = {};
              lizzData.data.forEach(l => {
                const pnKey = String(l.PersonNumber || '').trim();
                if (pnKey) {
                  if (!window._mglLizenzenCache[pnKey]) window._mglLizenzenCache[pnKey] = [];
                  window._mglLizenzenCache[pnKey].push(l);
                }
              });
            }
          } catch (err) {
            console.warn('⚠️ Lizenzen-Cache Hintergrund-Laden:', err);
          }
        }

        // 3b. Funktionen
        if (!window._mglFunktionenCache || Object.keys(window._mglFunktionenCache).length === 0 || forceReload) {
          try {
            const resFn = await apiFetch('mitglieder', 'action=getFunktionen');
            const fnData = await resFn.json();
            if (fnData && fnData.success && Array.isArray(fnData.data)) {
              window._mglFunktionenCache = {};
              fnData.data.forEach(f => {
                const pnKey = String(f.PersonNumber || '').trim();
                if (pnKey) {
                  if (!window._mglFunktionenCache[pnKey]) window._mglFunktionenCache[pnKey] = [];
                  window._mglFunktionenCache[pnKey].push(f);
                }
              });
            }
          } catch (err) {
            console.warn('⚠️ Funktionen-Cache Hintergrund-Laden:', err);
          }
        }

        // 3c. Historie
        if (!window._mglHistoryCache || Object.keys(window._mglHistoryCache).length === 0 || forceReload) {
          try {
            const resHist = await apiFetch('mitglieder', 'action=getHistorie');
            const histData = await resHist.json();
            if (histData && histData.success && Array.isArray(histData.data)) {
              window._mglHistoryCache = {};
              histData.data.forEach(h => {
                const pnKey = String(h.PersonNumber || '').trim();
                if (pnKey) {
                  if (!window._mglHistoryCache[pnKey]) window._mglHistoryCache[pnKey] = [];
                  window._mglHistoryCache[pnKey].push(h);
                }
              });
            }
          } catch (err) {
            console.warn('⚠️ Historie-Cache Hintergrund-Laden:', err);
          }
        }

        // Im AppCache mit Details speichern
        if (window.AppCache) {
          window.AppCache.set('mitglieder', {
            data: window._mglData,
            lizenzen: window._mglLizenzenCache,
            funktionen: window._mglFunktionenCache,
            historie: window._mglHistoryCache
          }, 120);
        }
      } catch (secErr) {
        console.warn('⚠️ Detail-Caches Hintergrund-Laden:', secErr);
      }
    })();

  } catch (e) {
    console.error('❌ loadMitgliederData:', e);
    if (container) {
      container.innerHTML = `<div class="alert alert-danger"><strong>Fehler:</strong> ${escapeHtml(e.message)}</div>`;
    }
  }
}

// === UTILS ===
function mglFmtDate(val) {
  if (!val || val === '' || val === '–') return '–';
  const d = new Date(val);
  return isNaN(d) ? val : d.toLocaleDateString('de-CH');
}

function mglFmtDateIso(val) {
  if (!val) return '';
  const d = new Date(val);
  return isNaN(d) ? '' : d.toISOString().split('T')[0];
}
