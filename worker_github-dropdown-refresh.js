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
const GOOGLE_MEMBERS100_URL = "https://script.google.com/macros/s/AKfycbyiJBjqfLWYuQeY89s2lKS4DoI6UY45uVAIImTK8vHzhTbDLyKFwcL6RYOrWatMdA8A/exec";
const GOOGLE_HAUS_KALENDER_URL = "https://script.google.com/macros/s/AKfycbxETNWUOsdyF72caWlJ7gi7mlI_oSX2rWQJfUskim8umRF2ARrSCGfe6UWzTy26B_s5/exec";

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
        let text = "";
        try {
          const response = await fetch(`${GOOGLE_MEMBERS100_URL}?action=getMembers&type=member`);
          const raw = await response.json();
          if (Array.isArray(raw) && raw.length > 0) {
            const formatted = raw.map(m => ({
              id: String(m.AddressNumber || m.PersonNumber || '').padStart(6, '0'),
              personnumber: String(m.PersonNumber || ''),
              addressnumber: String(m.AddressNumber || '').padStart(6, '0'),
              lizenz: String(m.AddressNumber || '').padStart(6, '0'),
              firstname: m.FirstName || '',
              lastname: m.LastName || '',
              type: 'member'
            }));
            text = JSON.stringify(formatted);
          } else {
            throw new Error("Members100 response empty or not an array");
          }
        } catch (e) {
          const response = await fetch(`${GOOGLE_AUTH_URL}?action=getMembers&type=member`);
          text = await response.text();
        }
        return new Response(text, {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=3600, s-maxage=86400"
          }
        });
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

      // ✅ FIX: getParticipants mit bedarfsweisem Mitglieder-Lookup & Cache
      if (action === 'getParticipants') {
        const eventid = url.searchParams.get('eventid');

        // 1. Teilnehmer vom GAS holen
        const response = await fetch(`${GOOGLE_EVENTPLANER_URL}?action=getParticipants&eventid=${encodeURIComponent(eventid)}`);
        let participants = [];
        try { participants = await response.json(); } catch(e) { participants = []; }
        if (!Array.isArray(participants)) participants = [];

        // 2. Nur falls noch Namen fehlen, die externe Mitgliederliste nachladen
        const needsLookup = participants.some(p => !p.name || String(p.name).startsWith('Lizenz '));
        let memberMap = {};
        if (needsLookup) {
          try {
            const membersResp = await fetch(`${GOOGLE_AUTH_URL}?action=getMembers&type=member`);
            const members = await membersResp.json();
            if (Array.isArray(members)) {
              members.forEach(m => {
                const keys = [m.id, m.lizenz, m.personnumber, m.addressnumber].filter(Boolean);
                keys.forEach(k => {
                  const strKey = String(k).trim();
                  memberMap[strKey] = m;
                  memberMap[strKey.padStart(6, '0')] = m;
                });
              });
            }
          } catch (e) {
            safeLog("Mitglieder-Lookup Fehler", e.message);
          }
        }

        // 3. Teilnehmer anreichern: Lizenz padden + vorname/nachname auflösen
        const enriched = participants.map(p => {
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

          // Kein Treffer oder Name bereits aufgelöst
          return {
            ...p,
            lizenz: paddedLiz || p.lizenz,
            name:   p.name || (paddedLiz ? `Lizenz ${paddedLiz}` : '?')
          };
        });

        return new Response(JSON.stringify(enriched), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=60"
          }
        });
      }

      if (action === 'setRSVP') {
        const target = `${GOOGLE_EVENTPLANER_URL}?${url.searchParams.toString()}`;
        const response = await fetch(target);
        return new Response(JSON.stringify({ success: true, response: await response.text() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // NEU: Poll-Abstimmungsergebnisse abrufen (mit bedarfsweiser Namensauflösung für Lizenznummern)
      if (action === 'getPollResults') {
        const eventid = url.searchParams.get('eventid');
        const response = await fetch(GOOGLE_EVENTPLANER_URL + '?action=getPollResults&eventid=' + encodeURIComponent(eventid));
        let pollData = {};
        try { pollData = await response.json(); } catch(e) { pollData = {}; }

        // Prüfen, ob überhaupt noch reine Lizenznummern in den Namen vorkommen (GAS löst diese meist schon auf)
        let hasNumericLicenses = false;
        if (pollData && pollData.names) {
          for (const optId in pollData.names) {
            if (pollData.names[optId] && pollData.names[optId].some(n => /^\d+$/.test(String(n).trim()))) {
              hasNumericLicenses = true;
              break;
            }
          }
        }

        // Nur WENN noch reine Ziffern vorkommen, den zweiten Fetch ausführen
        if (hasNumericLicenses) {
          try {
            const membersResp = await fetch(`${GOOGLE_AUTH_URL}?action=getMembers&type=member`);
            const members = await membersResp.json();
            if (Array.isArray(members)) {
              const memberMap = {};
              members.forEach(m => {
                const name = m.firstname || m.vorname || (m.name ? m.name.split(' ')[0] : '');
                [m.id, m.lizenz, m.personnumber, m.addressnumber].filter(Boolean).forEach(k => {
                  const s = String(k).trim();
                  memberMap[s] = name;
                  memberMap[s.padStart(6, '0')] = name;
                  memberMap[s.replace(/^0+/, '')] = name;
                });
              });

              for (const optId in pollData.names) {
                pollData.names[optId] = pollData.names[optId].map(n => {
                  const s = String(n).trim();
                  if (/^\d+$/.test(s)) {
                    return memberMap[s] || memberMap[s.padStart(6, '0')] || memberMap[s.replace(/^0+/, '')] || n;
                  }
                  return n;
                });
              }
            }
          } catch(e) {
            safeLog("Poll-Name Enrichment Fehler", e.message);
          }
        }

        return new Response(JSON.stringify(pollData), {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=30'
          }
        });
      }

      if (action === 'trackView') {
        const target = `${GOOGLE_EVENTPLANER_URL}?${url.searchParams.toString()}`;
        const response = await fetch(target);
        return new Response(JSON.stringify({ success: true, response: await response.text() }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // === 4.1 HAUS-KALENDER (SCHÜTZENHAUS BELEGUNG) ===
      if (action === 'getHausKalender') {
        const response = await fetch(GOOGLE_HAUS_KALENDER_URL);
        return new Response(await response.text(), {
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=120"
          }
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
