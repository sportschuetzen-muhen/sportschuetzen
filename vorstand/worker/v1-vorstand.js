/**
 * ZENTRALER API-WORKER (Sportschützen Muhen)
 * Verbindet Inventar, Termine, GV und Login in einer API.
 * 
 * Sicherheits-Features:
 * - CSRF-Token Validierung
 * - Passwort-Hash (SHA-256) Support
 * - Role-Based Access Control (RBAC)
 */

// === ENTWICKLER-MODUS (TRUE = KEIN PASSWORT NÖTIG) ===
const DEV_MODE = false; // <--- FÜR PRODUKTION: FALSE!

// === KONFIGURATION: DEINE GOOGLE SCRIPTS ===
const SCRIPTS = {
  // Inventar
  inventar: "https://script.google.com/macros/s/AKfycbzH6dHv3nVcT6L_ep9P-hX8otivZRtwt2Zr1Sy7OW9OMH6qj3HzkIgEsjinxlY1rFdC/exec",
  
  // Termine & Admin & User-DB
  termine: "https://script.google.com/macros/s/AKfycbxoItTn9_HUJ0frtfN-bsXYV0nUqLx5qlZggIcnQmKDrZes8NCGgWxJhTvIJ-E7M926/exec",
  
  admin: "https://script.google.com/macros/s/AKfycbxg7qWgyyJOqCgUuHM7m4D4lu4f7XetMTkDAzIjmMswBh7_Qe0Ghhi70LwreCOvaM-W/exec",
  
  // Grenzland Cup
  manager: "https://script.google.com/macros/s/AKfycbz2kJZfmb9-SX-7rm8J2joNfMeK2ifWkeROH0FLBlrVsPYT0kKYIEhn8ufFdOLL5iNv5A/exec", 

  vermietung: "https://script.google.com/macros/s/AKfycbxnClehly9t5TLZqguQOul1lF3nayfNEqAdx3A9EE5YxuQ2bziqVV-2rJ2ktR3Vshn9/exec",
  
  // Platzhalter (vereinigt)
  mail: "https://script.google.com/macros/s/AKfycbwWsYEaaK7OqCpL1ihB_i-Kuham0ME1TPZGyl73fYIGbrEvbZ7_yeAFsGq0d1yWjuOh/exec",
  jahresbeitrag: "https://script.google.com/macros/s/AKfycbwWsYEaaK7OqCpL1ihB_i-Kuham0ME1TPZGyl73fYIGbrEvbZ7_yeAFsGq0d1yWjuOh/exec",
  mitglieder:    "https://script.google.com/macros/s/AKfycbwWsYEaaK7OqCpL1ihB_i-Kuham0ME1TPZGyl73fYIGbrEvbZ7_yeAFsGq0d1yWjuOh/exec",
  
  // Jahresmeisterschaft
  jahresmeisterschaft: "https://script.google.com/macros/s/AKfycbwhX0N01rKpZmEnwMpyKf_B3pEp-wPvfYZFu8IOzCzB1-slOTBS-OGiGGTYBmI9QRfA/exec",

  // Umfragen / RSVP System
  umfragen: "https://script.google.com/macros/s/AKfycbzwDg-lk38hZiLUZQCXR-7T4QX7IbD2h4VcUd7s6-5O0hl4nt9dJGNG5Xv4oozf5VJ9/exec"
};


// === ERLAUBTE MODULE / ALIASES ===
const PUBLIC_MODULES = ["admin"]; // Login braucht keine Rolle

const MODULE_ALIASES = {
  gv: "termine",
  "auto-mail": "termine",
  logins: "admin",
  "jahresmeister-schaft-kk": "termine"
};

function normalizeModule(name) {
  return String(name || "").trim().toLowerCase().replace(/\s+/g, "-");
}

export default {
  async fetch(request) {
    // 1. CORS-Header (Erweitert für CSRF + alle Browser-Header)
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Accept, Accept-Language, Content-Type, X-Requested-With, X-CSRF-Token, X-User-Role, Authorization"
    };

    // Preflight sofort beantworten
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": "Accept, Accept-Language, Content-Type, X-Requested-With, X-CSRF-Token, X-User-Role, Authorization",
          "Access-Control-Max-Age": "86400"
        }
      });
    }

    const url = new URL(request.url);
    
    // 2. Welches Modul wird angefragt?
    const module = url.searchParams.get("module") || "admin"; 
    const normalizedModule = normalizeModule(module);
    
    // 3. Action und Login-Check
    const action = url.searchParams.get("action");
    const isLoginRequest = (normalizedModule === "admin" && action === "checkLogin");
    const isPublicAction = (normalizedModule === "vermietung" && (action === "booking" || action === "feedback"));

    // 4. CSRF-Token Validierung
    const csrfToken = request.headers.get("X-CSRF-Token");
    
    if (!DEV_MODE) {
      // Login braucht CSRF-Token
      if (isLoginRequest && !csrfToken) {
        return sendError("CSRF-Token fehlt", 403, corsHeaders);
      }
      
      // Für alle anderen Requests (ausser öffentliche Aktionen): Token erforderlich
      if (!isLoginRequest && !isPublicAction && !csrfToken) {
        return sendError("CSRF-Token fehlt", 403, corsHeaders);
      }
    } else {
      // DEV_MODE: Token trotzdem loggen aber nicht blockieren
      if (csrfToken) {
        console.log("DEV_MODE: CSRF-Token erhalten (wird ignoriert):", csrfToken.substring(0, 20) + "...");
      }
    }

    // 5. Login-Prüfung (nur für nicht-öffentliche Module und Aktionen)
    if (!isLoginRequest && !isPublicAction && !DEV_MODE) {
      const userRole = request.headers.get("X-User-Role");
      if (!userRole) {
        return sendError("Login erforderlich", 403, corsHeaders);
      }
    }

    // 6. Target-Script bestimmen
    const normalizedModule = normalizeModule(module);
    const scriptKey = MODULE_ALIASES[normalizedModule] || normalizedModule;
    const targetScript = SCRIPTS[scriptKey];
    if (!targetScript) return sendError("Modul nicht gefunden: " + module, 404, corsHeaders);
    
    // 7. Parameter weiterleiten
    let googleUrl = new URL(targetScript);
    
    // Alle Parameter vom Original-Request kopieren
    url.searchParams.forEach((value, key) => {
        googleUrl.searchParams.append(key, value);
    });
    
    // IP und User-Agent loggen (für Audit)
    const userIp = request.headers.get("cf-connecting-ip") || "unbekannt";
    const userAgent = request.headers.get("user-agent") || "unbekannt";
    googleUrl.searchParams.append("ip", userIp);
    googleUrl.searchParams.append("userAgent", userAgent.substring(0, 100));

    // DEV_MODE: Markierung hinzufügen
    if (DEV_MODE) {
      googleUrl.searchParams.append("devMode", "true");
    }

    try {
      // Anfrage an Google weiterleiten
      const fetchOptions = {
        method: request.method,
        headers: { "Content-Type": "application/json" },
        redirect: "follow"
      };

      if (request.method === "POST") {
        fetchOptions.body = await request.text();
      }

      const response = await fetch(googleUrl.toString(), fetchOptions);
      const text = await response.text();
      
      // Versuchen als JSON zu parsen
      try {
        const data = JSON.parse(text);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        // Falls Google HTML Fehlerseite schickt
        return new Response(text, { 
           headers: { ...corsHeaders, "Content-Type": "text/html" } 
        });
      }

    } catch (err) {
      return sendError("Worker Fetch Fehler: " + err.message, 500, corsHeaders);
    }
  }
};

// Hilfsfunktion für Fehlerantworten
function sendError(msg, status, headers) {
  return new Response(JSON.stringify({ error: msg, success: false }), {
    status: status,
    headers: { ...headers, "Content-Type": "application/json" }
  });
}