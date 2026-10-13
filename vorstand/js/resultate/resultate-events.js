// =========================================================
//  RESULTATE (Mannschaft & G & G) - Events & Input Handlers
// =========================================================

function onPointsInputEvent(e) {
  const el = e.target;
  const rowIndex = parseInt(el.dataset.row, 10);
  const roundKey = el.dataset.round;
  const part = el.dataset.part || "p1"; // "p1" oder "p2"
  const r = resultateState.rows[rowIndex];
  const field = `${roundKey}_${part}`;

  // Nur Ziffern, aber Cursor/Focus behalten
  const raw = String(el.value || "");
  const cleaned = raw.replace(/[^\d]/g, "");
  if (cleaned !== raw) el.value = cleaned;

  r[field] = cleaned;
  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen", true);
  if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState();

  // Feld validieren
  const contestType = window._resultateContestType || "grenzland";
  if (cleaned === "" || isValidPoints(cleaned, contestType)) {
    el.classList.remove("is-invalid");
  } else {
    el.classList.add("is-invalid");
  }

  // Bei Gruppe: Summen-Badge live aktualisieren
  if (contestType === "gruppe") {
    const sumEl = document.getElementById(`sum-${roundKey}-${rowIndex}`);
    if (sumEl) {
      const p1 = parseInt(r[`${roundKey}_p1`] || "0", 10) || 0;
      const p2 = parseInt(r[`${roundKey}_p2`] || "0", 10) || 0;
      sumEl.innerText = (p1 + p2 > 0) ? String(p1 + p2) : "–";
    }
  }
}

function onTeamChangeEvent(e) {
  const el = e.target;
  const rowIndex = parseInt(el.dataset.row, 10);
  const roundKey = el.dataset.round;
  const newTeam = String(el.value || "");

  const r = resultateState.rows[rowIndex];
  const teamField = `${roundKey}_team`;

  const prevTeam = (r[teamField] || "") || POOL_LABEL;
  const contestType = window._resultateContestType || "grenzland";
  const limit = getContestLimit(contestType);

  // Pool immer erlaubt (und wird beim Save zu "")
  // Limit prüfen
  if (newTeam !== POOL_LABEL) {
    const count = countTeamAssignments(roundKey, newTeam, rowIndex);
    if (count >= limit) {
      alert(`Team "${newTeam}" hat in ${roundLabel(roundKey)} bereits ${limit} Zuteilungen. Bitte Pool oder anderes Team wählen.`);
      el.value = prevTeam;
      return;
    }
  }

  // Zuweisung
  r[teamField] = (newTeam === POOL_LABEL) ? "" : newTeam;

  // Auto-Flags
  if (roundKey === "r2") r._autoR2 = false;
  if (roundKey === "r3") r._autoR3 = false;

  // Vererbung bei Änderungen (nur wenn auto und bei R1/R2)
  if (roundKey === "r1") {
    if (r._autoR2) {
      if (r.r1_team !== "" && countTeamAssignments("r2", r.r1_team, rowIndex) >= limit) {
        r._autoR2 = false;
      } else {
        r.r2_team = r.r1_team;
        if (r._autoR3) {
          if (r.r2_team !== "" && countTeamAssignments("r3", r.r2_team, rowIndex) >= limit) {
            r._autoR3 = false;
          } else {
            r.r3_team = r.r2_team;
          }
        }
      }
    }
  }
  if (roundKey === "r2") {
    if (r._autoR3) {
      if (r.r2_team !== "" && countTeamAssignments("r3", r.r2_team, rowIndex) >= limit) {
        r._autoR3 = false;
      } else {
        r.r3_team = r.r2_team;
      }
    }
  }

  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen", true);
  if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState();

  // Cards neu rendern nach Team-Wechsel
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
  const m = roundKey.match(/\d+/);
  return m ? `Runde ${m[0]}` : roundKey;
}

function confirmAddSelectedMember() {
  const sel = document.getElementById("new-member-select");
  const roundSel = document.getElementById("new-start-round");
  const teamSel = document.getElementById("new-start-team");
  const stellungSel = document.getElementById("new-start-stellung");

  const memberId = sel ? String(sel.value || "") : "";
  const startRound = roundSel ? String(roundSel.value || "r1") : "r1";
  const startTeamUi = teamSel ? String(teamSel.value || "") : "";
  const stellungVal = stellungSel ? String(stellungSel.value || "liegend") : "liegend";

  if (!memberId) return alert("Bitte zuerst ein Mitglied wählen.");
  if (!startTeamUi) return alert("Bitte Start-Team wählen.");

  const member = resultateState.members.find(m => String(m.id) === memberId);
  if (!member) return alert("Mitglied nicht gefunden.");

  const name = `${member.nachname} ${member.vorname}`.trim();
  const teamValue = (startTeamUi === POOL_LABEL) ? "" : startTeamUi;

  const newRow = normalizeRow({ id: memberId, name, stellung: stellungVal });
  const roundCount = getContestRoundCount();

  for (let i = 1; i <= roundCount; i++) {
    newRow[`r${i}_team`] = "";
  }

  const startIdx = parseInt(startRound.replace(/\D/g, '') || "1", 10);
  for (let i = startIdx; i <= roundCount; i++) {
    newRow[`r${i}_team`] = teamValue;
  }
  newRow._autoR2 = true;
  newRow._autoR3 = true;

  resultateState.rows.push(newRow);
  resultateState.isDirty = true;
  setStatus("Ungespeicherte Änderungen", true);
  if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState();

  const modalEl = document.getElementById("modal-add-resultate-shooter");
  if (modalEl) {
    const modal = bootstrap.Modal.getInstance(modalEl);
    if (modal) modal.hide();
  }

  renderUI();
}
window.confirmAddSelectedMember = confirmAddSelectedMember;

// =========================================================
//  KI-BILDFOTO / OCR MODAL LOGIK
// =========================================================

let _selectedOcrFile = null;
let _currentOcrResults = [];

function openResultateOcrModal() {
  _selectedOcrFile = null;
  _currentOcrResults = [];

  const roundSel = document.getElementById("ocr-target-round");
  if (roundSel) {
    const roundCount = getContestRoundCount();
    roundSel.innerHTML = "";
    for (let i = 1; i <= roundCount; i++) {
      const opt = document.createElement("option");
      opt.value = `r${i}`;
      opt.textContent = `Runde ${i}`;
      roundSel.appendChild(opt);
    }
  }

  const dropzone = document.getElementById("ocr-dropzone");
  const prevCont = document.getElementById("ocr-preview-container");
  const prevImg = document.getElementById("ocr-image-preview");
  const btnStart = document.getElementById("btn-start-ocr");
  const errAlert = document.getElementById("ocr-error-alert");

  if (errAlert) errAlert.classList.add("d-none");
  if (prevCont) prevCont.classList.add("d-none");
  if (prevImg) prevImg.src = "";
  if (btnStart) btnStart.disabled = true;

  const fileInput = document.getElementById("ocr-file-input");
  if (fileInput) fileInput.value = "";

  showOcrStep("upload");

  const modalEl = document.getElementById("resultate-ocr-modal");
  if (modalEl) {
    const modal = bootstrap.Modal.getOrCreateInstance(modalEl);
    modal.show();
  }
}

function showOcrStep(step) {
  const steps = ["upload", "loading", "results"];
  steps.forEach(s => {
    const el = document.getElementById(`ocr-step-${s}`);
    if (el) el.classList.toggle("d-none", s !== step);
  });
}

function onOcrFileSelected(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  _selectedOcrFile = file;

  const prevImg = document.getElementById("ocr-image-preview");
  const prevCont = document.getElementById("ocr-preview-container");
  const btnStart = document.getElementById("btn-start-ocr");

  const reader = new FileReader();
  reader.onload = function(evt) {
    if (prevImg) prevImg.src = evt.target.result;
    if (prevCont) prevCont.classList.remove("d-none");
    if (btnStart) btnStart.disabled = false;
  };
  reader.readAsDataURL(file);
}

async function startOcrAnalysis() {
  if (!_selectedOcrFile) return alert("Bitte zuerst ein Foto auswählen.");

  showOcrStep("loading");
  const model = document.getElementById("ocr-model")?.value || "gemini-2.5-flash";
  const targetRound = document.getElementById("ocr-target-round")?.value || "r1";
  const contestType = window._resultateContestType || "grenzland";

  try {
    const base64Data = await fileToBase64(_selectedOcrFile);
    const knownShooters = resultateState.rows.map(r => r.name);

    const payload = {
      model: model,
      contest_type: contestType,
      round: targetRound,
      image_base64: base64Data,
      known_shooters: knownShooters
    };

    let ocrResponse = null;
    const workerUrl = "https://v1-vorstand-api.dan-hunziker73.workers.dev/?module=resultate&action=ocr";
    
    try {
      const resp = await fetch(workerUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (resp.ok) {
        ocrResponse = await resp.json();
      }
    } catch (netErr) {
      console.warn("Worker OCR fehlgeschlagen, prüfe Fallback:", netErr);
    }

    if (!ocrResponse || !ocrResponse.results) {
      throw new Error("Erkennung über KI-Endpunkt lieferte keine Resultate.");
    }

    _currentOcrResults = ocrResponse.results;
    renderOcrResultsTable(_currentOcrResults, targetRound);
    showOcrStep("results");

  } catch (err) {
    console.error("OCR Fehler:", err);
    showOcrStep("upload");
    const errAlert = document.getElementById("ocr-error-alert");
    const errText = document.getElementById("ocr-error-text");
    if (errAlert && errText) {
      errText.innerText = `Fehler bei der KI-Erkennung: ${err.message || String(err)}`;
      errAlert.classList.remove("d-none");
    }
  }
}

function renderOcrResultsTable(results, targetRound) {
  const tbody = document.getElementById("ocr-results-tbody");
  if (!tbody) return;

  const contestType = window._resultateContestType || "grenzland";
  const pField = `${targetRound}_p1`;

  tbody.innerHTML = results.map((res, i) => {
    const matchedRow = resultateState.rows.find(r => r.name.toLowerCase().trim() === (res.name || "").toLowerCase().trim());
    const currentVal = matchedRow ? (matchedRow[pField] || "–") : "–";

    return `
      <tr>
        <td>
          <input class="form-check-input ocr-row-select" type="checkbox" data-idx="${i}" ${matchedRow ? 'checked' : ''}>
        </td>
        <td class="fw-bold">${escapeHtml(res.name || "Unbekannt")}</td>
        <td class="text-muted small">${escapeHtml(currentVal)}</td>
        <td>
          <input type="number" class="form-control form-control-sm text-center fw-bold ocr-result-input" 
                 data-idx="${i}" 
                 value="${escapeHtml(String(res.points || ""))}" 
                 style="max-width: 90px;">
        </td>
      </tr>
    `;
  }).join("");
}

function applyOcrResults() {
  const targetRound = document.getElementById("ocr-target-round")?.value || "r1";
  const pField = `${targetRound}_p1`;
  let appliedCount = 0;

  document.querySelectorAll(".ocr-row-select:checked").forEach(chk => {
    const idx = parseInt(chk.dataset.idx, 10);
    const item = _currentOcrResults[idx];
    if (!item) return;

    const inputVal = document.querySelector(`.ocr-result-input[data-idx="${idx}"]`)?.value;
    const finalPoints = (inputVal !== undefined && inputVal !== "") ? inputVal : item.points;

    const matchedRow = resultateState.rows.find(r => r.name.toLowerCase().trim() === (item.name || "").toLowerCase().trim());
    if (matchedRow) {
      matchedRow[pField] = String(finalPoints);
      appliedCount++;
    }
  });

  if (appliedCount > 0) {
    resultateState.isDirty = true;
    setStatus("Ungespeicherte Änderungen", true);
    if (typeof updateResultateSaveButtonState === 'function') updateResultateSaveButtonState();
    renderRounds();
  }

  const modalEl = document.getElementById("resultate-ocr-modal");
  if (modalEl) {
    bootstrap.Modal.getInstance(modalEl)?.hide();
  }

  alert(`✅ ${appliedCount} Resultate wurden in ${roundLabel(targetRound)} übernommen.`);
}

function resetOcrModal() {
  showOcrStep("upload");
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const res = reader.result;
      const base64 = res.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
