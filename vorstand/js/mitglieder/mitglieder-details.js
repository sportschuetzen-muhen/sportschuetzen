// === SUB-MODUL: MITGLIEDER - DETAILS & TIMELINE ===

function mglAssembleTimeline(m, liz, fn, his) {
  const timeline = [];
  
  if (m) {
    const entry = m.ClubEntryDate || m.FirstClubEntryDateSSV;
    if (entry) {
      timeline.push({ datum: entry, title: 'Vereinseintritt', typ: 'Eintritt', icon: '👤', color: '#2563eb' });
    }
    if ((m.IsHonoraryMember == 1 || m.IsHonoraryMember === true || m._istEhren) && m.HonoraryMemberSince) {
      timeline.push({ datum: m.HonoraryMemberSince, title: 'Ehrenmitglied ernannt', typ: 'Ehren', icon: '🏆', color: '#f59e0b' });
    }
    if (m.Vereinsaustritt) {
      timeline.push({ datum: m.Vereinsaustritt, title: 'Vereinsaustritt', typ: 'Austritt', icon: '🚪', color: '#6b7280' });
    }
  }

  if (Array.isArray(liz)) {
    liz.forEach(l => {
      if (l.EntryDate) {
        timeline.push({ datum: l.EntryDate, title: 'Lizenz erteilt', typ: 'Lizenz', meta: l.MembershipCategory, icon: '🎖', color: '#2563eb' });
      }
      if (l.ExitDate) {
        timeline.push({ datum: l.ExitDate, title: 'Lizenz beendet', typ: 'LizenzEnde', meta: l.MembershipCategory, icon: '📋', color: '#9ca3af' });
      }
    });
  }

  if (Array.isArray(fn)) {
    fn.forEach(f => {
      if (f.OfficialFunctionEntryDate) {
        timeline.push({ datum: f.OfficialFunctionEntryDate, title: 'Funktion übernommen', typ: 'Funktion', meta: f.OfficialFunctionCategory, icon: '💼', color: '#7c3aed' });
      }
      if (f.OfficialFunctionExitDate) {
        timeline.push({ datum: f.OfficialFunctionExitDate, title: 'Funktion abgegeben', typ: 'FunktionEnde', meta: f.OfficialFunctionCategory, icon: '📋', color: '#9ca3af' });
      }
    });
  }

  if (Array.isArray(his)) {
    his.forEach(h => {
      timeline.push({
        datum: h.datum || h.erfasstam || '',
        title: h.ereignistyp || h.ereignis_typ || 'Änderung',
        typ: 'Historie',
        meta: h.neuerwert || h.neuer_wert ? `${h.name || h.erfasst_von || ''}: ${h.neuerwert || h.neuer_wert}` : '',
        text: h.alterwert || h.alter_wert ? `Vorher: ${h.alterwert || h.alter_wert}` : '',
        icon: '📝',
        color: '#64748b'
      });
    });
  }

  // Sortierung: neueste zuerst
  timeline.sort((a, b) => String(b.datum || '').localeCompare(String(a.datum || '')));
  return timeline;
}

function mglOpenDetail(pn) {
  const modal = new bootstrap.Modal(document.getElementById('mglModalDetail'));
  const body = document.getElementById('mglDetailBody');
  body.innerHTML = '';
  document.getElementById('mglDetailTitle').textContent = 'Lade Mitglied…';
  modal.show();

  try {
    const m = _mglData.find(x => String(x.PersonNumber) === String(pn));
    if (!m) throw new Error('Mitglied nicht in lokalen Daten gefunden: ' + pn);

    const liz = _mglLizenzenCache[pn] || [];
    const fn = _mglFunktionenCache[pn] || [];
    const his = _mglHistoryCache[pn] || [];
    const timelineData = mglAssembleTimeline(m, liz, fn, his);

    document.getElementById('mglDetailTitle').textContent = `${m.FirstName || ''} ${m.LastName || ''}`;

    const initials = `${(m.FirstName || '').charAt(0)}${(m.LastName || '').charAt(0)}`.trim() || '??';
    const mitgliedSeit = m._mitgliedSeit || m.EntryDate || m.HonoraryMemberSince || '';
    const isDeceased = m.Deceased == 1 || m.Deceased === true || m.Deceased === '1';
    const badgeAktiv = (m._badgeAktiv || (m.IsActive == 1 || m.IsActive === true || m.IsActive === '1')) && !m._istPassiv && !isDeceased;
    const badgeLizenz = m._badgeLizenzText || `${Number(m._aktiveLizenzenCount || 0)} aktiv`;
    const badgeEhren = m._badgeEhren || m.IsHonoraryMember == 1 || m.IsHonoraryMember === true;

    document.getElementById('mglDetailTitle').textContent = `${m.FirstName || ''} ${m.LastName || ''} ${isDeceased ? '†' : ''}`;

    const stammdatenRows = [
      ['PersonNumber', m.PersonNumber],
      ['Anrede', m.Salutation],
      ['Vorname', m.FirstName],
      ['Nachname', m.LastName],
      ['Geburtsdatum', mglFmtDate(m.BirthDate)],
      ['Geschlecht', m.Gender],
      ['Nationalität', m.Nationality],
      ['Strasse', m.Street],
      ['PLZ / Ort', `${m.PostCode || ''} ${m.City || ''}`.trim()],
      ['Land', m.Country],
      ['Status', isDeceased ? '† Verstorben' : ''],
      ['E-Mail', m.PrimaryEmail],
      ['Weitere E-Mail', m.AdditionalEmail],
      ['Mobil (privat)', m.PrivateMobilePhone],
      ['Mobil (geschäftl.)', m.BusinessMobilePhone],
      ['Tel. privat', m.PrivateLandlinePhone],
      ['Tel. geschäftl.', m.BusinessLandlinePhone],
    ].filter(([,v]) => v && String(v).trim() !== '' && String(v).trim() !== 'undefined undefined')
     .map(([k, v]) => `
      <div class="row border-bottom py-1">
        <div class="col-5 text-muted small">${escapeHtml(k)}</div>
        <div class="col-7 small fw-semibold">${escapeHtml(String(v))}</div>
      </div>`).join('');

    const lizRows = liz.map(l => {
      const aktiv = (l.IsActive == 1 || l.IsActive === true || l.IsActive === '1') && !String(l.ExitDate || '').trim();
      const istMuhen = l.istMuhen || String(l.LicenseInvoicingClubNumber || '').trim() === '1.02.0.01.087';
      return `<tr>
        <td>${escapeHtml(l.MembershipCategory || '–')}</td>
        <td>${mglFmtDate(l.EntryDate)}</td>
        <td>${mglFmtDate(l.ExitDate)}</td>
        <td>${escapeHtml(l.LicenseType || '–')}</td>
        <td>${istMuhen ? '<span class="badge bg-success opacity-75">Muhen (bezahlt)</span>' : `<span class="badge bg-warning text-dark">Fremdzahler: ${escapeHtml(l.LicenseInvoicingClubName || '–')}</span>`}</td>
        <td><span class="badge ${aktiv ? 'bg-success' : 'bg-secondary'}">${aktiv ? 'aktiv' : 'inaktiv'}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="6" class="text-muted text-center">Keine Lizenzen</td></tr>';

    const fnRows = fn.map(f => {
      const aktiv = !String(f.OfficialFunctionExitDate || '').trim();
      const rabattKat = f.rabatt_kategorie || f.rabattkategorie;
      return `<tr>
        <td>${escapeHtml(f.OfficialFunctionCategory || '–')}</td>
        <td>${mglFmtDate(f.OfficialFunctionEntryDate)}</td>
        <td>${mglFmtDate(f.OfficialFunctionExitDate)}</td>
        <td>${rabattKat ? `<span class="badge bg-warning text-dark">${escapeHtml(rabattKat)}</span>` : '–'}</td>
        <td><span class="badge ${aktiv ? 'bg-success' : 'bg-secondary'}">${aktiv ? 'aktiv' : 'ehemalig'}</span></td>
      </tr>`;
    }).join('') || '<tr><td colspan="5" class="text-muted text-center">Keine Funktionen</td></tr>';

    const timeline = timelineData.length
      ? timelineData.map(t => `
        <div class="mgl-timeline-item">
          <div class="mgl-timeline-dot" style="background:${escapeHtml(t.color || '#2563eb')}"></div>
          <div class="mgl-timeline-card">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-2">
              <div>
                <div class="mgl-timeline-title">${escapeHtml(t.icon || '•')} ${escapeHtml(t.title || t.typ || 'Eintrag')}</div>
                ${t.text ? `<div class="small mt-1">${escapeHtml(t.text)}</div>` : ''}
                ${t.meta ? `<div class="mgl-timeline-meta mt-1">${escapeHtml(t.meta)}</div>` : ''}
              </div>
              <div class="mgl-timeline-date">${mglFmtDate(t.datum)}</div>
            </div>
          </div>
        </div>
      `).join('')
      : '<div class="mgl-empty">Keine Timeline-Einträge</div>';

    const canEditVerein = (window.currentRoles || []).some(r => ['admin','kassier','vorstand','schuetzenmeister'].includes(r));

    body.innerHTML = `
      <div class="p-3 p-md-4 bg-light">
        <div class="mgl-profile-head">
          <div class="d-flex flex-wrap gap-3 align-items-center">
            <div class="mgl-avatar">${initials}</div>
            <div class="flex-grow-1">
              <div class="mgl-profile-name">${m.FirstName || ''} ${m.LastName || ''}</div>
              <div class="mgl-profile-meta">
                Mitglied seit ${mitgliedSeit ? mglFmtDate(mitgliedSeit) : '–'} • Mitgliedsnummer ${m.PersonNumber || '–'}
              </div>
              <div class="mgl-badge-row">
                ${isDeceased ? `<span class="mgl-chip gray">† Verstorben</span>` : (badgeAktiv ? `<span class="mgl-chip green">Aktiv</span>` : `<span class="mgl-chip gray">Inaktiv</span>`)}
                <span class="mgl-chip blue">${badgeLizenz}</span>
                ${badgeEhren ? `<span class="mgl-chip gold">Ehrenmitglied</span>` : ''}
              </div>
            </div>
          </div>

          <div class="mgl-detail-stats mt-4">
            <div class="mgl-overview-card">
              <div class="mgl-overview-label">Mitgliedsjahre</div>
              <div class="mgl-overview-value">${Number(m._mitgliedsjahre || 0)}</div>
            </div>
            <div class="mgl-overview-card">
              <div class="mgl-overview-label">Aktive Lizenzen</div>
              <div class="mgl-overview-value">${Number(m._aktiveLizenzenCount || 0)}</div>
            </div>
            <div class="mgl-overview-card">
              <div class="mgl-overview-label">Vorstand Funktionen</div>
              <div class="mgl-overview-value">${Number(m._aktiveFunktionenCount || 0)}</div>
            </div>
          </div>
        </div>
      </div>

      <div class="mgl-tab-wrap">
        <ul class="nav nav-tabs px-3 pt-2" id="mglDetailTabs">
          <li class="nav-item"><a class="nav-link active" data-bs-toggle="tab" href="#mglTabTimeline">Timeline</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabStamm">Stammdaten</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabLiz">Lizenzen</a></li>
          <li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabFn">Funktionen</a></li>
          ${canEditVerein ? `<li class="nav-item"><a class="nav-link" data-bs-toggle="tab" href="#mglTabEdit">✏️ Bearbeiten</a></li>` : ''}
        </ul>

        <div class="tab-content p-3">
          <div class="tab-pane fade show active" id="mglTabTimeline">
            <div class="mgl-timeline mt-2">${timeline}</div>
          </div>

          <div class="tab-pane fade" id="mglTabStamm">
            <div class="row">
              <div class="col-md-6">
                <h6 class="fw-bold mb-2">Personalien <small class="text-muted fw-normal">(SSV – nur lesen)</small></h6>
                ${stammdatenRows || '<div class="mgl-empty">Keine Stammdaten</div>'}
              </div>
              <div class="col-md-6">
                <h6 class="fw-bold mb-2">Vereinsintern</h6>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Ehrenmitglied</div>
                  <div class="col-7 small">${badgeEhren ? '✅ Ja' : 'Nein'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Ehrenmitglied seit</div>
                  <div class="col-7 small">${mglFmtDate(m.HonoraryMemberSince)}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">IBAN</div>
                  <div class="col-7 small">${m.IBAN || '–'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Kontoinhaber</div>
                  <div class="col-7 small">${m.Kontoinhaber || '–'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Rechnungsversand</div>
                  <div class="col-7 small">${m.Rechnungsversand || '–'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Nie mahnen</div>
                  <div class="col-7 small">${m.Niemahnen ? '✅ Ja' : 'Nein'}</div>
                </div>
                <div class="row border-bottom py-1">
                  <div class="col-5 text-muted small">Vereinsaustritt</div>
                  <div class="col-7 small">${mglFmtDate(m.Vereinsaustritt)}</div>
                </div>
                <div class="row py-1">
                  <div class="col-5 text-muted small">Bemerkung</div>
                  <div class="col-7 small">${m.Remark || '–'}</div>
                </div>
              </div>
            </div>
          </div>

          <div class="tab-pane fade" id="mglTabLiz">
            <div class="table-responsive">
              <table class="table table-sm mgl-table">
                <thead>
                  <tr><th>Kategorie</th><th>Eintritt</th><th>Austritt</th><th>Typ</th><th>Zahlstelle (SSV)</th><th>Status</th></tr>
                </thead>
                <tbody>${lizRows}</tbody>
              </table>
            </div>
          </div>

          <div class="tab-pane fade" id="mglTabFn">
            <div class="table-responsive">
              <table class="table table-sm">
                <thead class="table-light">
                  <tr><th>Funktion</th><th>Eintritt</th><th>Austritt</th><th>Rabatt</th><th>Status</th></tr>
                </thead>
                <tbody>${fnRows}</tbody>
              </table>
            </div>
          </div>

          ${canEditVerein ? `
          <div class="tab-pane fade" id="mglTabEdit">
            <div class="row g-3 mt-1">
              <div class="col-md-6">
                <label class="form-label">IBAN</label>
                <input type="text" class="form-control" id="mglEditIBAN" value="${m.IBAN || ''}">
              </div>
              <div class="col-md-3">
                <label class="form-label">BIC</label>
                <input type="text" class="form-control" id="mglEditBIC" value="${m.BIC || ''}">
              </div>
              <div class="col-md-3">
                <label class="form-label">Kontoinhaber</label>
                <input type="text" class="form-control" id="mglEditKonto" value="${m.Kontoinhaber || ''}">
              </div>
              <div class="col-md-4">
                <label class="form-label">Rechnungsversand</label>
                <select class="form-select" id="mglEditRV">
                  <option ${m.Rechnungsversand === 'E-Mail' ? 'selected' : ''}>E-Mail</option>
                  <option ${m.Rechnungsversand === 'Post' ? 'selected' : ''}>Post</option>
                </select>
              </div>
              <div class="col-md-4">
                <label class="form-label">Vereinsaustritt</label>
                <input type="date" class="form-control" id="mglEditAustritt"
                       value="${mglFmtDateIso(m.Vereinsaustritt)}">
              </div>
              <div class="col-md-4">
                <div class="form-check mt-4">
                  <input type="checkbox" class="form-check-input" id="mglEditMahnen"
                         ${m.Niemahnen ? 'checked' : ''}>
                  <label class="form-check-label">Nie mahnen</label>
                </div>
              </div>
              <div class="col-12">
                <button class="btn btn-primary" onclick="mglSaveVerein('${pn}')">
                  <i class="fas fa-save"></i> Speichern
                </button>
              </div>
            </div>
          </div>` : ''}
        </div>
      </div>`;
  } catch (e) {
    body.innerHTML = `<div class="alert alert-danger m-3">Fehler: ${e.message}</div>`;
  }
}
