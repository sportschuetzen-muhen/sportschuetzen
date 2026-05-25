// === SUB-MODUL: UMFRAGEN & ANMELDUNGEN - AUSWERTUNG & GRUPPEN ===

async function selectEventForParticipants(eventId) {
    currentEventId = eventId;
    loadParticipantsIfEventSelected();
}

async function loadParticipantsIfEventSelected() {
    if(!currentEventId) return;
    const listDiv = document.getElementById('umfragen-teilnehmer-list');
    const mailBtn = document.getElementById('btn-umfragen-mail');
    if(!listDiv) return;

    const hasCache = window._umfragenParticipantsCache && window._umfragenParticipantsCache[currentEventId];
    if (!hasCache) {
        listDiv.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div> Lade Teilnehmer...`;
        if(mailBtn) mailBtn.disabled = true;
    }
    
    try {
        await ensureMembersLookup();

        let pData;
        if (hasCache) {
            console.log("⚡ loadParticipantsIfEventSelected: Verwende Cache...");
            pData = window._umfragenParticipantsCache[currentEventId];
        } else {
            const res = await apiFetch('umfragen', `action=getParticipants&eventid=${encodeURIComponent(currentEventId)}`);
            pData = await res.json();
            window._umfragenParticipantsCache = window._umfragenParticipantsCache || {};
            window._umfragenParticipantsCache[currentEventId] = pData;
        }
        // pData ist ein Array von {lizenz, name} (GAS liefert Lizenz + Name)
        pData.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de-CH'));
        
        eventParticipants = [];

        // Cross-Referenz Adresse
        let html = `<div class="table-responsive"><table class="table table-sm table-striped">
            <thead><tr><th>Lizenz</th><th>Name</th><th>Adresse (aus DB)</th><th>Begl.</th><th>Essen</th></tr></thead>
            <tbody>`;

        if(pData.length === 0) {
            html += `<tr><td colspan="5" class="text-center text-muted">Niemand hat sich bisher angemeldet.</td></tr>`;
        } else {
            pData.forEach(p => {
                let liz = String(p.lizenz || '').trim();
                if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
                
                let m = membersLookup[liz] || membersLookup[String(p.lizenz).trim()];
                
                let addrStr = "-";
                let emailStr = "";
                let nameVorname = p.name;

                let vorname = "";
                let nachname = "";
                let jahrgang = "–";
                let strasse = "";
                let plz = "";
                let ort = "";

                if(m) {
                    addrStr = `${m.Street || ''}, ${m.PostCode || ''} ${m.City || ''}`.trim();
                    if(addrStr === ',') addrStr = "-";
                    emailStr = m.PrimaryEmail || m.AdditionalEmail || "";
                    if(m.LastName && m.FirstName) nameVorname = `${m.LastName} ${m.FirstName}`;
                    
                    vorname = m.FirstName || "";
                    nachname = m.LastName || "";
                    jahrgang = m.BirthDate ? m.BirthDate.split('-')[0] : "–";
                    strasse = m.Street || "";
                    plz = m.PostCode || "";
                    ort = m.City || "";
                }

                // Für den E-Mail-Generator hinzufügen
                eventParticipants.push({
                    lizenz: liz,
                    name: nameVorname,
                    email: emailStr,
                    address: addrStr,
                    count: p.count,
                    essen: p.essen,
                    vorname: vorname,
                    nachname: nachname,
                    jahrgang: jahrgang,
                    strasse: strasse,
                    plz: plz,
                    ort: ort
                });

                html += `<tr>
                    <td><small class="text-muted">${escapeHtml(liz)}</small></td>
                    <td><b>${escapeHtml(nameVorname)}</b></td>
                    <td><small>${escapeHtml(addrStr)}</small></td>
                    <td>${p.count > 1 ? '<span class="badge bg-info text-dark">+'+(p.count-1)+'</span>' : '-'}</td>
                    <td>${p.essen > 0 ? '<span class="badge bg-success">'+p.essen+'</span>' : '-'}</td>
                </tr>`;
            });
        }
        
        html += `</tbody></table></div>`;
        listDiv.innerHTML = html;

        if(eventParticipants.length > 0) {
            if(mailBtn) mailBtn.disabled = false;
        }

    } catch(e) {
        listDiv.innerHTML = `<div class="text-danger">Fehler: ${escapeHtml(e.message)}</div>`;
    }
}

function generateMailForParticipants() {
    if(eventParticipants.length === 0) return;

    // Finde alle gültigen E-Mails
    const emails = eventParticipants.map(p => p.email).filter(e => e && e.trim() !== "");
    
    if(emails.length === 0) {
        alert("Keiner der Teilnehmer hat eine hinterlegte E-Mail-Adresse.");
        return;
    }

    const bcc = emails.join(",");
    const subject = encodeURIComponent("Infos zum Event");
    const body = encodeURIComponent("Hallo zusammen,\n\n");

    const mailmailto = `mailto:?bcc=${bcc}&subject=${subject}&body=${body}`;
    window.location.href = mailmailto;
}

async function selectEventForGroups(eventId) {
    currentGroupEventId = eventId;
    loadGroupsIfEventSelected();
}

async function loadGroupsIfEventSelected() {
    if(!currentGroupEventId) return;
    const container = document.getElementById('umfragen-gruppen-container');
    const mailBtn = document.getElementById('btn-generate-group-mail');
    if(!container) return;

    const hasCache = window._umfragenParticipantsCache && window._umfragenParticipantsCache[currentGroupEventId];
    if (!hasCache) {
        container.innerHTML = `<div class="spinner-border spinner-border-sm text-primary"></div> Lade Teilnehmer & bilde Gruppen...`;
        mailBtn.disabled = true;
    }

    try {
        await ensureMembersLookup();

        let pData;
        if (hasCache) {
            console.log("⚡ loadGroupsIfEventSelected: Verwende Cache...");
            pData = window._umfragenParticipantsCache[currentGroupEventId];
        } else {
            const res = await apiFetch('umfragen', `action=getParticipants&eventid=${encodeURIComponent(currentGroupEventId)}`);
            pData = await res.json();
            window._umfragenParticipantsCache = window._umfragenParticipantsCache || {};
            window._umfragenParticipantsCache[currentGroupEventId] = pData;
        }
        
        pData.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'de-CH'));
        currentGroupParticipants = [];

        pData.forEach(p => {
            let liz = String(p.lizenz || '').trim();
            if (liz.length <= 6 && liz.length > 0) liz = liz.padStart(6, '0');
            
            let m = membersLookup[liz] || membersLookup[String(p.lizenz).trim()];
            
            if(m) {
                // Nur Personen mit vollständigen Daten für die Gruppenanmeldung
                currentGroupParticipants.push({
                    lizenz: liz,
                    vorname: m.FirstName || '',
                    nachname: m.LastName || '',
                    jahrgang: m.BirthDate ? m.BirthDate.split('-')[0] : '–',
                    strasse: m.Street || '',
                    plz: m.PostCode || '',
                    ort: m.City || '',
                    name: `${m.LastName} ${m.FirstName}`
                });
            }
        });

        renderGroups(container, mailBtn);

    } catch(e) {
        container.innerHTML = `<div class="text-danger">Fehler: ${escapeHtml(e.message)}</div>`;
    }
}

function renderGroups(container, mailBtn) {
    if (currentGroupParticipants.length === 0) {
        container.innerHTML = `<div class="alert alert-info">Noch keine Anmeldungen für diesen Anlass vorhanden.</div>`;
        return;
    }

    mailBtn.disabled = false;

    // Gruppierung in 5er Blöcke
    const groups = [];
    for (let i = 0; i < currentGroupParticipants.length; i += 5) {
        groups.push(currentGroupParticipants.slice(i, i + 5));
    }

    let html = '';
    groups.forEach((group, idx) => {
        const isFull = group.length === 5;
        const groupName = `Muhen ${idx + 1}`;
        
        html += `
            <div class="card mb-3 border-0 shadow-sm">
                <div class="card-header ${isFull ? 'bg-primary text-white' : 'bg-warning text-dark'} py-2 d-flex justify-content-between align-items-center">
                    <span class="fw-bold">${groupName} ${!isFull ? '(Unvollständig)' : ''}</span>
                    <span class="badge bg-light text-dark">${group.length} / 5</span>
                </div>
                <div class="card-body p-0">
                    <table class="table table-sm table-hover mb-0">
                        <colgroup>
                            <col style="width: 20%;">
                            <col style="width: 40%;">
                            <col style="width: 15%;">
                            <col style="width: 25%;">
                        </colgroup>
                        <thead class="table-light small">
                            <tr>
                                <th>Lizenz</th>
                                <th>Name</th>
                                <th>Jahrgang</th>
                                <th>Ort</th>
                            </tr>
                        </thead>
                        <tbody class="small sortable-group-list">
                            ${group.map(p => `
                                <tr data-lizenz="${escapeHtml(p.lizenz)}" style="cursor: grab;">
                                    <td><i class="fa-solid fa-grip-vertical text-muted me-2"></i>${escapeHtml(p.lizenz)}</td>
                                    <td><b>${escapeHtml(p.name)}</b></td>
                                    <td>${escapeHtml(p.jahrgang)}</td>
                                    <td>${escapeHtml(p.ort)}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;

    // Drag & Drop für Gruppen initialisieren
    if (typeof Sortable !== 'undefined') {
        const lists = container.querySelectorAll('.sortable-group-list');
        lists.forEach(list => {
            new Sortable(list, {
                group: 'shared',
                animation: 150,
                handle: 'tr',
                onEnd: function () {
                    // Counter und Header updaten
                    const cards = container.querySelectorAll('.card');
                    cards.forEach((card, idx) => {
                        const rowCount = card.querySelectorAll('tbody tr').length;
                        const badge = card.querySelector('.badge');
                        if (badge) badge.innerText = `${rowCount} / 5`;
                        
                        const header = card.querySelector('.card-header');
                        const headerSpan = header.querySelector('.fw-bold');
                        const isFull = rowCount === 5;
                        const isOver = rowCount > 5;
                        
                        if (headerSpan) {
                            if (isOver) {
                                headerSpan.innerText = `Muhen ${idx + 1} (Zu viele!)`;
                            } else if (!isFull) {
                                headerSpan.innerText = `Muhen ${idx + 1} (Unvollständig)`;
                            } else {
                                headerSpan.innerText = `Muhen ${idx + 1}`;
                            }
                        }

                        if (isOver) {
                            header.classList.remove('bg-warning', 'bg-primary', 'text-dark', 'text-white');
                            header.classList.add('bg-danger', 'text-white');
                        } else if (isFull) {
                            header.classList.remove('bg-warning', 'bg-danger', 'text-dark', 'text-white');
                            header.classList.add('bg-primary', 'text-white');
                        } else {
                            header.classList.remove('bg-primary', 'bg-danger', 'text-white');
                            header.classList.add('bg-warning', 'text-dark');
                        }
                    });
                }
            });
        });
    }
}

async function generateGroupMail() {
    if (currentGroupParticipants.length === 0) return;

    if (!hasWriteAccess || !hasWriteAccess('umfragen')) {
        alert("Keine Berechtigung zum Mailversand");
        return;
    }

    const event = umfragenState.find(e => e.id === currentGroupEventId);
    const eventTitle = event ? event.title : "Schiessanlass";

    const senderName = window.currentUser || "Vorstand";
    const rolleExtern = localStorage.getItem('portal_rolle_extern') || "";

    // Gruppen aus dem DOM lesen (berücksichtigt Drag & Drop)
    const groups = [];
    const container = document.getElementById('umfragen-gruppen-container');
    if (container) {
        const cards = container.querySelectorAll('.card');
        cards.forEach(card => {
            const rows = card.querySelectorAll('tbody tr');
            if (rows.length > 0) {
                const group = [];
                rows.forEach(row => {
                    const liz = row.dataset.lizenz;
                    const p = currentGroupParticipants.find(x => x.lizenz === liz);
                    if (p) group.push(p);
                });
                groups.push(group);
            }
        });
    } else {
        // Fallback
        for (let i = 0; i < currentGroupParticipants.length; i += 5) {
            groups.push(currentGroupParticipants.slice(i, i + 5));
        }
    }

    // HTML generieren – modernes Layout mit Logo links
    let html = `
    <div style="font-family: Arial, sans-serif; font-size:14px; color:#333; max-width:700px;">

        <!-- HEADER: Logo links -->
        <div style="display:flex; align-items:center; margin-bottom:24px; padding-bottom:14px; border-bottom:2px solid #e9ecef;">
            <img src="https://sportschuetzen-muhen.github.io/sportschuetzen/icons/icon-512.png"
                 width="48" height="48"
                 style="border-radius:8px; margin-right:16px; flex-shrink:0;" />
            <div style="font-size:13px; color:#6c757d; line-height:1.4;">
                <span style="font-size:12px;">Gruppenanmeldung – ${eventTitle}</span>
            </div>
        </div>

        <p>Guten Tag</p>
        <p>Wir nehmen gerne teil an eurem Anlass <b>${eventTitle}</b>.</p>
        <p style="color:#555;">Ein allfälliger Gruppengewinn ist bitte mittels beiliegendem Einzahlungsschein zu begleichen.</p>
    `;

    groups.forEach((group, idx) => {
        const isFull = group.length === 5;
        const tnChar = isFull ? 'G' : 'E';
        
        html += `
        <div style="margin-top:25px;">
            ${isFull ? `<h3 style="margin-bottom:8px; color:#0d6efd;">Muhen ${idx + 1}</h3>` : `<h3 style="margin-bottom:8px; color:#6c757d;">Einzelschützen</h3>`}

            <table style="width:100%; border-collapse:collapse; font-size:13px;">
                <thead>
                    <tr style="background:#f1f3f5;">
                        <th style="border:1px solid #ddd; padding:6px;">TN</th>
                        <th style="border:1px solid #ddd; padding:6px;">Lizenz</th>
                        <th style="border:1px solid #ddd; padding:6px;">Name Vorname</th>
                        <th style="border:1px solid #ddd; padding:6px;">Jg</th>
                        <th style="border:1px solid #ddd; padding:6px;">Strasse</th>
                        <th style="border:1px solid #ddd; padding:6px;">PLZ Ort</th>
                    </tr>
                </thead>
                <tbody>
        `;

        group.forEach(p => {
            html += `
                <tr>
                    <td style="border:1px solid #ddd; padding:6px; text-align:center; font-weight:bold;">${tnChar}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.lizenz}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.nachname} ${p.vorname}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.jahrgang}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.strasse}</td>
                    <td style="border:1px solid #ddd; padding:6px;">${p.plz} ${p.ort}</td>
                </tr>
            `;
        });

        // leere Zeilen auffüllen → wichtig für saubere Tabelle
        for (let i = group.length; i < 5; i++) {
            html += `
                <tr>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                    <td style="border:1px solid #ddd; padding:6px;">&nbsp;</td>
                </tr>
            `;
        }

        html += `
                </tbody>
            </table>

            <div style="font-size:12px; margin-top:5px; color:#666;">
                G = Gruppenschütze &nbsp;&nbsp;|&nbsp;&nbsp; E = Einzelschütze
            </div>
        </div>
        `;
    });

    html += `
        <p style="margin-top:30px;">Besten Dank.</p>

        <p>
        Freundliche Grüsse<br><br>
        Sportschützen Muhen<br><br>
        ${senderName}
        ${rolleExtern ? `<br>${rolleExtern}` : ''}
        </p>
    </div>
    `;

    try {
        const res = await apiFetch('umfragen', '', {
            method: 'POST',
            body: JSON.stringify({
                action: "sendGroupMail",
                subject: `Gruppenanmeldung Sportschützen Muhen für ${eventTitle}`,
                html: html,
                attachmentFileId: "1vXxjiaj9zwjz8aW0-BJF6RBGZ00oRki0"
            })
        });

        const data = await res.json();
        if (data.error) {
            throw new Error(data.error);
        }

        alert("✅ " + (data.message || "Entwurf erfolgreich erstellt!"));
    } catch (e) {
        alert("Fehler beim Mailversand: " + e.message);
    }
}
