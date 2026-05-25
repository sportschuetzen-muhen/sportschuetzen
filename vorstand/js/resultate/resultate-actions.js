// =========================================================
//  RESULTATE (Grenzland) - Actions / Server Requests
// =========================================================

async function saveResultateData() {
  // Validierung Punkte
  for (const r of resultateState.rows) {
    if (!r.id) return alert("Es gibt eine Zeile ohne ID.");
    if (!isValidPoints(r.r1_p1) || !isValidPoints(r.r2_p1) || !isValidPoints(r.r3_p1)) {
      return alert("Bitte Punkte korrigieren: nur ganze Zahlen 0–100 (oder leer).");
    }
  }

  // Limit-Check (Sperre) – Pool ausgenommen
  const rounds = ["r1","r2","r3"];
  for (const rk of rounds) {
    const counts = new Map();
    resultateState.rows.forEach(r => {
      const t = (r[`${rk}_team`] || "") || "";
      if (!t) return; // leer == Pool
      counts.set(t, (counts.get(t) || 0) + 1);
    });
    for (const [team, cnt] of counts.entries()) {
      if (cnt > TEAM_LIMIT) {
        return alert(`${roundLabel(rk)}: Team "${team}" hat ${cnt} Zuteilungen (max ${TEAM_LIMIT}). Bitte korrigieren (Pool ist unbegrenzt).`);
      }
    }
  }

  const btn = document.getElementById("btn-save-resultate");
  const original = btn ? btn.innerText : "Speichern";
  if (btn) { btn.disabled = true; btn.innerText = "Speichere..."; }

  // Payload: Pool wird als "" gesendet (weil wir intern "" speichern, sobald Pool gewählt ist)
  const payloadRows = resultateState.rows.map(r => ({
    id: r.id,
    r1_team: r.r1_team || "",
    r1_p1: r.r1_p1 || "",
    r2_team: r.r2_team || "",
    r2_p1: r.r2_p1 || "",
    r3_team: r.r3_team || "",
    r3_p1: r.r3_p1 || ""
  }));

  try {
    const res = await apiFetch("manager", "action=saveResultateData", {
      method: "POST",
      body: JSON.stringify({ sheetName: "aktuell_Grenzland", rows: payloadRows })
    });
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch { throw new Error("Speichern: Backend-Antwort ist kein JSON"); }
    if (data.error) throw new Error(data.error);

    resultateState.isDirty = false;
    setStatus("✅ Gespeichert", false);

    if (btn) {
      btn.innerText = "✅ OK";
      setTimeout(() => { btn.innerText = original; btn.disabled = false; }, 1200);
    }
  } catch (e) {
    alert("Fehler beim Speichern: " + e.message);
    if (btn) { btn.disabled = false; btn.innerText = original; }
    setStatus("Fehler beim Speichern", true);
  }
}

async function syncSetupToResultate() {
  const btn = document.querySelector('button[onclick="syncSetupToResultate()"]');
  const origText = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.innerHTML = '⏳ Syncing…'; }

  try {
    const res = await apiFetch(
      'manager',
      'action=syncSetupToResultate&setupSheetName=Setup_Grenzland&resultateSheetName=aktuell_Grenzland'
    );
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch { throw new Error('Backend-Antwort ist kein JSON'); }
    if (data.error) throw new Error(data.error);

    const added = data.added || 0;
    if (added === 0) {
      alert('Alle Setup-Schützen sind bereits in Resultate vorhanden – nichts hinzugefügt.');
    } else {
      alert(`✅ ${added} Schütze${added === 1 ? '' : 'n'} aus Setup_Grenzland übernommen.`);
      await loadResultateData(); // Neu laden damit UI aktuell ist
      return; // loadResultateData setzt Status selbst
    }
  } catch (e) {
    alert('Fehler beim Sync: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = origText; }
  }
}

async function pushOneSignalGrenzland() {
  try {
    const res = await apiFetch("manager", "action=push_onesignal_grenzland");
    const txt = await res.text();
    let data;
    try { data = JSON.parse(txt); } catch { data = { raw: txt }; }
    if (data.error) throw new Error(data.error);

    alert("Push OK" + (data.message ? (": " + data.message) : ""));
  } catch (e) {
    alert("Push Fehler: " + e.message);
  }
}
