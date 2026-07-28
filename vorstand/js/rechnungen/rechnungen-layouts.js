// =====================================================================
// MODUL: RECHNUNGEN & PDF-COCKPIT - LAYOUTS & TEXTBAUSTEINE
// =====================================================================

window._rechnungenSelectedLayoutType = 'Jahresbeitrag';

// Standard-Layouts für alle Rechnungstypen
window.rnGetDefaultLayouts = function() {
  return {
    'Jahresbeitrag': {
      type: 'Jahresbeitrag',
      title: 'Rechnung {rechnungsjahr} – Jahresbeitrag Sportschützen Muhen',
      intro: 'Sehr geehrte Damen und Herren, lieber {vorname},\n\nanbei senden wir dir die Rechnung für deinen Jahresbeitrag des Vereinsjahres {rechnungsjahr}. Wir danken dir herzlich für deine geschätzte Treue und dein Engagement in unserem Verein.',
      outro: 'Mit sportlichen Grüssen\nSportschützen Muhen',
      notice: 'Zahlbar innert 30 Tagen ohne Abzug. Am Ende dieser Seite findest du deinen persönlichen Schweizer QR-Zahlteil.',
      mail_subject: 'Rechnung {rechnungsnummer} – Jahresbeitrag {rechnungsjahr} | Sportschützen Muhen',
      mail_body: 'Guten Tag {vorname} {nachname},\n\nanbei senden wir Ihnen die Rechnung für Ihren Jahresbeitrag des Vereinsjahres {rechnungsjahr}.\n\nGesamtbetrag: CHF {gesamtbetrag}\nZahlungsziel: 30 Tage\n\nAm Ende des angehängten PDF finden Sie Ihren persönlichen QR-Einzahlungsschein.\n\nVielen Dank für Ihre wertvolle Unterstützung als Mitglied!\n\nMit freundlichen Grüssen\nSportschützen Muhen'
    },
    'Vermietung': {
      type: 'Vermietung',
      title: 'Rechnung – Miete Schützenhaus Muhen',
      intro: 'Guten Tag {vorname} {nachname},\n\nvielen Dank für die Miete unseres Schützenhauses in Muhen. Anbei erhalten Sie die detaillierte Abrechnung gemäss Mietvereinbarung.',
      outro: 'Wir hoffen, Sie hatten einen gelungenen Anlass in unserem Schützenhaus und würden uns freuen, Sie wieder begrüssen zu dürfen.\n\nFreundliche Grüsse\nSportschützen Muhen',
      notice: 'Bitte überweisen Sie den Rechnungsbetrag innert 30 Tagen mittels beiliegendem QR-Zahlteil.',
      mail_subject: 'Rechnung {rechnungsnummer} – Miete Schützenhaus Muhen | Sportschützen Muhen',
      mail_body: 'Guten Tag {vorname} {nachname},\n\nanbei übersenden wir Ihnen die Rechnung für die Miete unseres Schützenhauses in Muhen.\n\nRechnungsnummer: {rechnungsnummer}\nRechnungsbetrag: CHF {gesamtbetrag}\n\nDer QR-Einzahlungsschein befindet sich auf der zweiten Seite des angehängten PDFs.\n\nFreundliche Grüsse\nSportschützen Muhen'
    },
    'Schulsport': {
      type: 'Schulsport',
      title: 'Rechnung – Schulsport / Kurse',
      intro: 'Liebe Kursteilnehmerin, lieber Kursteilnehmer, lieber {vorname},\n\nanbei senden wir dir die Abrechnung für den Schulsportkurs / Schiesskurs der Sportschützen Muhen.',
      outro: 'Wir wünschen dir weiterhin viel Freude und Gut Schuss!\n\nSportliche Grüsse\nSportschützen Muhen',
      notice: 'Bitte begleiche den Betrag bis zum Kursstart / innert 30 Tagen.',
      mail_subject: 'Rechnung {rechnungsnummer} – Schulsport | Sportschützen Muhen',
      mail_body: 'Hallo {vorname},\n\nanbei erhältst du die Rechnung für deine Teilnahme am Schulsportkurs der Sportschützen Muhen.\n\nBetrag: CHF {gesamtbetrag}\n\nDer QR-Zahlteil befindet sich im Anhang.\n\nViele Grüsse\nSportschützen Muhen'
    },
    'Sponsoring': {
      type: 'Sponsoring',
      title: 'Rechnung – Sponsoring & Gönnerbeitrag',
      intro: 'Sehr geehrte Damen und Herren, geschätzte Gönner,\n\nim Namen des gesamten Vereins danken wir Ihnen herzlich für Ihre wertvolle Unterstützung als Sponsor / Gönner der Sportschützen Muhen.',
      outro: 'Dank Ihres Beitrags können wir die Nachwuchsförderung und den Schiesssport in Muhen nachhaltig sichern.\n\nMit besten Grüssen\nSportschützen Muhen',
      notice: 'Zahlbar innert 30 Tagen. QR-Zahlteil untenstehend.',
      mail_subject: 'Sponsoring & Gönnerbeitrag {rechnungsjahr} | Sportschützen Muhen',
      mail_body: 'Sehr geehrte Damen und Herren,\n\nherzlichen Dank für Ihre Zusage zur Unterstützung der Sportschützen Muhen.\n\nAnbei senden wir Ihnen die entsprechende Rechnung (CHF {gesamtbetrag}) inkl. QR-Einzahlungsschein.\n\nMit freundlichen Grüssen\nSportschützen Muhen'
    },
    'Sonstige': {
      type: 'Sonstige',
      title: 'Rechnung {rechnungsnummer}',
      intro: 'Guten Tag {vorname} {nachname},\n\nanbei senden wir Ihnen die Rechnung für die bezogenen Leistungen / Waren der Sportschützen Muhen.',
      outro: 'Vielen Dank für das Vertrauen.\n\nFreundliche Grüsse\nSportschützen Muhen',
      notice: 'Zahlbar innert 30 Tagen ohne Abzug.',
      mail_subject: 'Rechnung {rechnungsnummer} | Sportschützen Muhen',
      mail_body: 'Guten Tag {vorname} {nachname},\n\nanbei erhalten Sie die Rechnung {rechnungsnummer} über CHF {gesamtbetrag}.\n\nDen QR-Zahlteil finden Sie im PDF-Anhang.\n\nFreundliche Grüsse\nSportschützen Muhen'
    },
    'Mahnung': {
      type: 'Mahnung',
      title: 'Zahlungserinnerung / Mahnung zur Rechnung {rechnungsnummer}',
      intro: 'Sehr geehrte Damen und Herren, lieber {vorname},\n\nbei der Überprüfung unserer Buchhaltung haben wir festgestellt, dass für untenstehende Rechnung noch kein Zahlungseingang verzeichnet werden konnte. Wir bitten dich höflich, den Betrag baldmöglichst zu begleichen.',
      outro: 'Falls sich deine Zahlung mit diesem Schreiben gekreuzt hat, betrachte diese Erinnerung bitte als gegenstandslos. Vielen Dank.\n\nMit freundlichen Grüssen\nSportschützen Muhen',
      notice: 'Zahlbar innert 10 Tagen. Den QR-Zahlteil findest du untenstehend.',
      mail_subject: 'Zahlungserinnerung Rechnung {rechnungsnummer} | Sportschützen Muhen',
      mail_body: 'Guten Tag {vorname} {nachname},\n\nfür untenstehende Rechnung konnten wir bis heute noch keinen Zahlungseingang feststellen:\n\nRechnungsnummer: {rechnungsnummer}\nAusstehender Betrag: CHF {gesamtbetrag}\n\nWir bitten Sie höflich, die Überweisung innert 10 Tagen vorzunehmen. Den QR-Einzahlungsschein finden Sie im angehängten PDF.\n\nFalls die Zahlung bereits erfolgt ist, danken wir Ihnen und bitten Sie, dieses Schreiben zu entschuldigen.\n\nFreundliche Grüsse\nSportschützen Muhen'
    }
  };
};

// UI Rendering für den Layout-Tab
window.renderTabLayouts = function(content) {
  if (!content) return;

  if (!window._invoiceLayouts || Object.keys(window._invoiceLayouts).length === 0) {
    window._invoiceLayouts = window.rnGetDefaultLayouts();
    try {
      const stored = localStorage.getItem('portal_invoice_layouts');
      if (stored) {
        window._invoiceLayouts = { ...window.rnGetDefaultLayouts(), ...JSON.parse(stored) };
      }
    } catch (_) {}
  }

  const currentType = window._rechnungenSelectedLayoutType || 'Jahresbeitrag';
  const layout = window._invoiceLayouts[currentType] || window.rnGetDefaultLayouts()[currentType] || window.rnGetDefaultLayouts()['Sonstige'];

  const types = [
    { key: 'Jahresbeitrag', label: 'Jahresbeitrag', icon: 'fa-id-card' },
    { key: 'Vermietung', label: 'Vermietung', icon: 'fa-home' },
    { key: 'Schulsport', label: 'Schulsport', icon: 'fa-bullseye' },
    { key: 'Sponsoring', label: 'Sponsoring / Gönner', icon: 'fa-handshake' },
    { key: 'Sonstige', label: 'Sonstige / Diverse', icon: 'fa-file-alt' },
    { key: 'Mahnung', label: 'Mahnung / Erinnerung', icon: 'fa-exclamation-triangle' }
  ];

  const navTabsHtml = types.map(t => `
    <button class="btn btn-sm ${currentType === t.key ? 'btn-primary fw-bold' : 'btn-outline-secondary'}" onclick="rnSelectLayoutType('${t.key}')">
      <i class="fas ${t.icon} me-1.5"></i> ${t.label}
    </button>
  `).join('');

  content.innerHTML = `
    <div class="card border border-light shadow-sm p-4 rounded-4 mb-4">
      <div class="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
        <div>
          <h4 class="fw-bold text-primary mb-1"><i class="fas fa-sliders-h me-2"></i>Rechnungslayout & Textbausteine verwalten</h4>
          <p class="text-muted small mb-0">
            Passen Sie Anschreiben, Titel, Dankesworte und E-Mail-Texte für jeden Rechnungstyp individuell an.
          </p>
        </div>
        <button class="btn btn-sm btn-outline-secondary" onclick="rnResetLayoutToDefault('${currentType}')" title="Standard-Texte für diesen Typ wiederherstellen">
          <i class="fas fa-undo me-1"></i> Standard wiederherstellen
        </button>
      </div>

      <!-- Rechnungstyp Selector -->
      <div class="d-flex gap-2 mb-4 flex-wrap pb-3 border-bottom">
        ${navTabsHtml}
      </div>

      <div class="row g-4">
        <!-- Linke Spalte: Editor Formular -->
        <div class="col-lg-7">
          <form id="rn-layout-form" onsubmit="rnSaveLayout(event, '${currentType}')">
            
            <!-- Shortcodes Helper Bar -->
            <div class="bg-light p-3 rounded-3 mb-4 border">
              <label class="form-label fw-bold small text-primary mb-1.5"><i class="fas fa-code me-1"></i>Verfügbare Platzhalter (Klicken zum Einfügen)</label>
              <div class="d-flex gap-1.5 flex-wrap">
                <button type="button" class="btn btn-xs btn-white border shadow-xs text-dark" onclick="rnInsertShortcode('{vorname}')">{vorname}</button>
                <button type="button" class="btn btn-xs btn-white border shadow-xs text-dark" onclick="rnInsertShortcode('{nachname}')">{nachname}</button>
                <button type="button" class="btn btn-xs btn-white border shadow-xs text-dark" onclick="rnInsertShortcode('{rechnungsnummer}')">{rechnungsnummer}</button>
                <button type="button" class="btn btn-xs btn-white border shadow-xs text-dark" onclick="rnInsertShortcode('{rechnungsjahr}')">{rechnungsjahr}</button>
                <button type="button" class="btn btn-xs btn-white border shadow-xs text-dark" onclick="rnInsertShortcode('{gesamtbetrag}')">{gesamtbetrag}</button>
                <button type="button" class="btn btn-xs btn-white border shadow-xs text-dark" onclick="rnInsertShortcode('{rechnungsdatum}')">{rechnungsdatum}</button>
                <button type="button" class="btn btn-xs btn-white border shadow-xs text-dark" onclick="rnInsertShortcode('{iban}')">{iban}</button>
              </div>
            </div>

            <!-- Brief-Kopf & Titel -->
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Rechnungstitel / Betreffzeile (PDF)</label>
              <input type="text" class="form-control fw-bold text-primary" id="rnl-title" required value="${escapeHtml(layout.title || '')}" oninput="rnUpdateLayoutPreview()">
            </div>

            <!-- Einleitungstext -->
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Einleitungstext (vor den Positionen)</label>
              <textarea class="form-control" id="rnl-intro" rows="4" required oninput="rnUpdateLayoutPreview()">${escapeHtml(layout.intro || '')}</textarea>
            </div>

            <!-- Schlusstext -->
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">Schlusstext & Dankesworte (nach den Positionen)</label>
              <textarea class="form-control" id="rnl-outro" rows="3" required oninput="rnUpdateLayoutPreview()">${escapeHtml(layout.outro || '')}</textarea>
            </div>

            <!-- Zahlungsziel & Hinweise -->
            <div class="mb-4">
              <label class="form-label fw-bold small text-muted">Zahlungsziel & Fußzeilen-Hinweis</label>
              <input type="text" class="form-control" id="rnl-notice" value="${escapeHtml(layout.notice || '')}" oninput="rnUpdateLayoutPreview()">
            </div>

            <hr class="my-4">
            <h6 class="fw-bold text-primary mb-3"><i class="fas fa-envelope me-1.5"></i>E-Mail Versand-Vorlage</h6>

            <!-- E-Mail Betreff -->
            <div class="mb-3">
              <label class="form-label fw-bold small text-muted">E-Mail Betreffzeile</label>
              <input type="text" class="form-control fw-semibold" id="rnl-mail-subject" value="${escapeHtml(layout.mail_subject || '')}" oninput="rnUpdateLayoutPreview()">
            </div>

            <!-- E-Mail Text -->
            <div class="mb-4">
              <label class="form-label fw-bold small text-muted">E-Mail Nachrichtentext</label>
              <textarea class="form-control font-monospace" id="rnl-mail-body" rows="5" oninput="rnUpdateLayoutPreview()">${escapeHtml(layout.mail_body || '')}</textarea>
            </div>

            <div class="d-grid">
              <button type="submit" class="btn btn-primary py-2.5 fw-bold rounded-3 shadow-sm write-protected" id="rnl-submit-btn">
                <i class="fas fa-save me-1.5"></i> Layout für '${currentType}' speichern
              </button>
            </div>
          </form>
        </div>

        <!-- Rechte Spalte: Interactive Live Preview -->
        <div class="col-lg-5">
          <div class="sticky-top" style="top: 20px;">
            <div class="d-flex justify-content-between align-items-center mb-2">
              <span class="fw-bold small text-muted text-uppercase tracking-wider"><i class="fas fa-eye me-1"></i> Live-Vorschau (DIN A4 PDF)</span>
              <span class="badge bg-light text-dark border small">Beispieldaten</span>
            </div>

            <!-- Vorschau Karte in Papier-Optik -->
            <div class="card border shadow-sm p-4 bg-white rounded-3 font-sans-serif" style="min-height: 480px; font-size: 11px; line-height: 1.5; color: #212529;">
              <!-- Header Absender & LOGO -->
              <div class="d-flex justify-content-between align-items-start border-bottom pb-2 mb-3">
                <div>
                  <strong class="text-primary fs-6">Sportschützen Muhen</strong><br>
                  <span class="text-muted" style="font-size: 10px;">Postfach 12 &middot; 5037 Muhen &middot; sportschuetzen.muhen@gmail.com</span>
                </div>
                <div class="badge bg-primary-subtle text-primary fw-bold" style="font-size: 9px;">PDF PREVIEW</div>
              </div>

              <!-- Empfänger Adresse Block -->
              <div class="mb-3 p-2 bg-light rounded border border-light" style="max-width: 220px;">
                <strong>Max Muster</strong><br>
                Hauptstrasse 42<br>
                5037 Muhen
              </div>

              <!-- Datum & Rechnungs-Titel -->
              <div class="text-end text-muted small mb-2">Muhen, ${new Date().toLocaleDateString('de-CH')}</div>
              <h6 class="fw-bold text-dark mb-2" id="prev-title" style="font-size: 13px;">...</h6>

              <!-- Einleitungstext -->
              <div class="mb-3 text-secondary text-break" id="prev-intro" style="white-space: pre-line;">...</div>

              <!-- Beispiel Positionstabelle -->
              <table class="table table-sm table-bordered my-2" style="font-size: 10px;">
                <thead class="table-light">
                  <tr>
                    <th>Pos</th>
                    <th>Beschreibung</th>
                    <th class="text-end">Betrag</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>Beispiel-Leistung / Jahresbeitrag 2026</td>
                    <td class="text-end fw-bold">CHF 150.00</td>
                  </tr>
                </tbody>
              </table>

              <!-- Schlusstext -->
              <div class="mt-2 text-secondary text-break" id="prev-outro" style="white-space: pre-line;">...</div>

              <!-- Hinweis & Schweizer QR-Zahlteil Simulator -->
              <div class="mt-auto pt-3 border-top">
                <div class="text-muted mb-2" id="prev-notice" style="font-size: 9.5px; font-style: italic;">...</div>
                
                <div class="p-2 bg-light border rounded text-center d-flex align-items-center justify-content-between">
                  <div class="text-start">
                    <strong style="font-size:9px;">QR-Zahlteil (Schweizer Standard)</strong><br>
                    <span class="text-muted font-monospace" style="font-size:8px;">Konto: CH06 8080 8003 6331 3189 2</span>
                  </div>
                  <div class="bg-dark text-white rounded p-1 font-monospace" style="font-size:8px;">
                    <i class="fas fa-qrcode fa-2x"></i>
                  </div>
                </div>
              </div>
            </div>

            <!-- E-Mail Vorschau Karte -->
            <div class="card border shadow-sm p-3 bg-light rounded-3 mt-3" style="font-size: 11px;">
              <div class="fw-bold text-muted mb-1"><i class="fas fa-envelope-open me-1"></i> E-Mail Vorschau</div>
              <div class="bg-white p-2 border rounded">
                <div><strong class="text-muted">Betreff:</strong> <span id="prev-mail-subject" class="fw-bold text-dark">...</span></div>
                <hr class="my-1.5">
                <div id="prev-mail-body" class="text-secondary font-monospace" style="white-space: pre-line; font-size: 10px;">...</div>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  `;

  rnUpdateLayoutPreview();
};

window.rnSelectLayoutType = function(type) {
  window._rechnungenSelectedLayoutType = type;
  const content = document.getElementById('rn-tab-content-container');
  if (content) window.renderTabLayouts(content);
};

window.rnUpdateLayoutPreview = function() {
  const title = document.getElementById('rnl-title') ? document.getElementById('rnl-title').value : '';
  const intro = document.getElementById('rnl-intro') ? document.getElementById('rnl-intro').value : '';
  const outro = document.getElementById('rnl-outro') ? document.getElementById('rnl-outro').value : '';
  const notice = document.getElementById('rnl-notice') ? document.getElementById('rnl-notice').value : '';
  const mailSubj = document.getElementById('rnl-mail-subject') ? document.getElementById('rnl-mail-subject').value : '';
  const mailBody = document.getElementById('rnl-mail-body') ? document.getElementById('rnl-mail-body').value : '';

  const replaceVars = (text) => {
    return String(text || '')
      .replace(/{vorname}/g, 'Max')
      .replace(/{nachname}/g, 'Muster')
      .replace(/{rechnungsnummer}/g, 'INV-2026-1001')
      .replace(/{rechnungsjahr}/g, '2026')
      .replace(/{gesamtbetrag}/g, '150.00')
      .replace(/{rechnungsdatum}/g, new Date().toLocaleDateString('de-CH'))
      .replace(/{iban}/g, 'CH06 8080 8003 6331 3189 2');
  };

  const prevTitle = document.getElementById('prev-title');
  const prevIntro = document.getElementById('prev-intro');
  const prevOutro = document.getElementById('prev-outro');
  const prevNotice = document.getElementById('prev-notice');
  const prevMailSubj = document.getElementById('prev-mail-subject');
  const prevMailBody = document.getElementById('prev-mail-body');

  if (prevTitle) prevTitle.textContent = replaceVars(title);
  if (prevIntro) prevIntro.textContent = replaceVars(intro);
  if (prevOutro) prevOutro.textContent = replaceVars(outro);
  if (prevNotice) prevNotice.textContent = replaceVars(notice);
  if (prevMailSubj) prevMailSubj.textContent = replaceVars(mailSubj);
  if (prevMailBody) prevMailBody.textContent = replaceVars(mailBody);
};

window.rnInsertShortcode = function(code) {
  let activeEl = document.activeElement;
  if (!activeEl || (activeEl.tagName !== 'INPUT' && activeEl.tagName !== 'TEXTAREA')) {
    activeEl = document.getElementById('rnl-intro');
  }
  if (activeEl) {
    const start = activeEl.selectionStart || 0;
    const end = activeEl.selectionEnd || 0;
    const val = activeEl.value;
    activeEl.value = val.substring(0, start) + code + val.substring(end);
    activeEl.focus();
    activeEl.selectionStart = activeEl.selectionEnd = start + code.length;
    rnUpdateLayoutPreview();
  }
};

window.rnResetLayoutToDefault = function(type) {
  if (!confirm(`⚠️ Möchtest du die Texte für '${type}' wirklich auf die Standardvorlage zurücksetzen?`)) return;
  const defaults = window.rnGetDefaultLayouts()[type];
  if (defaults) {
    window._invoiceLayouts[type] = { ...defaults };
    try {
      localStorage.setItem('portal_invoice_layouts', JSON.stringify(window._invoiceLayouts));
    } catch (_) {}
    const content = document.getElementById('rn-tab-content-container');
    if (content) window.renderTabLayouts(content);
    showSuccess(`🎉 Texte für '${type}' auf Standard zurückgesetzt.`);
  }
};

window.rnSaveLayout = async function(event, type) {
  event.preventDefault();

  const title = document.getElementById('rnl-title').value.trim();
  const intro = document.getElementById('rnl-intro').value.trim();
  const outro = document.getElementById('rnl-outro').value.trim();
  const notice = document.getElementById('rnl-notice').value.trim();
  const mail_subject = document.getElementById('rnl-mail-subject').value.trim();
  const mail_body = document.getElementById('rnl-mail-body').value.trim();

  const layoutData = {
    type: type,
    title: title,
    intro: intro,
    outro: outro,
    notice: notice,
    mail_subject: mail_subject,
    mail_body: mail_body
  };

  if (!window._invoiceLayouts) window._invoiceLayouts = {};
  window._invoiceLayouts[type] = layoutData;

  // LocalStorage Fallback
  try {
    localStorage.setItem('portal_invoice_layouts', JSON.stringify(window._invoiceLayouts));
  } catch (_) {}

  const submitBtn = document.getElementById('rnl-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span> Speichere Layout...';
  }

  try {
    const response = await apiFetch('rechnungen', {
      action: 'saveLayout',
      layout: layoutData
    }, 'POST');
    const result = await response.json();

    if (result.success) {
      showSuccess(`🎉 Layout & Texte für '${type}' erfolgreich gespeichert!`);
    } else {
      throw new Error(result.error || "GAS returned success false");
    }
  } catch (err) {
    console.warn("⚠️ Fehler beim Speichern des Layouts auf dem Server, verwende LocalStorage Fallback:", err);
    showSuccess(`🎉 Layout & Texte für '${type}' lokal gespeichert!`);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.innerHTML = `<i class="fas fa-save me-1.5"></i> Layout für '${type}' speichern`;
    }
  }
};
