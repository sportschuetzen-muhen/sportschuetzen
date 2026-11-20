// === SUB-MODUL: MITGLIEDER - MANAGER & CRUD (SUPABASE WRITE-MASTER) ===

function mglResolveCurrentUser() {
  const u = window.currentUser;
  const raw = typeof u === 'string'
    ? u
    : (u ? (u.display_name || u.email || u.name || '') : '');
  return raw || (typeof localStorage !== 'undefined' ? localStorage.getItem('portal_user') : '') || 'Vorstand';
}

/**
 * Speichert vollständige Mitglieds-Mutationen in Supabase PostgreSQL
 * und protokolliert die Änderung im Revisions-Audit (member_history).
 */
async function mglSaveMember(event, pn) {
  if (event) event.preventDefault();

  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('members')) {
    if (window.UIConfirmKit?.alert) {
      await window.UIConfirmKit.alert({
        title: 'Keine Berechtigung',
        message: 'Du hast keine Berechtigung zum Bearbeiten von Mitgliedern.',
        type: 'warning'
      });
    }
    return;
  }

  const idx = _mglData.findIndex(m => String(m.PersonNumber) === String(pn));
  const oldMember = idx >= 0 ? _mglData[idx] : {};

  // Formular-Felder auslesen (Stammdaten via SSV, Formular fokussiert auf Vereins- & Zahlungsdaten)
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
  const clubEntryInput = document.getElementById('mglEditClubEntry')?.value ?? '';
  const oldSsvClubEntry = oldMember.FirstClubEntryDateSSV || null;
  const clubEntry = clubEntryInput || oldMember.ClubEntryDate || oldMember.club_entry_date || oldSsvClubEntry || null;
  const clubEntryWasManual = String(oldMember.ClubEntryDateSource || '').toLowerCase() === 'manual';
  const clubEntryIsManual = Boolean(clubEntryInput && (clubEntryWasManual || clubEntryInput !== (oldSsvClubEntry || '')));
  const austritt = document.getElementById('mglEditAustritt')?.value || oldMember.Vereinsaustritt || oldMember.club_exit_date || null;
  const remark = (document.getElementById('mglEditRemark')?.value || oldMember.Remark || oldMember.remark || '').trim();

  const iban = (document.getElementById('mglEditIBAN')?.value || '').trim();
  const bic = (document.getElementById('mglEditBIC')?.value || '').trim();
  const konto = (document.getElementById('mglEditKonto')?.value || '').trim();
  const rv = document.getElementById('mglEditRV')?.value || 'E-Mail';
  const nieMahnen = document.getElementById('mglEditMahnen')?.checked || false;
  const avatarUrl = document.getElementById('mglEditAvatarUrl')
    ? (document.getElementById('mglEditAvatarUrl').value.trim() || null)
    : (oldMember.AvatarUrl || oldMember.avatar_url || null);

  if (!firstName || !lastName) {
    if (window.UIConfirmKit?.alert) {
      await window.UIConfirmKit.alert({
        title: 'Eingabe unvollständig',
        message: 'Bitte fülle Vorname und Nachname aus.',
        type: 'warning'
      });
    }
    return;
  }

  const currentUserName = mglResolveCurrentUser();
  const todayIso = new Date().toISOString().split('T')[0];
  const exitedAlready = Boolean(austritt && austritt <= todayIso);

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
    honorary_member_since_source: honorarySince ? 'manual' : (oldMember.HonoraryMemberSinceSource || 'ssv'),
    club_entry_date: clubEntry || null,
    club_entry_date_source: clubEntryIsManual ? 'manual' : (oldMember.ClubEntryDateSource || 'ssv'),
    club_exit_date: austritt || null,
    ...(exitedAlready ? { is_active: false } : {}),
    remark: remark || null,
    avatar_url: avatarUrl,
    iban: iban || null,
    bic: bic || null,
    kontoinhaber: konto || null,
    rechnungsversand: rv || 'E-Mail',
    nie_mahnen: nieMahnen,
    last_updated_by: currentUserName,
    synced_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  const runSave = async () => {
    try {
      const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;

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
        console.log(`⚡ Supabase: Mitglied ${pn} erfolgreich mutiert.`);

        // 2. REVISIONS-AUDIT: In public.member_history protokollieren
        const changesSummary = [];
        if (oldMember.IBAN !== iban) changesSummary.push(`IBAN geändert: ${oldMember.IBAN || '–'} ➔ ${iban || '–'}`);
        if (oldMember.BIC !== bic) changesSummary.push(`BIC geändert`);
        if (oldMember.Kontoinhaber !== konto) changesSummary.push(`Kontoinhaber: ${konto || '–'}`);
        if (oldMember.Rechnungsversand !== rv) changesSummary.push(`Rechnungsversand: ${rv}`);
        if (Boolean(oldMember.Niemahnen) !== nieMahnen) changesSummary.push(`Nie mahnen: ${nieMahnen ? 'Ja' : 'Nein'}`);
        if (Boolean(oldMember._istEhren) !== isHonorary) changesSummary.push(`Ehrenmitglied: ${isHonorary ? 'Ja' : 'Nein'}`);
        if (oldMember.HonoraryMemberSince !== honorarySince) changesSummary.push(`Ernennungsdatum: ${honorarySince || '–'}`);
        if (oldMember.ClubEntryDate !== clubEntry) changesSummary.push(`Vereinseintritt: ${clubEntry || '–'}`);
        if (oldMember.Vereinsaustritt !== austritt) changesSummary.push(`Vereinsaustritt: ${austritt || '–'}`);
        if (oldMember.Remark !== remark) changesSummary.push(`Notiz aktualisiert`);
        if (oldMember.Street !== street || oldMember.City !== city) changesSummary.push(`Adresse geändert`);
        if (oldMember.PrimaryEmail !== email) changesSummary.push(`E-Mail geändert`);
        if ((oldMember.AvatarUrl || null) !== (avatarUrl || null)) changesSummary.push('Profilfoto / Avatar aktualisiert');

        try {
          const { error: histErr } = await supa.from('member_history').insert({
            person_number: Number(pn),
            ereignistyp: 'Mutation Vorstand',
            alterwert: `Name: ${oldMember.FirstName || ''} ${oldMember.LastName || ''}, Ort: ${oldMember.City || '-'}, Status: ${oldMember._istPassiv ? 'Passiv' : 'Aktiv'}`,
            neuerwert: changesSummary.length ? changesSummary.join('; ') : 'Stammdaten aktualisiert',
            name: `${firstName} ${lastName}`,
            erfasstvon: currentUserName,
            datum: todayIso
          });
          if (histErr) console.warn('⚠️ member_history Audit-Insert:', histErr);
        } catch (err) {
          console.warn('⚠️ member_history Audit-Insert Exception:', err);
        }
      }

      // 3. LOKALEN STATE (RAM) AKTUALISIEREN
      if (idx >= 0) {
        const ernennungsjahr = window.mglExtractYear ? window.mglExtractYear(honorarySince) : (honorarySince ? new Date(honorarySince).getFullYear() : null);
        const mitgliedsjahre = window.mglCalcMitgliedsjahre ? window.mglCalcMitgliedsjahre(clubEntry, austritt) : 0;
        const stillActive = exitedAlready ? false : Boolean(oldMember.IsActive == 1 || oldMember.IsActive === true || oldMember.IsActive === '1');
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
          IsActive: stillActive ? 1 : 0,
          IsPassive: isPassive ? 1 : 0,
          IsPassiveSource: updatePayload.is_passive_source,
          IsHonoraryMember: isHonorary ? 1 : 0,
          IsHonoraryMemberSource: updatePayload.is_honorary_source,
          HonoraryMemberSince: honorarySince,
          HonoraryMemberSinceSource: updatePayload.honorary_member_since_source,
          ClubEntryDate: clubEntry,
          ClubEntryDateSource: updatePayload.club_entry_date_source,
          Vereinsaustritt: austritt,
          Remark: remark,
          AvatarUrl: avatarUrl,
          IBAN: iban,
          BIC: bic,
          Kontoinhaber: konto,
          Rechnungsversand: rv,
          Niemahnen: nieMahnen ? 1 : 0,
          _istEhren: isHonorary,
          _ernennungsjahr: ernennungsjahr,
          _istPassiv: isPassive,
          _badgeAktiv: stillActive && !isPassive && !Boolean(oldMember.Deceased),
          _isU21: typeof mglIsU21 === 'function' ? mglIsU21({ BirthDate: birthDate, PersonNumber: pn }) : false,
          _eintrittsdatum: clubEntry,
          _eintrittsjahr: window.mglExtractYear ? window.mglExtractYear(clubEntry) : null,
          _mitgliedsjahre: mitgliedsjahre,
          _jubilaeumAktuell: window.mglIsJubileeInYear ? window.mglIsJubileeInYear(clubEntry) : null,
          _naechstesJubilaeum: window.mglNextJubilee ? window.mglNextJubilee(clubEntry) : null
        });
      }

      if (window.AppCache) {
        window.AppCache.set('mitglieder', {
          data: _mglData,
          lizenzen: window._mglLizenzenCache,
          funktionen: window._mglFunktionenCache,
          training: window._mglTrainingCache,
          historie: window._mglHistoryCache
        }, 120);
      }

      // Modal-Titel & Header-Ansicht live auffrischen
      const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.trim() || '??';
      const profileNameEl = document.querySelector('.mgl-profile-name');
      if (profileNameEl) profileNameEl.textContent = `${firstName} ${lastName}`;
      const avatarEl = document.querySelector('.mgl-avatar');
      if (avatarEl) {
        avatarEl.innerHTML = avatarUrl
          ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(firstName)}" style="width:100%; height:100%; object-fit:cover;">`
          : escapeHtml(initials);
      }
      const detailTitleEl = document.getElementById('mglDetailTitle');
      if (detailTitleEl) detailTitleEl.textContent = `${firstName} ${lastName}`;

      if (typeof showSuccess === 'function') {
        showSuccess('Vereins- & Zahlungsdaten in Supabase gespeichert.');
      }

      if (typeof mglFilter === 'function') mglFilter();

    } catch (e) {
      console.error('❌ Fehler beim Speichern des Mitglieds:', e);
      if (window.UIConfirmKit?.alert) {
        await window.UIConfirmKit.alert({
          title: 'Fehler beim Speichern',
          message: e.message || 'Die Daten konnten nicht gespeichert werden.',
          type: 'danger'
        });
      }
    }
  };

  const btnSelector = document.getElementById('mglEditSubmitBtn') ? '#mglEditSubmitBtn' : '#mglTabEdit .btn-primary';
  if (window.UIButtonKit?.withLoading && document.querySelector(btnSelector)) {
    await window.UIButtonKit.withLoading(btnSelector, runSave);
  } else {
    await runSave();
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
  if (typeof hasWriteAccess === 'function' && !hasWriteAccess('members')) {
    if (window.UIConfirmKit?.alert) {
      await window.UIConfirmKit.alert({
        title: 'Keine Berechtigung',
        message: 'Du hast keine Berechtigung zum Erfassen von Mitgliedern.',
        type: 'warning'
      });
    }
    return;
  }

  const vorname = (document.getElementById('nmVorname')?.value || '').trim();
  const nachname = (document.getElementById('nmNachname')?.value || '').trim();
  const geburt = document.getElementById('nmGeburt')?.value || '';
  const email = (document.getElementById('nmEmail')?.value || '').trim();
  const strasse = (document.getElementById('nmStrasse')?.value || '').trim();
  const plz = (document.getElementById('nmPlz')?.value || '').trim();
  const ort = (document.getElementById('nmOrt')?.value || '').trim();
  const tel = (document.getElementById('nmTel')?.value || '').trim();

  if (!vorname || !nachname || !geburt) {
    if (window.UIConfirmKit?.alert) {
      await window.UIConfirmKit.alert({
        title: 'Pflichtfelder fehlen',
        message: 'Bitte fülle Vorname, Nachname und Geburtsdatum aus.',
        type: 'warning'
      });
    }
    return;
  }

  const runCreate = async () => {
    try {
      const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
      const currentUserName = mglResolveCurrentUser();

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
        organization_number: 'INTERN',
        organization_name: 'Intern',
        is_active: true,
        is_passive: false,
        is_passive_source: 'manual',
        club_entry_date: new Date().toISOString().split('T')[0],
        club_entry_date_source: 'manual',
        created_at: new Date().toISOString(),
        synced_at: new Date().toISOString(),
        last_updated_by: currentUserName
      };

      if (supa) {
        const { error: insErr } = await supa.from('members').insert(newMemberRecord);
        if (insErr) throw new Error('Supabase Insert-Fehler: ' + insErr.message);

        try {
          const { error: histErr } = await supa.from('member_history').insert({
            person_number: nextPn,
            ereignistyp: 'Vereinseintritt',
            alterwert: '-',
            neuerwert: `Neuaufnahme intern: ${vorname} ${nachname}`,
            name: `${vorname} ${nachname}`,
            erfasstvon: currentUserName,
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

      if (window.UIConfirmKit?.alert) {
        await window.UIConfirmKit.alert({
          title: 'Mitglied erstellt',
          message: `Das interne Mitglied wurde erfolgreich in Supabase gespeichert (Personennummer: ${nextPn}).`,
          type: 'info'
        });
      }

      if (window.AppCache) {
        window.AppCache.invalidate('mitglieder');
      }
      await loadMitgliederData(true);

    } catch (e) {
      console.error('❌ Fehler beim Erstellen des Mitglieds:', e);
      if (window.UIConfirmKit?.alert) {
        await window.UIConfirmKit.alert({
          title: 'Fehler beim Erstellen',
          message: e.message || 'Unbekannter Fehler beim Anlegen.',
          type: 'danger'
        });
      }
    }
  };

  const btnSelector = document.getElementById('mglBtnSaveNeu') ? '#mglBtnSaveNeu' : '#mglModalNeu .btn-primary';
  if (window.UIButtonKit?.withLoading && document.querySelector(btnSelector)) {
    await window.UIButtonKit.withLoading(btnSelector, runCreate);
  } else {
    await runCreate();
  }
}

function mglOpenEdit(pn) {
  mglOpenDetail(pn);
  setTimeout(() => {
    document.querySelector('[href="#mglTabEdit"]')?.click();
  }, 700);
}

/**
 * Komprimiert und lädt ein Profilfoto für ein Mitglied in Supabase Storage hoch.
 */
async function mglHandleAvatarUpload(event, pn) {
  const file = event?.target?.files?.[0];
  if (!file) return;

  const statusEl = document.getElementById('mglAvatarStatusText');
  const previewBox = document.getElementById('mglAvatarPreviewBox');
  const hiddenInput = document.getElementById('mglEditAvatarUrl');

  const isHeic = window.ImageKit && window.ImageKit.isHeic(file);
  if (statusEl) {
    statusEl.innerHTML = isHeic 
      ? '<span class="text-primary"><i class="fas fa-spinner fa-spin me-1"></i> 🍎 Apple HEIC wird konvertiert & optimiert...</span>'
      : '<span class="text-primary"><i class="fas fa-spinner fa-spin me-1"></i> Foto wird optimiert & hochgeladen...</span>';
  }

  try {
    // 1. Zentrales ImageKit: HEIC-Normalisierung, robuste Multi-Fallback Dekodierung & 600x600 WebP Zuschnitt
    let blob;
    let format = 'image/webp';
    if (window.ImageKit && typeof window.ImageKit.cropSquare === 'function') {
      const processed = await window.ImageKit.cropSquare(file, { size: 600, quality: 0.85, format: 'image/webp' });
      blob = processed.blob;
      format = processed.format || 'image/webp';
    } else {
      // Fallback
      const imgBitmap = await createImageBitmap(file);
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 600;
      const ctx = canvas.getContext('2d');
      const minSide = Math.min(imgBitmap.width, imgBitmap.height);
      const startX = (imgBitmap.width - minSide) / 2;
      const startY = (imgBitmap.height - minSide) / 2;
      ctx.drawImage(imgBitmap, startX, startY, minSide, minSide, 0, 0, 600, 600);
      blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/webp', 0.82));
    }

    if (!blob) throw new Error('Bildkonvertierung fehlgeschlagen.');

    // 2. Supabase Client & Upload in operatives-storage Bucket
    const supa = window.getSupabaseClient ? window.getSupabaseClient() : null;
    if (!supa) throw new Error('Supabase Client nicht verfügbar.');

    let ext = format === 'image/jpeg' ? 'jpg' : 'webp';
    let filePath = `avatars/member_${pn}.${ext}`;
    let uploadRes = await supa.storage
      .from('operatives-storage')
      .upload(filePath, blob, {
        contentType: format,
        upsert: true
      });

    // Transparenter Fallback auf JPEG, falls ein Browser oder Storage unerwartet WebP ablehnen sollte
    if (uploadRes.error && format === 'image/webp' && /mime type/i.test(uploadRes.error.message || '')) {
      console.warn('WebP abgewiesen, erstelle automatischen JPEG-Fallback...');
      const jpegProcessed = await window.ImageKit.cropSquare(file, { size: 600, quality: 0.85, format: 'image/jpeg' });
      ext = 'jpg';
      format = 'image/jpeg';
      filePath = `avatars/member_${pn}.jpg`;
      uploadRes = await supa.storage
        .from('operatives-storage')
        .upload(filePath, jpegProcessed.blob, {
          contentType: 'image/jpeg',
          upsert: true
        });
    }

    if (uploadRes.error) throw uploadRes.error;

    // 4. Öffentliche URL mit Cache-Buster setzen
    const publicUrl = `https://supabase-muhen.danfamily.uk/storage/v1/object/public/operatives-storage/${filePath}?t=${Date.now()}`;

    if (hiddenInput) hiddenInput.value = publicUrl;

    if (previewBox) {
      previewBox.innerHTML = `<img id="mglAvatarPreviewImg" src="${escapeHtml(publicUrl)}" style="width:100%; height:100%; object-fit:cover;">`;
    }

    if (statusEl) statusEl.innerHTML = '<span class="text-success fw-semibold"><i class="fas fa-check-circle me-1"></i> Foto hochgeladen! Klicke unten auf «Vereins- & Zahlungsdaten speichern».</span>';

  } catch (err) {
    console.error('Avatar-Upload-Fehler:', err);
    if (statusEl) statusEl.innerHTML = `<span class="text-danger"><i class="fas fa-exclamation-triangle me-1"></i> Upload-Fehler: ${escapeHtml(err.message)}</span>`;
  }
}
window.mglHandleAvatarUpload = mglHandleAvatarUpload;

function mglRemoveAvatar(pn) {
  const hiddenInput = document.getElementById('mglEditAvatarUrl');
  const previewBox = document.getElementById('mglAvatarPreviewBox');
  const statusEl = document.getElementById('mglAvatarStatusText');

  if (hiddenInput) hiddenInput.value = '';

  const m = _mglData.find(x => String(x.PersonNumber) === String(pn));
  const initials = m ? `${(m.FirstName || '').charAt(0)}${(m.LastName || '').charAt(0)}`.trim() : '??';

  if (previewBox) {
    previewBox.innerHTML = `<span id="mglAvatarPreviewInitials" class="fw-bold text-muted">${initials}</span>`;
  }

  if (statusEl) statusEl.innerHTML = '<span class="text-warning"><i class="fas fa-info-circle me-1"></i> Foto entfernt. Klicke unten auf «Vereins- & Zahlungsdaten speichern», um die Änderung zu übernehmen.</span>';
}
window.mglRemoveAvatar = mglRemoveAvatar;

