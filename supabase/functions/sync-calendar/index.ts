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
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

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

// Normalisiert Datum zu Date-Objekt (DD.MM.YYYY oder YYYY-MM-DD, optional mit Zeitanteil)
function parseDateInput(str: string): Date {
  if (!str) throw new Error("Datum fehlt.");
  const clean = String(str).trim().split("T")[0].split(" ")[0];
  if (clean.includes(".")) {
    const parts = clean.split(".");
    return new Date(Number(parts[2]), Number(parts[1]) - 1, Number(parts[0]));
  }
  if (clean.includes("-")) {
    const parts = clean.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }
  return new Date(clean);
}

// Extrahiert eine Buchungsnummer (z.B. V-2026-0007, V-2026-N002, A-2026-0001) aus Text
function extractBookingIdFromText(text: string): string | null {
  const m = String(text || "").match(/\b([VA]-\d{4}-(?:N\d{3,4}|\d{3,4}))\b/i);
  return m ? m[1].toUpperCase() : null;
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
      } catch (e: any) {
        console.warn("⚠️ [sync-calendar] JSON Parse Fehler:", e);
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
    console.log(`[sync-calendar] Method=${req.method}, Action=${payload.action}, BookingId=${payload.bookingId}, Date=${payload.date}`);

    const action = payload.action || "block";

    // Aufrufer-Authentifizierung & Schutz vor Missbrauch mit öffentlichem Anon-Key
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://supabase-muhen.danfamily.uk";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
    const authHeader = req.headers.get("Authorization") || "";
    const callerToken = authHeader.replace(/^Bearer\s+/i, "").trim();
    const isServiceRole = Boolean(callerToken && supabaseServiceKey && callerToken === supabaseServiceKey);
    const supabaseAdmin = (supabaseUrl && supabaseServiceKey)
      ? createClient(supabaseUrl, supabaseServiceKey, { auth: { persistSession: false } })
      : null;

    let callerUser: any = null;
    if (supabaseAdmin && callerToken && !isServiceRole) {
      try {
        const { data: { user } } = await supabaseAdmin.auth.getUser(callerToken);
        if (user?.id) callerUser = user;
      } catch (_) {}
    }

    // DB-autoritative RBAC-Prüfung (SP-2026-002 / SEC-014 & SEC-013: kein admin_profiles-Fallback, gesperrte Admins blockiert)
    let hasCalManage = isServiceRole;
    let hasCalView = isServiceRole;
    if (!isServiceRole && callerUser && supabaseAdmin) {
      try {
        const { data: adminRows } = await supabaseAdmin
          .from("admin_profiles")
          .select("is_active")
          .eq("auth_user_id", callerUser.id);
        const hasInactive = (adminRows || []).some((r: any) => r.is_active === false);
        const hasActive = (adminRows || []).some((r: any) => r.is_active === true);
        if (!(hasInactive && !hasActive)) {
          const { data: userRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", callerUser.id);
          const roleList = (userRoles || []).map((r: any) => String(r.role || "").toLowerCase()).filter(Boolean);
          if (roleList.includes("admin")) {
            hasCalManage = true;
            hasCalView = true;
          } else if (roleList.length > 0) {
            const { data: rolePerms } = await supabaseAdmin.from("role_permissions").select("permission").in("role", roleList);
            const perms = new Set((rolePerms || []).map((p: any) => String(p.permission || "")));
            if (perms.has("*") || perms.has("vermietung.manage") || perms.has("termine.manage")) {
              hasCalManage = true;
              hasCalView = true;
            } else if (perms.has("vermietung.view") || perms.has("termine.view")) {
              hasCalView = true;
            }
          }
        }
      } catch (_) {}
    }

    const isBlockAction = (action === "block" || action === "blockCalendar");
    const isListAction = (action === "list");

    if (isListAction) {
      if (!hasCalView) {
        return new Response(JSON.stringify({ success: false, error: callerUser ? "Keine Berechtigung für Kalender-Abruf." : "Authentifizierung erforderlich." }), {
          status: callerUser ? 403 : 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } else if (!isBlockAction) {
      if (!hasCalManage) {
        return new Response(JSON.stringify({ success: false, error: callerUser ? "Keine Verwaltungs-Berechtigung für Kalender-Freigabe." : "Authentifizierung erforderlich für Kalender-Freigabe." }), {
          status: callerUser ? 403 : 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    } else if (!hasCalManage) {
      // Blockierung ohne vermietung.manage / termine.manage (sowohl anon als auch normale Mitglieder)
      // nur für eine existierende, noch nicht im Kalender blockierte Buchung erlauben!
      const anonBookingId = String(payload.bookingId || payload.vertragsnr || payload.vertragsnummer || "").trim();
      if (!anonBookingId || !supabaseAdmin) {
        return new Response(JSON.stringify({ success: false, error: "Gültige Buchungs-ID erforderlich." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
      const { data: rentalCheck } = await supabaseAdmin
        .from("rental_requests")
        .select("id, booking_number, start_date, status, is_inquiry, google_calendar_event_id")
        .eq("booking_number", anonBookingId)
        .maybeSingle();

      const rawReqDate = String(payload.date || payload.mietdatum || payload.startDate || "").trim();
      const reqIsoDate = rawReqDate ? formatDateIso(parseDateInput(rawReqDate)) : "";
      if (!rentalCheck || rentalCheck.status !== "contract_sent" || rentalCheck.is_inquiry || rentalCheck.google_calendar_event_id || !reqIsoDate || reqIsoDate !== rentalCheck.start_date) {
        return new Response(JSON.stringify({ success: false, error: "Buchung für öffentliche Kalenderblockierung nicht gültig oder bereits blockiert." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

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
      const event1Payload: any = {
        summary: `Vermietet an ${initials}`,
        description: `Mietvertrag Schützenstube ${bookingId}`.trim(),
        start: { date: day1Iso },
        end: { date: day2Iso }
      };

      // Event 2: Reinigungstag (Folgetag, Ganztag)
      const event2Payload: any = {
        summary: `Gesperrt für Reinigung`,
        description: `Reinigungspuffer nach Miete ${bookingId}`.trim(),
        start: { date: day2Iso },
        end: { date: day3Iso }
      };

      if (bookingId) {
        event1Payload.extendedProperties = {
          private: { bookingId: bookingId, module: "vermietung", eventType: "rental" },
          shared: { bookingId: bookingId, module: "vermietung", eventType: "rental" }
        };
        event2Payload.extendedProperties = {
          private: { bookingId: bookingId, module: "vermietung", eventType: "cleaning" },
          shared: { bookingId: bookingId, module: "vermietung", eventType: "cleaning" }
        };
      }

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

      if (supabaseAdmin && bookingId && data1?.id) {
        try {
          await supabaseAdmin
            .from("rental_requests")
            .update({ google_calendar_event_id: data1.id })
            .eq("booking_number", bookingId);
        } catch (_) {}
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
    // AKTION: FREIGEBEN / STORNO (Events zielgenau via bookingId löschen)
    // =========================================================================
    if (action === "release" || action === "unblock" || action === "storno_calendar") {
      const rawDate = payload.date || payload.mietdatum || payload.startDate || payload.start_date;
      const bookingId = String(payload.bookingId || payload.vertragsnr || payload.vertragsnummer || payload.booking_number || "").trim();
      const bookingIdUpper = bookingId.toUpperCase();

      if (!rawDate && !bookingId) {
        throw new Error("Parameter 'date' / 'mietdatum' oder 'bookingId' fehlt für Storno.");
      }

      let expectedInitials = String(payload.initials || "").trim().toUpperCase();
      if (!expectedInitials && (payload.vorname || payload.nachname)) {
        expectedInitials = `${String(payload.vorname || "").charAt(0)}${String(payload.nachname || "").charAt(0)}`.toUpperCase();
      }

      let day1Iso = "";
      let day2Iso = "";
      if (rawDate) {
        const rentDate = parseDateInput(rawDate);
        const nextDay = new Date(rentDate);
        nextDay.setDate(nextDay.getDate() + 1);

        day1Iso = formatDateIso(rentDate);
        day2Iso = formatDateIso(nextDay);
      }

      // Sammle zu löschende Event-IDs (Map verhindert doppelte Löschversuche)
      const eventsToDelete = new Map<string, any>();

      // 1. Suche via bookingId (Volltextsuche q in Google Calendar API)
      if (bookingId) {
        try {
          const qUrl = `${calApiBase}/events?q=${encodeURIComponent(bookingId)}&singleEvents=true`;
          const qResp = await fetch(qUrl, {
            headers: { "Authorization": `Bearer ${accessToken}` }
          });
          if (qResp.ok) {
            const qData = await qResp.json();
            if (Array.isArray(qData.items)) {
              for (const item of qData.items) {
                const desc = String(item.description || "");
                const summ = String(item.summary || "");
                const privBid = String(item.extendedProperties?.private?.bookingId || "").trim().toUpperCase();
                const sharedBid = String(item.extendedProperties?.shared?.bookingId || "").trim().toUpperCase();
                const textBid = extractBookingIdFromText(`${summ} ${desc}`) || "";
                if (
                  desc.toUpperCase().includes(bookingIdUpper) ||
                  summ.toUpperCase().includes(bookingIdUpper) ||
                  privBid === bookingIdUpper ||
                  sharedBid === bookingIdUpper ||
                  textBid === bookingIdUpper
                ) {
                  eventsToDelete.set(item.id, item);
                }
              }
            }
          }
        } catch (qErr) {
          console.warn("Warnung bei q-Suche Google Calendar:", qErr);
        }
      }

      // 2. Datumssuche (nur im exakten 2-Tages-Fenster: Tag 1 00:00:00Z bis Tag 2 23:59:59Z)
      if (rawDate && day1Iso && day2Iso) {
        try {
          const searchUrl = `${calApiBase}/events?timeMin=${day1Iso}T00:00:00Z&timeMax=${day2Iso}T23:59:59Z&singleEvents=true`;
          const searchResp = await fetch(searchUrl, {
            headers: { "Authorization": `Bearer ${accessToken}` }
          });
          if (searchResp.ok) {
            const searchData = await searchResp.json();
            const items: any[] = Array.isArray(searchData.items) ? searchData.items : [];

            let matchedDay1ForBooking = [...eventsToDelete.values()].some(ev => ev.start?.date === day1Iso);
            let hasForeignDay1Rental = false;

            const parsedItems = items.map(item => {
              const desc = String(item.description || "");
              const summ = String(item.summary || "");
              const privBid = String(item.extendedProperties?.private?.bookingId || "").trim().toUpperCase();
              const sharedBid = String(item.extendedProperties?.shared?.bookingId || "").trim().toUpperCase();
              const textBid = extractBookingIdFromText(`${summ} ${desc}`) || "";
              const itemBid = privBid || sharedBid || textBid;
              const explicitMatch = Boolean(
                bookingIdUpper && (
                  itemBid === bookingIdUpper ||
                  desc.toUpperCase().includes(bookingIdUpper) ||
                  summ.toUpperCase().includes(bookingIdUpper)
                )
              );
              return { item, desc, summ, itemBid, explicitMatch };
            });

            // Erster Durchlauf: Tag 1 (Miettag) und explizite bookingId-Treffer auswerten
            for (const entry of parsedItems) {
              const { item, summ, itemBid, explicitMatch } = entry;
              const isDay1 = item.start?.date === day1Iso;

              if (bookingId) {
                if (explicitMatch) {
                  eventsToDelete.set(item.id, item);
                  if (isDay1) matchedDay1ForBooking = true;
                } else if (isDay1 && summ.startsWith("Vermietet an ")) {
                  if (!itemBid) {
                    const matchesInitials = !expectedInitials || summ.trim().toUpperCase() === `VERMIETET AN ${expectedInitials}`;
                    if (matchesInitials) {
                      eventsToDelete.set(item.id, item);
                      matchedDay1ForBooking = true;
                    } else {
                      hasForeignDay1Rental = true;
                    }
                  } else {
                    hasForeignDay1Rental = true;
                  }
                }
              } else {
                const isRentDay = isDay1 && summ.startsWith("Vermietet an ");
                const isCleanDay = item.start?.date === day2Iso && summ.trim() === "Gesperrt für Reinigung";
                if (isRentDay || isCleanDay) {
                  eventsToDelete.set(item.id, item);
                }
              }
            }

            // Zweiter Durchlauf: Tag 2 (Reinigungstag) auch für ungetaggte Altdaten / Notfall-Puffer prüfen
            if (bookingId) {
              for (const entry of parsedItems) {
                const { item, summ, itemBid } = entry;
                const isDay2 = item.start?.date === day2Iso;
                if (
                  isDay2 &&
                  !itemBid &&
                  summ.trim() === "Gesperrt für Reinigung" &&
                  (matchedDay1ForBooking || !hasForeignDay1Rental)
                ) {
                  eventsToDelete.set(item.id, item);
                }
              }
            }
          }
        } catch (dateErr) {
          console.warn("Warnung bei Datumssuche Google Calendar:", dateErr);
        }
      }

      let deletedCount = 0;
      for (const [id] of eventsToDelete.entries()) {
        const delResp = await fetch(`${calApiBase}/events/${id}`, {
          method: "DELETE",
          headers: { "Authorization": `Bearer ${accessToken}` }
        });
        if (delResp.ok || delResp.status === 404) {
          deletedCount++;
        }
      }

      if (supabaseAdmin && bookingId) {
        try {
          await supabaseAdmin
            .from("rental_requests")
            .update({ google_calendar_event_id: null })
            .eq("booking_number", bookingId);
        } catch (_) {}
      }

      return new Response(JSON.stringify({
        success: true,
        action: "release",
        bookingId: bookingId,
        date: day1Iso,
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
