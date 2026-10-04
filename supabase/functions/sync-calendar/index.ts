// supabase/functions/sync-calendar/index.ts
// ==============================================================================
// Phase 40: Google Calendar Synchronisation (Supabase Edge Function)
// Projekt: Vereinsportal Sportschützen Muhen
//
// Features:
// - Direkte Integration der Google Calendar REST API v3
// - Authentifizierung via Google Service Account (JWT RS256 / Web Crypto API)
// - Vollautomatisches Blockieren von Miettag ("Vermietet an XX") und Folgetag ("Gesperrt für Reinigung")
// - Freigabe bei Stornierung (Löschen der Termine)
// - Zielkalender: sportschuetzen.muhen@gmail.com
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";

const TARGET_CALENDAR_ID = "sportschuetzen.muhen@gmail.com";

interface ServiceAccountKey {
  client_email: string;
  private_key: string;
  project_id?: string;
}

// 1. Eingebetteter Key aus lokaler TypeScript-Konfiguration (CT 117 Server)
let embeddedKey: ServiceAccountKey | null = null;
try {
  // @ts-ignore: dynamischer Server-Import auf CT 117
  const mod = await import("./service-account.ts");
  if (mod && mod.SERVICE_ACCOUNT_KEY) {
    embeddedKey = mod.SERVICE_ACCOUNT_KEY;
  }
} catch (_) {}

// Lädt den Service Account Key aus eingebetteter Datei oder Umgebungsvariable
async function getServiceAccountKey(): Promise<ServiceAccountKey> {
  if (embeddedKey && embeddedKey.client_email && embeddedKey.private_key) {
    return embeddedKey;
  }

  const envKey = Deno.env.get("GOOGLE_SERVICE_ACCOUNT_KEY");
  if (envKey) {
    try {
      return JSON.parse(envKey);
    } catch (_) {
      try {
        return JSON.parse(atob(envKey));
      } catch (_) {}
    }
  }

  throw new Error("Google Service Account Key wurde weder in service-account.ts noch in Umgebungsvariablen gefunden.");
}

// Konvertiert PEM Private Key in binäres DER-Format
function pemToBinary(pem: string): Uint8Array {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  const binaryString = atob(clean);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Base64URL Encoding
function base64Url(input: string | Uint8Array): string {
  const b64 = typeof input === "string" ? btoa(input) : btoa(String.fromCharCode(...input));
  return b64.replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

// Bezieht ein Google OAuth2 Access Token mittels JWT RS256
async function getGoogleAccessToken(saKey: ServiceAccountKey): Promise<string> {
  const binaryKey = pemToBinary(saKey.private_key);
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = base64Url(JSON.stringify({
    iss: saKey.client_email,
    scope: "https://www.googleapis.com/auth/calendar",
    aud: "https://oauth2.googleapis.com/token",
    exp: now + 3600,
    iat: now
  }));

  const dataToSign = new TextEncoder().encode(`${header}.${claim}`);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, dataToSign);
  const sigB64 = base64Url(new Uint8Array(signature));

  const jwt = `${header}.${claim}.${sigB64}`;

  const tokenResp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  });

  const tokenData = await tokenResp.json();
  if (!tokenResp.ok || !tokenData.access_token) {
    throw new Error(`Google OAuth2 Token Fehler: ${JSON.stringify(tokenData)}`);
  }

  return tokenData.access_token;
}

// Normalisiert Datum zu Date-Objekt (DD.MM.YYYY oder YYYY-MM-DD)
function parseDateInput(str: string): Date {
  if (!str) throw new Error("Datum fehlt.");
  if (str.includes(".")) {
    const parts = str.split(".");
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  }
  if (str.includes("-")) {
    const parts = str.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(str);
}

function formatDateIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let payload: any = {};
    if (req.method === "POST") {
      try {
        payload = await req.json();
      } catch (_) {
        payload = {};
      }
    } else {
      const url = new URL(req.url);
      payload = {
        action: url.searchParams.get("action") || "list",
        date: url.searchParams.get("date"),
        bookingId: url.searchParams.get("bookingId")
      };
    }

    const action = payload.action || "block";
    const saKey = await getServiceAccountKey();
    const accessToken = await getGoogleAccessToken(saKey);

    const calApiBase = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(TARGET_CALENDAR_ID)}`;

    // =========================================================================
    // AKTION: BLOCKIEREN (Miettag + Reinigungstag)
    // =========================================================================
    if (action === "block" || action === "blockCalendar") {
      const rawDate = payload.date || payload.mietdatum || payload.startDate;
      if (!rawDate) throw new Error("Parameter 'date' / 'mietdatum' fehlt.");

      const rentDate = parseDateInput(rawDate);
      const nextDay = new Date(rentDate);
      nextDay.setDate(nextDay.getDate() + 1);
      const dayAfterNext = new Date(nextDay);
      dayAfterNext.setDate(dayAfterNext.getDate() + 1);

      const day1Iso = formatDateIso(rentDate);
      const day2Iso = formatDateIso(nextDay);
      const day3Iso = formatDateIso(dayAfterNext);

      let initials = payload.initials || "";
      if (!initials && (payload.vorname || payload.nachname)) {
        initials = `${(payload.vorname || "").charAt(0)}${(payload.nachname || "").charAt(0)}`.toUpperCase();
      }
      if (!initials) initials = "Kunde";

      const bookingId = payload.bookingId || payload.vertragsnr || payload.vertragsnummer || "";

      // Event 1: Miettag (Ganztag)
      const event1Payload = {
        summary: `Vermietet an ${initials}`,
        description: `Mietvertrag Schützenstube ${bookingId}`.trim(),
        start: { date: day1Iso },
        end: { date: day2Iso }
      };

      // Event 2: Reinigungstag (Folgetag, Ganztag)
      const event2Payload = {
        summary: `Gesperrt für Reinigung`,
        description: `Reinigungspuffer nach Miete ${bookingId}`.trim(),
        start: { date: day2Iso },
        end: { date: day3Iso }
      };

      const [res1, res2] = await Promise.all([
        fetch(`${calApiBase}/events`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(event1Payload)
        }),
        fetch(`${calApiBase}/events`, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${accessToken}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify(event2Payload)
        })
      ]);

      const data1 = await res1.json();
      const data2 = await res2.json();

      if (!res1.ok || !res2.ok) {
        throw new Error(`Google Calendar API Fehler beim Erstellen: ${JSON.stringify({ e1: data1, e2: data2 })}`);
      }

      return new Response(JSON.stringify({
        success: true,
        action: "block",
        bookingId: bookingId,
        events: [
          { id: data1.id, summary: data1.summary, date: day1Iso },
          { id: data2.id, summary: data2.summary, date: day2Iso }
        ]
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AKTION: FREIGEBEN / STORNO (Events wieder löschen)
    // =========================================================================
    if (action === "release" || action === "unblock" || action === "storno_calendar") {
      const rawDate = payload.date || payload.mietdatum || payload.startDate;
      if (!rawDate) throw new Error("Parameter 'date' / 'mietdatum' fehlt für Storno.");

      const rentDate = parseDateInput(rawDate);
      const dayAfterNext = new Date(rentDate);
      dayAfterNext.setDate(dayAfterNext.getDate() + 2);

      const day1Iso = formatDateIso(rentDate);
      const day3Iso = formatDateIso(dayAfterNext);

      // Events im Zeitfenster suchen
      const searchUrl = `${calApiBase}/events?timeMin=${day1Iso}T00:00:00Z&timeMax=${day3Iso}T23:59:59Z&singleEvents=true`;
      const searchResp = await fetch(searchUrl, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const searchData = await searchResp.json();

      let deletedCount = 0;
      if (searchResp.ok && Array.isArray(searchData.items)) {
        for (const item of searchData.items) {
          const summary = item.summary || "";
          if (summary.includes("Vermietet") || summary.includes("Gesperrt") || summary.includes("Reinigung")) {
            await fetch(`${calApiBase}/events/${item.id}`, {
              method: "DELETE",
              headers: { "Authorization": `Bearer ${accessToken}` }
            });
            deletedCount++;
          }
        }
      }

      return new Response(JSON.stringify({
        success: true,
        action: "release",
        deletedCount: deletedCount
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // =========================================================================
    // AKTION: LIST (Termine abfragen)
    // =========================================================================
    if (action === "list") {
      const nowIso = new Date().toISOString();
      const listUrl = `${calApiBase}/events?timeMin=${encodeURIComponent(nowIso)}&maxResults=20&singleEvents=true&orderBy=startTime`;
      const listResp = await fetch(listUrl, {
        headers: { "Authorization": `Bearer ${accessToken}` }
      });
      const listData = await listResp.json();

      return new Response(JSON.stringify({
        success: true,
        items: listData.items || []
      }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    throw new Error(`Unbekannte Aktion: ${action}`);

  } catch (err: any) {
    console.error("Fehler in sync-calendar Edge Function:", err);
    return new Response(JSON.stringify({
      success: false,
      error: err.message || String(err)
    }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
