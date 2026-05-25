// =========================================================
//  MODULE: MANAGER - MAIL
//  - E-Mail-Assistent, Empfängerliste & BCC-Gmail-Entwurf
// =========================================================

const mailWizard = {
    step: 1,
    recipientGroups: { grenzland: false, mannschaft: false, gruppe: false, allMembers: false },
    pdfAttachments: { grenzland: false, mannschaft: false, gruppe: false, none: true },
    excludedIds: new Set(),
    resolvedRecipients: [],
    cachedModules: { grenzland: null, mannschaft: null, gruppe: null }
};

async function openMailWizard() {
    mailWizard.step = 1;
    mailWizard.recipientGroups = { grenzland: false, mannschaft: false, gruppe: false, allMembers: false };
    mailWizard.recipientGroups[appState.activeModule] = true;
    mailWizard.pdfAttachments = { grenzland: false, mannschaft: false, gruppe: false, none: true };
    mailWizard.pdfAttachments[appState.activeModule] = true;
    mailWizard.pdfAttachments.none = false;
    mailWizard.excludedIds = new Set();
    mailWizard.resolvedRecipients = [];

    // Alle Module vorladen
    const allKeys = ['grenzland', 'mannschaft', 'gruppe'];
    const toLoad = allKeys.filter(k => !mailWizard.cachedModules[k]);
    if (toLoad.length > 0) {
        showMailModal();
        renderMailStep(); // zeigt Step 1 mit Ladestatus
        
        for (const key of toLoad) {
            try {
                await fetchContestDataForPdf(key);
                mailWizard.cachedModules[key] = {
                    teams: JSON.parse(JSON.stringify(appState.teams)),
                    pool:  JSON.parse(JSON.stringify(appState.pool))
                };
            } catch(e) {
                console.warn(`Modul ${key} konnte nicht geladen werden:`, e);
            }
        }

        // State wiederherstellen
        await loadContestData(appState.activeModule);
        renderMailStep();
        return;
    }
    showMailModal();
}

function showMailModal() {
    if (!document.getElementById('mailWizardModal')) {
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal fade" id="mailWizardModal" tabindex="-1">
              <div class="modal-dialog modal-lg modal-fullscreen-sm-down">
                <div class="modal-content">
                  <div class="modal-header bg-dark text-white">
                    <h5 class="modal-title"><i class="fas fa-paper-plane me-2"></i>Mail senden</h5>
                    <span class="badge bg-secondary ms-2" id="mail-step-badge">Schritt 1 / 4</span>
                    <button type="button" class="btn-close btn-close-white ms-auto" data-bs-dismiss="modal"></button>
                  </div>
                  <div class="modal-body" id="mail-wizard-body" style="min-height:260px;"></div>
                  <div class="modal-footer">
                    <button class="btn btn-secondary" id="mail-btn-back" onclick="mailWizardBack()">← Zurück</button>
                    <button class="btn btn-primary" id="mail-btn-next" onclick="mailWizardNext()">Weiter →</button>
                  </div>
                </div>
              </div>
            </div>
        `);
    }
    renderMailStep();
    bootstrap.Modal.getOrCreateInstance(document.getElementById('mailWizardModal')).show();
}

function renderMailStep() {
    const body = document.getElementById('mail-wizard-body');
    const badge = document.getElementById('mail-step-badge');
    const btnBack = document.getElementById('mail-btn-back');
    const btnNext = document.getElementById('mail-btn-next');
    if (!body) return;

    badge.textContent = `Schritt ${mailWizard.step} / 4`;
    btnBack.style.display = mailWizard.step === 1 ? 'none' : 'inline-block';
    btnNext.innerHTML = mailWizard.step === 4
        ? '<i class="fas fa-paper-plane"></i> Senden'
        : 'Weiter →';
    btnNext.className = mailWizard.step === 4
        ? 'btn btn-success fw-bold'
        : 'btn btn-primary';

    if (mailWizard.step === 1) {
        const moduleLabels = {
            grenzland:  '🛡️ Grenzland-Schützen (nur eingeteilt)',
            mannschaft: '👥 Mannschaft-Schützen (nur eingeteilt)',
            gruppe:     '🎯 Gruppe-Schützen (nur eingeteilt)'
        };
        body.innerHTML = `
            <h6 class="fw-bold mb-3">Empfänger-Gruppen</h6>
            ${Object.entries(moduleLabels).map(([key, label]) => {
                const cached = mailWizard.cachedModules[key];
                const count = cached ? cached.teams.reduce((s, t) => s + t.shooters.length, 0) : null;
                const badgeStr = cached
                    ? `<span class="badge bg-light text-dark border ms-2">${count} Schützen</span>`
                    : `<span class="badge bg-warning text-dark ms-2">nicht geladen</span>`;
                return `
                <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" id="rg_${key}"
                        ${mailWizard.recipientGroups[key] ? 'checked' : ''}
                        onchange="mailWizard.recipientGroups['${key}'] = this.checked">
                    <label class="form-check-label" for="rg_${key}">
                        ${label} ${badgeStr}
                    </label>
                </div>`;
            }).join('')}
            <div class="form-check mb-2">
                <input class="form-check-input" type="checkbox" id="rg_all"
                    ${mailWizard.recipientGroups.allMembers ? 'checked' : ''}
                    onchange="mailWizard.recipientGroups.allMembers = this.checked">
                <label class="form-check-label" for="rg_all">
                    👤 Alle Mitglieder (inkl. nicht eingeteilt)
                    <span class="badge bg-light text-dark border ms-2">${appState.members.length} Personen</span>
                </label>
            </div>
        `;
    }

    else if (mailWizard.step === 2) {
        body.innerHTML = `
            <h6 class="fw-bold mb-3">PDF-Anhänge</h6>
            ${['grenzland','mannschaft','gruppe'].map(key => {
                const labels = { grenzland: '📄 PDF Grenzland', mannschaft: '📄 PDF Mannschaft', gruppe: '📄 PDF Gruppe' };
                const cached = mailWizard.cachedModules[key];
                return `
                <div class="form-check mb-2">
                    <input class="form-check-input" type="checkbox" id="pa_${key}"
                        ${mailWizard.pdfAttachments[key] ? 'checked' : ''}
                        ${!cached ? 'disabled' : ''}
                        onchange="mailWizard.pdfAttachments['${key}'] = this.checked; mailWizard.pdfAttachments.none = false; document.getElementById('pa_none').checked=false;">
                    <label class="form-check-label ${!cached ? 'text-muted' : ''}" for="pa_${key}">
                        ${labels[key]} ${!cached ? '<span class="badge bg-warning text-dark ms-1">nicht geladen</span>' : ''}
                    </label>
                </div>`;
            }).join('')}
            <div class="form-check mt-3">
                <input class="form-check-input" type="radio" id="pa_none"
                    ${mailWizard.pdfAttachments.none ? 'checked' : ''}
                    onchange="mailWizard.pdfAttachments={grenzland:false,mannschaft:false,gruppe:false,none:true}">
                <label class="form-check-label" for="pa_none">Kein Anhang</label>
            </div>
        `;
    }

    else if (mailWizard.step === 3) {
        buildRecipientList();
        const list = mailWizard.resolvedRecipients;
        if (list.length === 0) {
            body.innerHTML = `<div class="alert alert-warning">Keine Empfänger mit E-Mail-Adresse gefunden.</div>`;
            return;
        }
        const sourceLabel = { grenzland: '🛡️', mannschaft: '👥', gruppe: '🎯', all: '👤' };
        body.innerHTML = `
            <h6 class="fw-bold mb-1">Empfänger ausschliessen</h6>
            <p class="text-muted small mb-3">${list.length} Empfänger gefunden – deaktiviere einzelne zum Ausschliessen.</p>
            <div style="max-height:350px; overflow-y:auto;">
            ${list.map(p => `
                <div class="form-check mb-1">
                    <input class="form-check-input" type="checkbox" id="ex_${p.id}"
                        ${mailWizard.excludedIds.has(p.id) ? '' : 'checked'}
                        onchange="if(!this.checked) mailWizard.excludedIds.add('${p.id}'); else mailWizard.excludedIds.delete('${p.id}');">
                    <label class="form-check-label small" for="ex_${p.id}">
                        ${sourceLabel[p.source] || ''} <strong>${escapeHtml(p.name)}</strong>
                        <span class="text-muted">${escapeHtml(p.email)}</span>
                    </label>
                </div>
            `).join('')}
            </div>
        `;
    }

    else if (mailWizard.step === 4) {
        const final = mailWizard.resolvedRecipients.filter(p => !mailWizard.excludedIds.has(p.id));
        const pdfs = Object.entries(mailWizard.pdfAttachments)
            .filter(([k, v]) => v && k !== 'none')
            .map(([k]) => k);
        body.innerHTML = `
            <h6 class="fw-bold mb-3">Zusammenfassung</h6>
            <div class="alert alert-light border">
                <div><i class="fas fa-users me-2 text-primary"></i><strong>${final.length}</strong> Empfänger</div>
                <div class="mt-2"><i class="fas fa-paperclip me-2 text-secondary"></i>
                    ${pdfs.length ? pdfs.map(k => `PDF ${k}`).join(', ') : 'Kein Anhang'}
                </div>
            </div>
            <p class="small text-muted">Die E-Mails werden als BCC-Entwurf in Gmail erstellt.</p>
        `;
    }
}

function mailWizardNext() {
    if (mailWizard.step === 4) {
        executeMailSend();
        return;
    }
    // Validierung Step 1
    if (mailWizard.step === 1) {
        const anySelected = Object.values(mailWizard.recipientGroups).some(v => v);
        if (!anySelected) { alert('Bitte mindestens eine Empfänger-Gruppe wählen.'); return; }
    }
    mailWizard.step++;
    renderMailStep();
}

function mailWizardBack() {
    if (mailWizard.step <= 1) return;
    if (mailWizard.step === 3) {
        mailWizard.excludedIds = new Set();
    }
    mailWizard.step--;
    renderMailStep();
}

function buildRecipientList() {
    const seen = new Set();
    mailWizard.resolvedRecipients = [];

    const addFromModule = (key) => {
        const cached = mailWizard.cachedModules[key];
        if (!cached) return;
        cached.teams.forEach(t => t.shooters.forEach(s => {
            if (!seen.has(s.id) && s.email) {
                seen.add(s.id);
                mailWizard.resolvedRecipients.push({ ...s, source: key });
            }
        }));
    };

    if (mailWizard.recipientGroups.grenzland)  addFromModule('grenzland');
    if (mailWizard.recipientGroups.mannschaft) addFromModule('mannschaft');
    if (mailWizard.recipientGroups.gruppe)     addFromModule('gruppe');
    if (mailWizard.recipientGroups.allMembers) {
        appState.members.forEach(m => {
            if (!seen.has(m.id) && m.email) {
                seen.add(m.id);
                mailWizard.resolvedRecipients.push({
                    id: m.id, name: `${m.nachname} ${m.vorname}`.trim(),
                    email: m.email, source: 'all'
                });
            }
        });
    }
}

async function executeMailSend() {
    const final = mailWizard.resolvedRecipients.filter(p => !mailWizard.excludedIds.has(p.id));

    console.log('[Mail] cachedModules Teams:', {
        grenzland:  mailWizard.cachedModules.grenzland?.teams?.map(t => t.name),
        mannschaft: mailWizard.cachedModules.mannschaft?.teams?.map(t => t.name),
        gruppe:     mailWizard.cachedModules.gruppe?.teams?.map(t => t.name)
    });
    console.log('[Mail] Empfänger:', final.map(p => p.email));
    console.log('[Mail] PDFs:', Object.entries(mailWizard.pdfAttachments).filter(([k,v])=>v&&k!=='none').map(([k])=>k));

    const mails = final.map(p => p.email).filter(Boolean);
    if (!mails.length) { alert('Keine Empfänger.'); return; }

    const btnNext = document.getElementById('mail-btn-next');
    btnNext.disabled = true;
    btnNext.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Sende…';

    try {
        const moduleNames = {
            grenzland: 'Grenzland Cup',
            mannschaft: 'Mannschafts-Meisterschaft',
            gruppe: 'Gruppen-Meisterschaft'
        };

        const selectedModules = Object.entries(mailWizard.recipientGroups)
            .filter(([k, v]) => v && k !== 'allMembers')
            .map(([k]) => moduleNames[k] || k);

        const subject = `Aufgebot ${selectedModules.join(' & ')}`;

        const pdfsToAttach = Object.entries(mailWizard.pdfAttachments)
            .filter(([k, v]) => v && k !== 'none')
            .map(([k]) => k);

        const attachments = [];
        for (const key of pdfsToAttach) {
            try {
                const { doc } = buildPdfDoc(key);
                const pdfBase64 = doc.output('datauristring').split(',')[1];
                const config = CONTEST_CONFIG[key];
                attachments.push({
                    pdfBase64,
                    fileName: `${config?.fileBase || key}.pdf`
                });
            } catch (err) {
                console.error(`PDF-Fehler für ${key}:`, err);
                throw new Error(`PDF konnte nicht generiert werden: ${key}`);
            }
        }

        const pdfList = pdfsToAttach.map(k => `• ${moduleNames[k]}`).join('\n');
        const bodyText = `Hallo\n\nIm Anhang findest du das Aufgebot für:\n${selectedModules.map(n => `• ${n}`).join('\n')}\n\n`
            + (pdfList ? `Angehängte PDFs:\n${pdfList}\n\n` : '')
            + `Freundliche Grüsse\nSportschützen Muhen`;

        const res = await apiFetch('manager', 'action=sendMail', {
            method: 'POST',
            body: JSON.stringify({
                recipients: mails,
                subject,
                mailBody: bodyText,
                attachments
            })
        });
        const data = JSON.parse(await res.text());
        if (data.error) throw new Error(data.error);

        bootstrap.Modal.getInstance(document.getElementById('mailWizardModal')).hide();
        showToast(`✅ Entwurf für ${mails.length} Empfänger erstellt!`, 'success');

    } catch (e) {
        alert('Fehler: ' + e.message);
    } finally {
        btnNext.disabled = false;
        btnNext.innerHTML = '<i class="fas fa-paper-plane"></i> Senden';
    }
}
