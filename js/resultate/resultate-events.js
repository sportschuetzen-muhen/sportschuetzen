// =========================================================
//  RESULTATE (Grenzland) - Events & Input Handlers
// =========================================================

function onPointsInputEvent(e) {
  const el = e.target;
  const rowIndex = parseInt(el.dataset.row, 10);
  const roundKey = el.dataset.round;
  const r = resultateState.rows[rowIndex];
  const p1Field = `${roundKey}_p1`;

  // Nur Ziffern, aber cursor/focus behalten: wir ändern value nur wenn nötig
  const raw = String(el.value || "");
  const cleaned = raw.replace(/[^\d]/g, "");
  if (cleaned !== raw) el.value = cleaned;

  r[p1Field] = cleaned;
  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen", true);

  // nur dieses Feld validieren
  if (cleaned === "" || isValidPoints(cleaned)) el.classList.remove("is-invalid");
  else el.classList.add("is-invalid");
}

function onTeamChangeEvent(e) {
  const el = e.target;
  const rowIndex = parseInt(el.dataset.row, 10);
  const roundKey = el.dataset.round;
  const newTeam = String(el.value || "");

  const r = resultateState.rows[rowIndex];
  const teamField = `${roundKey}_team`;

  const prevTeam = (r[teamField] || "") || POOL_LABEL;

  // Pool immer erlaubt (und wird beim Save zu "")
  // Limit: >4 sperren, Pool ausgenommen
  if (newTeam !== POOL_LABEL) {
    const count = countTeamAssignments(roundKey, newTeam, rowIndex);
    if (count >= TEAM_LIMIT) {
      alert(`Team "${newTeam}" hat in ${roundLabel(roundKey)} bereits ${TEAM_LIMIT} Zuteilungen. Bitte Pool oder anderes Team wählen.`);
      // revert
      el.value = prevTeam;
      return;
    }
  }

  // set
  r[teamField] = (newTeam === POOL_LABEL) ? "" : newTeam;

  // auto-flags
  if (roundKey === "r2") r._autoR2 = false;
  if (roundKey === "r3") r._autoR3 = false;

  // Vererbung bei Änderungen (nur wenn auto)
  if (roundKey === "r1") {
    if (r._autoR2) {
      if (r.r1_team !== "" && countTeamAssignments("r2", r.r1_team, rowIndex) >= TEAM_LIMIT) {
        r._autoR2 = false; // Ziel voll, breche R2-Vererbung ab
      } else {
        r.r2_team = r.r1_team;
        if (r._autoR3) {
          if (r.r2_team !== "" && countTeamAssignments("r3", r.r2_team, rowIndex) >= TEAM_LIMIT) {
            r._autoR3 = false; // Ziel voll, breche R3-Vererbung ab
          } else {
            r.r3_team = r.r2_team;
          }
        }
      }
    }
  }
  if (roundKey === "r2") {
    if (r._autoR3) {
      if (r.r2_team !== "" && countTeamAssignments("r3", r.r2_team, rowIndex) >= TEAM_LIMIT) {
        r._autoR3 = false; // Ziel voll, breche R3-Vererbung ab
      } else {
        r.r3_team = r.r2_team;
      }
    }
  }

  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen", true);

  // Weil Cards nach Team gruppieren: nach Team-Wechsel müssen wir neu rendern (aber nur nach Dropdown, nicht bei Punkte)
  renderRounds();
}

function countTeamAssignments(roundKey, teamName, excludeRowIndex) {
  let c = 0;
  const field = `${roundKey}_team`;
  for (let i = 0; i < resultateState.rows.length; i++) {
    if (i === excludeRowIndex) continue;
    const t = (resultateState.rows[i][field] || "") || "";
    if (t === teamName) c++;
  }
  return c;
}

function roundLabel(roundKey) {
  if (roundKey === "r1") return "Runde 1";
  if (roundKey === "r2") return "Runde 2";
  return "Runde 3";
}

function confirmAddSelectedMember() {
  const sel = document.getElementById("new-member-select");
  const roundSel = document.getElementById("new-start-round");
  const teamSel = document.getElementById("new-start-team");

  const memberId = sel ? String(sel.value || "") : "";
  const startRound = roundSel ? String(roundSel.value || "r1") : "r1";
  const startTeamUi = teamSel ? String(teamSel.value || "") : "";

  if (!memberId) return alert("Bitte zuerst ein Mitglied wählen.");
  if (!startTeamUi) return alert("Bitte Start-Team wählen.");

  const member = resultateState.members.find(m => String(m.id) === memberId);
  if (!member) return alert("Mitglied nicht gefunden.");

  const name = `${member.nachname} ${member.vorname}`.trim();
  const teamValue = (startTeamUi === POOL_LABEL) ? "" : startTeamUi;

  const newRow = normalizeRow({ id: memberId, name });

  // Alles vor Start-Runde = Pool (leer)
  newRow.r1_team = "";
  newRow.r2_team = "";
  newRow.r3_team = "";

  // Setze Start-Runde Team explizit
  if (startRound === "r1") {
    newRow.r1_team = teamValue;
    newRow.r2_team = teamValue;
    newRow.r3_team = teamValue;
    newRow._autoR2 = true;
    newRow._autoR3 = true;
  }

  if (startRound === "r2") {
    newRow.r2_team = teamValue;
    newRow.r3_team = teamValue;
    newRow._autoR2 = false; // manuell gesetzt
    newRow._autoR3 = true;  // r3 darf erben
  }

  if (startRound === "r3") {
    newRow.r3_team = teamValue;
    newRow._autoR2 = false;
    newRow._autoR3 = false;
  }

  // Limit-Check für die gewählte Runde/Team (Pool ausgenommen)
  if (teamValue) {
    const cnt = countTeamAssignments(startRound, teamValue, -1);
    if (cnt >= TEAM_LIMIT) {
      return alert(`Team "${teamValue}" hat in ${roundLabel(startRound)} bereits ${TEAM_LIMIT} Zuteilungen. Bitte Pool oder anderes Team wählen.`);
    }
  }

  resultateState.rows.push(newRow);
  resultateState.isDirty = true;

  renderUI();
  sel.value = "";
}

// =========================================================
//  RESULTATE (Grenzland) - KI OCR Event Handlers
// =========================================================

window._ocrBase64Data = null;

function openResultateOcrModal() {
  resetOcrModal();
  const modalEl = document.getElementById("resultate-ocr-modal");
  if (modalEl) {
    const modal = new bootstrap.Modal(modalEl);
    modal.show();

    // Dynamisch verfügbare Modelle laden
    const modelSelect = document.getElementById("ocr-model");
    const modelDesc = document.getElementById("ocr-model-desc");
    if (modelSelect && typeof window.initDynamicModels === 'function') {
      window.initDynamicModels(modelSelect, modelDesc, 'gemini-2.5-flash', 'resultate');
    }

    if (modelSelect && modelDesc) {
      modelSelect.addEventListener('change', () => {
        const selectedOption = modelSelect.options[modelSelect.selectedIndex];
        const info = selectedOption.getAttribute('data-info') || '';
        modelDesc.textContent = info;
      });
    }

    // Setup drag and drop
    const dropzone = document.getElementById("ocr-dropzone");
    if (dropzone) {
      // Prevent defaults
      ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, preventDefaults, false);
      });
      function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
      }

      // Highlighting
      ['dragenter', 'dragover'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.add('bg-secondary', 'bg-opacity-10'), false);
      });
      ['dragleave', 'drop'].forEach(eventName => {
        dropzone.addEventListener(eventName, () => dropzone.classList.remove('bg-secondary', 'bg-opacity-10'), false);
      });

      // Drop handler
      dropzone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        const files = dt.files;
        if (files && files.length > 0) {
          handleOcrFile(files[0]);
        }
      }, false);
    }
  }
}

function onOcrFileSelected(e) {
  if (e.target.files && e.target.files.length > 0) {
    handleOcrFile(e.target.files[0]);
  }
}

function handleOcrFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    alert("Bitte nur Bilddateien auswählen.");
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    window._ocrBase64Data = e.target.result;
    
    // Preview
    const imgPreview = document.getElementById("ocr-image-preview");
    const container = document.getElementById("ocr-preview-container");
    if (imgPreview && container) {
      imgPreview.src = window._ocrBase64Data;
      container.classList.remove("d-none");
    }

    // Enable button
    const btn = document.getElementById("btn-start-ocr");
    if (btn) btn.disabled = false;
  };
  reader.readAsDataURL(file);
}

async function startOcrAnalysis() {
  if (!window._ocrBase64Data) return;

  const roundSel = document.getElementById("ocr-target-round");
  const round = roundSel ? roundSel.value : "r1";

  const modelSel = document.getElementById("ocr-model");
  const model = modelSel ? modelSel.value : "gemini-2.5-flash";

  // Active shooters
  const shooters = resultateState.rows.map(r => ({
    id: r.id,
    name: r.name
  }));

  if (shooters.length === 0) {
    alert("Keine Schützen in der Tabelle vorhanden. Bitte zuerst Schützen aus Setup laden oder hinzufügen.");
    return;
  }

  // Verberge vorherigen Fehler
  const errAlert = document.getElementById("ocr-error-alert");
  if (errAlert) errAlert.classList.add("d-none");

  // Switch steps
  document.getElementById("ocr-step-upload").classList.add("d-none");
  document.getElementById("ocr-step-loading").classList.remove("d-none");

  try {
    const res = await apiFetch("resultate", "action=ocr", {
      method: "POST",
      body: JSON.stringify({
        image: window._ocrBase64Data,
        shooters: shooters,
        round: round,
        model: model
      })
    });
    
    const data = await res.json();
    if (!data.success) {
      throw new Error(data.error || "Unerwarteter Fehler bei der Bilderkennung.");
    }

    renderOcrResults(data.ergebnisse, round);
  } catch (err) {
    console.error(err);
    
    // Zurück zum Upload-Schritt wechseln (Foto bleibt erhalten!)
    document.getElementById("ocr-step-loading").classList.add("d-none");
    document.getElementById("ocr-step-upload").classList.remove("d-none");

    // Fehler verständlich übersetzen
    let userMsg = err.message;
    if (err.message.includes("503") || err.message.toLowerCase().includes("busy") || err.message.toLowerCase().includes("unavailable") || err.message.includes("quota") || err.message.toLowerCase().includes("limit") || err.message.toLowerCase().includes("exhausted")) {
      const modelSel = document.getElementById("ocr-model");
      let alternatives = [];
      if (modelSel) {
        Array.from(modelSel.options).forEach(opt => {
          if (opt.value !== model) {
            // Hole Anzeigenamen (ohne evtl. Klammern am Ende)
            const cleanName = opt.text.split(" (")[0];
            alternatives.push(cleanName);
          }
        });
      }
      const altText = alternatives.length > 0 ? ` (z. B. ${alternatives.slice(0, 3).map(a => `'${a}'`).join(' oder ')})` : "";

      if (err.message.includes("503") || err.message.toLowerCase().includes("busy") || err.message.toLowerCase().includes("unavailable")) {
        userMsg = `Das gewählte Modell ist momentan überlastet (Fehler 503 / High Demand). Bitte wähle oben ein alternatives Modell${altText} und klicke erneut auf 'Resultate erkennen'.`;
      } else {
        userMsg = `Die Kapazitätsgrenze für das gewählte Modell ist erreicht. Bitte wähle ein alternatives Modell${altText} und versuche es erneut.`;
      }
    }

    const errText = document.getElementById("ocr-error-text");
    const errAlert = document.getElementById("ocr-error-alert");
    if (errText && errAlert) {
      errText.innerText = userMsg;
      errAlert.classList.remove("d-none");
    } else {
      alert("Fehler bei der Bildanalyse: " + userMsg);
    }
  }
}

function renderOcrResults(ergebnisse, round) {
  const tbody = document.getElementById("ocr-results-tbody");
  if (!tbody) return;

  tbody.innerHTML = "";

  // Map results by shooter id
  const resultsMap = new Map();
  (ergebnisse || []).forEach(item => {
    if (item.id) {
      resultsMap.set(String(item.id), item.points);
    }
  });

  if (resultsMap.size === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center text-muted p-4">Es wurden keine Schiessergebnisse im Bild erkannt, die den Schützen zugeordnet werden konnten.</td></tr>`;
  } else {
    // Show recognized shooters first, but list all shooters so the user can verify
    resultateState.rows.forEach(r => {
      const hasPoints = resultsMap.has(String(r.id));
      const detectedPoints = hasPoints ? resultsMap.get(String(r.id)) : "";
      const currentPoints = r[`${round}_p1`] || "—";
      
      const tr = document.createElement("tr");
      if (!hasPoints) {
        tr.className = "table-light opacity-50";
      }

      tr.innerHTML = `
        <td>
          <input type="checkbox" class="form-check-input ocr-apply-check" data-id="${escapeHtml(r.id)}" ${hasPoints ? "checked" : ""}>
        </td>
        <td class="fw-bold">${escapeHtml(r.name)}</td>
        <td>${escapeHtml(currentPoints)}</td>
        <td>
          <input type="number" class="form-control form-control-sm ocr-points-input" 
                 data-id="${escapeHtml(r.id)}" 
                 min="0" max="100" 
                 value="${escapeHtml(detectedPoints ?? "")}" 
                 style="max-width: 90px;"
                 placeholder="—">
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  // Switch step
  document.getElementById("ocr-step-loading").classList.add("d-none");
  document.getElementById("ocr-step-results").classList.remove("d-none");
}

function applyOcrResults() {
  const roundSel = document.getElementById("ocr-target-round");
  const round = roundSel ? roundSel.value : "r1";
  const p1Field = `${round}_p1`;

  const tbody = document.getElementById("ocr-results-tbody");
  if (!tbody) return;

  const rows = tbody.querySelectorAll("tr");
  let appliedCount = 0;

  rows.forEach(row => {
    const check = row.querySelector(".ocr-apply-check");
    const pointsInput = row.querySelector(".ocr-points-input");

    if (check && check.checked && pointsInput) {
      const id = check.dataset.id;
      const points = pointsInput.value.trim();

      // Find shooter in state
      const shooter = resultateState.rows.find(r => String(r.id) === String(id));
      if (shooter && (points === "" || isValidPoints(points))) {
        // Only update if points are valid or empty
        shooter[p1Field] = points;
        appliedCount++;
      }
    }
  });

  if (appliedCount > 0) {
    resultateState.isDirty = true;
    setStatus("Ungespeicherte Änderungen", true);
    
    // Re-render the UI rounds to show the newly entered points
    renderRounds();
    
    // Close modal
    const modalEl = document.getElementById("resultate-ocr-modal");
    if (modalEl) {
      const modal = bootstrap.Modal.getInstance(modalEl);
      if (modal) modal.hide();
    }
    
    alert(`✅ ${appliedCount} Resultate erfolgreich in das Formular übernommen. Bitte noch auf 'Speichern' klicken, um sie dauerhaft zu sichern.`);
  } else {
    alert("Keine Resultate übernommen.");
  }
}

function resetOcrModal() {
  window._ocrBase64Data = null;
  
  const fileInput = document.getElementById("ocr-file-input");
  if (fileInput) fileInput.value = "";

  const preview = document.getElementById("ocr-image-preview");
  if (preview) preview.src = "";

  const previewContainer = document.getElementById("ocr-preview-container");
  if (previewContainer) previewContainer.classList.add("d-none");

  const btn = document.getElementById("btn-start-ocr");
  if (btn) btn.disabled = true;

  // Reset error alert
  const errAlert = document.getElementById("ocr-error-alert");
  if (errAlert) errAlert.classList.add("d-none");

  // Reset steps visibility
  const stepUpload = document.getElementById("ocr-step-upload");
  const stepLoading = document.getElementById("ocr-step-loading");
  const stepResults = document.getElementById("ocr-step-results");

  if (stepUpload) stepUpload.classList.remove("d-none");
  if (stepLoading) stepLoading.classList.add("d-none");
  if (stepResults) stepResults.classList.add("d-none");
}
