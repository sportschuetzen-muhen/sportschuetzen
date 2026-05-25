// === SUB-MODUL: MITGLIEDER - MANAGER & CRUD ===

async function mglSaveVerein(pn) {
  const btn = document.querySelector('#mglTabEdit .btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  const params = {
    action: 'saveVerein',
    pn,
    IBAN: document.getElementById('mglEditIBAN').value,
    BIC: document.getElementById('mglEditBIC').value,
    Kontoinhaber: document.getElementById('mglEditKonto').value,
    Rechnungsversand: document.getElementById('mglEditRV').value,
    Vereinsaustritt: document.getElementById('mglEditAustritt').value,
    Niemahnen: document.getElementById('mglEditMahnen').checked ? '1' : '0'
  };

  try {
    const res = await apiFetch('mitglieder', params, 'POST');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Speichern fehlgeschlagen');

    const idx = _mglData.findIndex(m => String(m.PersonNumber) === String(pn));
    if (idx >= 0) {
      Object.assign(_mglData[idx], {
        IBAN: params.IBAN,
        BIC: params.BIC,
        Kontoinhaber: params.Kontoinhaber,
        Rechnungsversand: params.Rechnungsversand,
        Vereinsaustritt: params.Vereinsaustritt,
        Niemahnen: params.Niemahnen === '1'
      });
    }

    btn.innerHTML = '<i class="fas fa-check text-success"></i> Gespeichert!';
    setTimeout(() => {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-save"></i> Speichern';
    }, 1800);
  } catch (e) {
    alert('Fehler: ' + e.message);
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Speichern';
  }
}

function mglNeuesMitglied() {
  ['nmVorname','nmNachname','nmEmail','nmStrasse','nmPlz','nmOrt','nmTel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  document.getElementById('nmGeburt').value = '';
  new bootstrap.Modal(document.getElementById('mglModalNeu')).show();
}

async function mglSaveNeu() {
  const vorname = document.getElementById('nmVorname').value.trim();
  const nachname = document.getElementById('nmNachname').value.trim();
  const geburt = document.getElementById('nmGeburt').value;

  if (!vorname || !nachname || !geburt) {
    alert('Vorname, Nachname und Geburtsdatum sind Pflichtfelder.');
    return;
  }

  const btn = document.querySelector('#mglModalNeu .btn-primary');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';

  const payload = {
    action: 'createIntern',
    FirstName: vorname,
    LastName: nachname,
    BirthDate: geburt,
    PrimaryEmail: document.getElementById('nmEmail').value,
    Street: document.getElementById('nmStrasse').value,
    PostCode: document.getElementById('nmPlz').value,
    City: document.getElementById('nmOrt').value,
    PrivateMobilePhone: document.getElementById('nmTel').value
  };

  try {
    const res = await apiFetch('mitglieder', payload, 'POST');
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Erstellen fehlgeschlagen');

    bootstrap.Modal.getInstance(document.getElementById('mglModalNeu')).hide();
    alert(`✅ Mitglied erstellt (${data.PersonNumber})`);
    await loadMitgliederData();
  } catch (e) {
    alert('Fehler: ' + e.message);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Erstellen';
  }
}

function mglOpenEdit(pn) {
  mglOpenDetail(pn);
  setTimeout(() => {
    document.querySelector('[href="#mglTabEdit"]')?.click();
  }, 700);
}
