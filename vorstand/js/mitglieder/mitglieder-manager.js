// === SUB-MODUL: MITGLIEDER - MANAGER & CRUD (SUPABASE WRITE-MASTER) ===

/**
 * Speichert vollständige Mitglieds-Mutationen in Supabase PostgreSQL
 * und protokolliert die Änderung im Revisions-Audit (member_history).
 */
async function mglSaveMember(event, pn) {
  if (event) event.preventDefault();

  const btn = document.getElementById('mglEditSubmitBtn') || document.querySelector('#mglTabEdit .btn-primary');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Speichere in Supabase...';
  }

  const idx = _mglData.findIndex(m => String(m.PersonNumber) === String(pn));
  const oldMember = idx >= 0 ? _mglData[idx] : {};

  // Formular-Felder auslesen (Stammdaten via SSV, Formular fokussiert auf Bank- & Zahlungsdaten)
  const firstName = (document.getElementById('mglEditFirstName')?.value || oldMember.FirstName || oldMember.first_name || '').trim();
  const lastName = (document.getElementById('mglEditLastName')?.value || oldMember.LastName || oldMember.last_name || '').trim();
  const salutation = document.getElementById('mglEditSalutation')?.value || oldMember.Salutation || oldMember.salutation || null;
  const birthDate = document.getElementById('mglEditBirthDate')?.value || oldMember.BirthDate || oldMember.birth_date || null;
  const gender = document.getElementById('mglEditGender')?.value || oldMember.Gender || oldMember.gender || null;

  const street = (document.getElementById('mglEditStreet')?.value || oldMember.Street || oldMember.street || '').trim();
  const postCode = (document.getElementById('mglEditPostCode')?.value || oldMember.PostCode || oldMember.post_code || '').trim();
  const city = (document.getElementById('mglEditCity')?.value || oldMember.City || oldMember.city || '').trim();
  const email = (document.getElementById('mglEditEmail')?.value || oldMember.PrimaryEmail || oldMember.primary_email || '').trim();
  const mobile = (document.getElementById('mglEditMobilePhone')?.value || oldMember.PrivateMobilePhone || oldMember.private_mobile_phone || '').trim();
  const landline = (document.getElementById('mglEditLandlinePhone')?.value || oldMember.PrivateLandlinePhone || oldMember.private_landline_phone || '').trim();

  const isPassive = document.getElementById('mglEditIsPassive')
    ? document.getElementById('mglEditIsPassive').checked
    : Boolean(oldMember._istPassiv || oldMember.IsPassive || oldMember.is_passive);
  const isHonorary = document.getElementById('mglEditIsHonorary')
    ? document.getElementById('mglEditIsHonorary').checked
    : Boolean(oldMember._istEhren || oldMember.IsHonoraryMember || oldMember.is_honorary);
  const honorarySince = document.getElementById('mglEditHonorarySince')?.value || oldMember.HonoraryMemberSince || oldMember.honorary_member_since || null;
  const clubEntry = document.getElementById('mglEditClubEntry')?.value || oldMember.ClubEntryDate || oldMember.club_entry_date || oldMember.FirstClubEntryDateSSV || null;
  const austritt = document.getElementById('mglEditAustritt')?.value || oldMember.Vereinsaustritt || oldMember.club_exit_date || null;
  const remark = (document.getElementById('mglEditRemark')?.value || oldMember.Remark || oldMember.remark || '').trim();

  const iban = (document.getElementById('mglEditIBAN')?.value || '').trim();
  const bic = (document.getElementById('mglEditBIC')?.value || '').trim();
  const konto = (document.getElementById('mglEditKonto')?.value || '').trim();
  const rv = document.getElementById('mglEditRV')?.value || 'E-Mail';
  const nieMahnen = document.getElementById('mglEditMahnen')?.checked || false;

  if (!firstName || !lastName) {
    alert('Mitgliedsdaten unvollständig (Vorname/Nachname fehlt).');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Zahlungsdaten speichern';
    }
    return;
  }

  const updatePayload = {
    first_name: firstName,
    last_name: lastName,
    salutation: salutation || null,
    birth_date: birthDate || null,
    gender: gender || null,
    street: street || null,
    post_code: postCode || null,
    city: city || null,
    primary_email: email || null,
    private_mobile_phone: mobile || null,
    private_landline_phone: landline || null,
    is_passive: isPassive,
    is_passive_source: isPassive ? 'manual' : (oldMember.IsPassiveSource || 'ssv'),
    is_honorary: isHonorary,
    is_honorary_source: isHonorary ? 'manual' : (oldMember.IsHonoraryMemberSource || 'ssv'),
    honorary_member_since: honorarySince || null,
    club_entry_date: clubEntry || null,
    club_exit_date: austritt || null,
    remark: remark || null,
    iban: iban || null,
    bic: bic || null,
    kontoinhaber: konto || null,
    rechnungsversand: rv || 'E-Mail',
    nie_mahnen: nieMahnen,
    last_updated_by: window.currentUser?.email || 'Vorstand',
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  try {
    const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
    let supaSuccess = false;

    // 1. PRIMÄR: Supabase PostgreSQL Update
    if (supa) {
      const { error: supaErr } = await supa
        .from('members')
        .update(updatePayload)
        .eq('person_number', Number(pn));

      if (supaErr) {
        console.error('❌ Supabase members Update-Fehler:', supaErr);
        throw new Error('Supabase Fehler: ' + supaErr.message);
      }
      supaSuccess = true;
      console.log(`⚡ Supabase: Mitglied ${pn} erfolgreich mutiert.`);

      // 2. REVISIONS-AUDIT: In public.member_history protokollieren
      const changesSummary = [];
      if (oldMember.IBAN !== iban) changesSummary.push(`IBAN geändert: ${oldMember.IBAN || '–'} ➔ ${iban || '–'}`);
      if (oldMember.BIC !== bic) changesSummary.push(`BIC geändert`);
      if (oldMember.Kontoinhaber !== konto) changesSummary.push(`Kontoinhaber: ${konto || '–'}`);
      if (oldMember.Rechnungsversand !== rv) changesSummary.push(`Rechnungsversand: ${rv}`);
      if (Boolean(oldMember.Niemahnen) !== nieMahnen) changesSummary.push(`Nie mahnen: ${nieMahnen ? 'Ja' : 'Nein'}`);
      if (oldMember.Remark !== remark) changesSummary.push(`Notiz aktualisiert`);
      if (oldMember.Street !== street || oldMember.City !== city) changesSummary.push(`Adresse geändert`);
      if (oldMember.PrimaryEmail !== email) changesSummary.push(`E-Mail geändert`);

      try {
        const { error: histErr } = await supa.from('member_history').insert({
          person_number: Number(pn),
          ereignistyp: 'Mutation Vorstand',
          alterwert: `Name: ${oldMember.FirstName || ''} ${oldMember.LastName || ''}, Ort: ${oldMember.City || '-'}, Status: ${oldMember._istPassiv ? 'Passiv' : 'Aktiv'}`,
          neuerwert: changesSummary.length ? changesSummary.join('; ') : 'Stammdaten aktualisiert',
          name: `${firstName} ${lastName}`,
          erfasstvon: window.currentUser?.email || 'Vorstand',
          datum: new Date().toISOString().split('T')[0]
        });
        if (histErr) console.warn('⚠️ member_history Audit-Insert:', histErr);
      } catch (err) {
        console.warn('⚠️ member_history Audit-Insert Exception:', err);
      }
    }

    // 3. LOKALEN STATE (RAM) AKTUALISIEREN
    if (idx >= 0) {
      Object.assign(_mglData[idx], {
        FirstName: firstName,
        LastName: lastName,
        Salutation: salutation,
        BirthDate: birthDate,
        Gender: gender,
        Street: street,
        PostCode: postCode,
        City: city,
        PrimaryEmail: email,
        PrivateMobilePhone: mobile,
        PrivateLandlinePhone: landline,
        IsPassive: isPassive ? 1 : 0,
        IsPassiveSource: updatePayload.is_passive_source,
        IsHonoraryMember: isHonorary ? 1 : 0,
        IsHonoraryMemberSource: updatePayload.is_honorary_source,
        HonoraryMemberSince: honorarySince,
        ClubEntryDate: clubEntry,
        Vereinsaustritt: austritt,
        Remark: remark,
        IBAN: iban,
        BIC: bic,
        Kontoinhaber: konto,
        Rechnungsversand: rv,
        Niemahnen: nieMahnen ? 1 : 0,
        _istEhren: isHonorary,
        _istPassiv: isPassive,
        _badgeAktiv: !isPassive && !austritt,
        _isU21: typeof mglIsU21 === 'function' ? mglIsU21({ BirthDate: birthDate, PersonNumber: pn }) : false
      });
    }

    if (window.AppCache) {
      window.AppCache.set('mitglieder', {
        data: _mglData,
        lizenzen: _mglLizenzenCache,
        funktionen: _mglFunktionenCache,
        historie: _mglHistoryCache
      }, 120);
    }

    // Modal-Titel & Header-Ansicht live auffrischen
    const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim() || '??';
    const profileNameEl = document.querySelector('.mgl-profile-name');
    if (profileNameEl) profileNameEl.textContent = `${firstName} ${lastName}`;
    const avatarEl = document.querySelector('.mgl-avatar');
    if (avatarEl) avatarEl.textContent = initials;
    const detailTitleEl = document.getElementById('mglDetailTitle');
    if (detailTitleEl) detailTitleEl.textContent = `${firstName} ${lastName}`;

    if (btn) {
      btn.className = 'btn btn-success px-4 fw-bold shadow-sm';
      btn.innerHTML = '<i class="fas fa-check me-1"></i> In Supabase gespeichert!';
      setTimeout(() => {
        btn.disabled = false;
        btn.className = 'btn btn-primary px-4 fw-bold shadow-sm';
        btn.innerHTML = '<i class="fas fa-save me-1"></i> Änderungen speichern';
      }, 2000);
    }

    // Liste im Hintergrund neu rendern
    if (typeof mglFilter === 'function') mglFilter();

  } catch (e) {
    console.error('❌ Fehler beim Speichern des Mitglieds:', e);
    alert('Fehler beim Speichern: ' + e.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Änderungen speichern';
    }
  }
}

// Rückwärtskompatibler Wrapper
window.mglSaveVerein = function(pn) {
  return mglSaveMember(null, pn);
};

window.mglSaveMember = mglSaveMember;

function mglNeuesMitglied() {
  ['nmVorname','nmNachname','nmEmail','nmStrasse','nmPlz','nmOrt','nmTel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('nmGeburt').value = '';
  new bootstrap.Modal(document.getElementById('mglModalNeu')).show();
}

/**
 * Legt ein neues Mitglied direkt in Supabase PostgreSQL mit einer freien internen
 * Personennummer an.
 */
async function mglSaveNeu() {
  const vorname = (document.getElementById('nmVorname')?.value || '').trim();
  const nachname = (document.getElementById('nmNachname')?.value || '').trim();
  const geburt = document.getElementById('nmGeburt')?.value || '';
  const email = (document.getElementById('nmEmail')?.value || '').trim();
  const strasse = (document.getElementById('nmStrasse')?.value || '').trim();
  const plz = (document.getElementById('nmPlz')?.value || '').trim();
  const ort = (document.getElementById('nmOrt')?.value || '').trim();
  const tel = (document.getElementById('nmTel')?.value || '').trim();

  if (!vorname || !nachname || !geburt) {
    alert('Vorname, Nachname und Geburtsdatum sind Pflichtfelder.');
    return;
  }

  const btn = document.querySelector('#mglModalNeu .btn-primary');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span> Erstelle in Supabase...';
  }

  try {
    const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;

    // Freie interne Personennummer ab 990001 ermitteln
    let nextPn = 990001;
    if (supa) {
      const { data: maxRow } = await supa
        .from('members')
        .select('person_number')
        .gte('person_number', 990000)
        .order('person_number', { ascending: false })
        .limit(1);

      if (maxRow && maxRow.length && maxRow[0].person_number >= 990000) {
        nextPn = maxRow[0].person_number + 1;
      } else {
        const localHigh = (_mglData || []).map(m => Number(m.PersonNumber)).filter(n => !isNaN(n) && n >= 990000);
        if (localHigh.length) nextPn = Math.max(...localHigh) + 1;
      }
    }

    const newMemberRecord = {
      person_number: nextPn,
      first_name: vorname,
      last_name: nachname,
      birth_date: geburt,
      primary_email: email || null,
      street: strasse || null,
      post_code: plz || null,
      city: ort || null,
      private_mobile_phone: tel || null,
      is_active: true,
      is_passive: false,
      is_passive_source: 'manual',
      created_at: new Date().toISOString(),
      synced_at: new Date().toISOString(),
      last_updated_by: window.currentUser?.email || 'Vorstand'
    };

    // 1. PRIMÄR: In Supabase speichern
    if (supa) {
      const { error: insErr } = await supa.from('members').insert(newMemberRecord);
      if (insErr) throw new Error('Supabase Insert-Fehler: ' + insErr.message);

      // Audit Log
      try {
        const { error: histErr } = await supa.from('member_history').insert({
          person_number: nextPn,
          ereignistyp: 'Vereinseintritt',
          alterwert: '-',
          neuerwert: `Neuaufnahme intern: ${vorname} ${nachname}`,
          name: `${vorname} ${nachname}`,
          erfasstvon: window.currentUser?.email || 'Vorstand',
          datum: new Date().toISOString().split('T')[0]
        });
        if (histErr) console.warn('member_history error:', histErr);
      } catch (e) {
        console.warn('member_history exception:', e);
      }
    }



    const modalEl = document.getElementById('mglModalNeu');
    const modalInstance = bootstrap.Modal.getInstance(modalEl);
    if (modalInstance) modalInstance.hide();

    alert(`✅ Mitglied erfolgreich in Supabase erstellt (Personennummer: ${nextPn})`);

    if (window.AppCache) {
      window.AppCache.invalidate('mitglieder');
    }
    await loadMitgliederData(true);

  } catch (e) {
    console.error('❌ Fehler beim Erstellen des Mitglieds:', e);
    alert('Fehler: ' + e.message);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save me-1"></i> Erstellen';
    }
  }
}

function mglOpenEdit(pn) {
  mglOpenDetail(pn);
  setTimeout(() => {
    document.querySelector('[href="#mglTabEdit"]')?.click();
  }, 700);
}
