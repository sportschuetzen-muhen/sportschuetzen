/**
 * Cloudflare Worker - Vollständige Sportschützen API (Routing Edition)
 * ✅ Standblatt Upload (R2 + OCR)
 * ✅ Eventplaner (Mitglieder, RSVP, Teilnehmer)
 * ✅ NEU: Separates Auth-Script für Mitglieder-Login
 * ✅ FIX: getParticipants mit Lizenz-Normalisierung (padStart 6 Stellen)
 */

const GOOGLE_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwUJRX_S-N8wzIYDASqVNlj57aettWN7mKYpbufhDW5OlImESSHnNSjxyLoz18NWFu1/exec";
const GOOGLE_EVENTPLANER_URL = "https://script.google.com/macros/s/AKfycbzwDg-lk38hZiLUZQCXR-7T4QX7IbD2h4VcUd7s6-5O0hl4nt9dJGNG5Xv4oozf5VJ9/exec";
const GOOGLE_AUTH_URL = "https://script.google.com/macros/s/AKfycbxg7qWgyyJOqCgUuHM7m4D4lu4f7XetMTkDAzIjmMswBh7_Qe0Ghhi70LwreCOvaM-W/exec";

/* ----------------------------- SAFE DEBUG LOGGER ----------------------------- */
function safeLog(label, value) {
  try {
    const s = JSON.stringify(value);
    console.log(label, s.length > 500 ? s.substring(0, 500) + "…[truncated]" : s);
  } catch {
    console.log(label, "[unloggable]");
  }
}

/* ----------------------------- CORS HEADERS ----------------------------- */
function getCorsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  };
}

export default {
  async fetch(request, env) {
    const corsHeaders = getCorsHeaders();

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    try {
      const url = new URL(request.url);
      let action = url.searchParams.get('action');
      let body = {};

      if (request.method === 'POST' && !action) {
        const text = await request.text();
        if (!text) throw new Error("Leerer Request Body");
        body = JSON.parse(text);
        action = body.action;
      }

      safeLog("ACTION DETECTED", action);

      // === 3. AUTH & MITGLIEDER ===
      if (action === 'getMembers') {
        const response = await fetch(`${GOOGLE_AUTH_URL}?action=getMembers&type=member`);
        const text = await response.text();
        return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === 'checkLogin') {
        const user = url.searchParams.get('user');
        const pw = url.searchParams.get('pw');
        const response = await fetch(`${GOOGLE_AUTH_URL}?action=checkLogin&user=${encodeURIComponent(user)}&pw=${encodeURIComponent(pw)}`);
        const text = await response.text();
        return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // === 4. EVENTPLANER API ===
      if (action === 'getRSVPEvents') {
        const lizenz = url.searchParams.get('lizenz');
        const response = await fetch(`${GOOGLE_EVENTPLANER_URL}?action=getRSVPEvents&lizenz=${encodeURIComponent(lizenz)}`);
        return new Response(await response.text(), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ✅ FIX: getParticipants mit Mitglieder-Lookup für Lizenz-Normalisierung
      if (action === 'getParticipants') {
        const eventid = url.searchParams.get('eventid');

        // 1. Teilnehmer vom GAS holen
        const response = await fetch(`${GOOGLE_EVENTPLANER_URL}?action=getParticipants&eventid=${encodeURIComponent(eventid)}`);
        const participants = await response.json();

        // 2. Mitgliederliste für Name-Lookup laden
        let memberMap = {};
        try {
          const membersResp = await fetch(`${GOOGLE_AUTH_URL}?action=getMembers&type=member`);
          const members = await membersResp.json();
          if (Array.isArray(members)) {
            members.forEach(m => {
              const paddedId = String(m.id).padStart(6, '0');
              memberMap[paddedId] = m;          // 6-stellig
              memberMap[String(m.id)] = m;      // original (kurz)
            });
          }
        } catch (e) {
          safeLog("Mitglieder-Lookup Fehler", e.message);
        }

        // 3. Teilnehmer anreichern: Lizenz padden + vorname/nachname auflösen
        const enriched = (Array.isArray(participants) ? participants : []).map(p => {
          // Lizenz aus Eintrag oder aus "Lizenz XXXX"-String extrahieren
          const rawLiz   = String(p.lizenz || (p.name?.startsWith('Lizenz ') ? p.name.replace('Lizenz ', '') : '') || '').trim();
          const paddedLiz = rawLiz.padStart(6, '0');

          const member = memberMap[paddedLiz] || memberMap[rawLiz];

          if (member) {
            const vorname  = member.firstname || '';
            const nachname = member.lastname  || '';
            return {
              ...p,
              lizenz:  paddedLiz,
              vorname,
              nachname,
              name: `${nachname} ${vorname}`.trim()
            };
          }

          // Kein Treffer → Lizenz gepaddet anzeigen
          return {
            ...p,
            lizenz: paddedLiz || p.lizenz,
            name:   paddedLiz ? `Lizenz ${paddedLiz}` : (p.name || '?')
          };
        });

        return new Response(JSON.stringify(enriched), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (action === 'setRSVP') {
        const target = `${GOOGLE_EVENTPLANER_URL}?${url.searchParams.toString()}`;
        const response = await fetch(target);
        return new Response(JSON.stringify({ success: true, response: await response.text() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      if (action === 'trackView') {
        const target = `${GOOGLE_EVENTPLANER_URL}?${url.searchParams.toString()}`;
        const response = await fetch(target);
        return new Response(JSON.stringify({ success: true, response: await response.text() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // === 5. STANDBLATT UPLOAD ===
      if (action === "upload_standblatt") {
        if (!body.foto) throw new Error("Kein Foto im Request");
        const lizenz = String(body.lizenz || "").replace(/^[-\s]+/, "");
        const fileName = `standblatt_${lizenz}_${Date.now()}.jpg`;

        const base64Data = body.foto.split(",").pop();
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) { bytes[i] = binaryString.charCodeAt(i); }

        await env.MY_BUCKET.put(fileName, bytes, {
          httpMetadata: { contentType: "image/jpeg" },
          customMetadata: { vorname: body.vorname, nachname: body.nachname, lizenz }
        });

        const gResp = await fetch(GOOGLE_WEB_APP_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, bildName: fileName })
        });

        return new Response(await gResp.text(), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      if (action === 'getTermine') {
        return new Response(JSON.stringify({ message: "Noch zu implementieren" }), { headers: corsHeaders });
      }

      throw new Error(`Unbekannte Aktion: ${action}`);

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), { status: 400, headers: corsHeaders });
    }
  }
};
