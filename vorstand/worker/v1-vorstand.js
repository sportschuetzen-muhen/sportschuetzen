/**
 * ZENTRALER API-WORKER (Sportschützen Muhen)
 * Verbindet Inventar, Termine, GV, Login, Rechnungen und Buchhaltung in einer API.
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
  jahresbeitrag: "https://script.google.com/macros/s/AKfycbyiJBjqfLWYuQeY89s2lKS4DoI6UY45uVAIImTK8vHzhTbDLyKFwcL6RYOrWatMdA8A/exec",
  mitglieder:    "https://script.google.com/macros/s/AKfycbyiJBjqfLWYuQeY89s2lKS4DoI6UY45uVAIImTK8vHzhTbDLyKFwcL6RYOrWatMdA8A/exec",
  
  // Jahresmeisterschaft
  jahresmeisterschaft: "https://script.google.com/macros/s/AKfycbwhX0N01rKpZmEnwMpyKf_B3pEp-wPvfYZFu8IOzCzB1-slOTBS-OGiGGTYBmI9QRfA/exec",

  // Umfragen / RSVP System
  umfragen: "https://script.google.com/macros/s/AKfycbzwDg-lk38hZiLUZQCXR-7T4QX7IbD2h4VcUd7s6-5O0hl4nt9dJGNG5Xv4oozf5VJ9/exec",

  // Rechnungs-Engine (Jahresbeiträge, Vermietungen, Sponsoren)
  rechnungen: "https://script.google.com/macros/s/AKfycbwUxiK9LibWZ01mfeEw-C1QtzGlfH2l9f7LVfgSzUeVOcSipt-K0njnN0XRA-bdKBeL/exec",

  // Doppelte Buchhaltung
  buchhaltung: "https://script.google.com/macros/s/AKfycbyuGmNadHzSJQXGKK2tVUzLvmGD4-gKNi8D82KkPIexLaDTDJR-XBbyM-Nir7KSzCDn/exec"
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
  async fetch(request, env) {
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
    
    // ⚠️ WICHTIG FÜR ÖFFENTLICHE VERMIETUNG (UMGEHT LOGIN & CSRF FÜR DIESE AKTIONEN)
    const isPublicAction = (normalizedModule === "vermietung" && (action === "booking" || action === "feedback"));

    // 4. CSRF-Token Validierung & API-Key Prüfung
    const csrfToken = request.headers.get("X-CSRF-Token");
    const apiKey = request.headers.get("X-API-Key");
    const isApiAuthorized = (apiKey === "SportschuetzenMuhenArchiv2026");
    
    if (!DEV_MODE && !isApiAuthorized) {
      // Login braucht CSRF-Token
      if (isLoginRequest && !csrfToken) {
        return sendError("CSRF-Token fehlt", 403, corsHeaders);
      }
      
      // Für alle anderen Requests (ausser öffentliche Aktionen): Token erforderlich
      if (!isLoginRequest && !isPublicAction && !csrfToken) {
        return sendError("CSRF-Token fehlt", 403, corsHeaders);
      }
    } else {
      // DEV_MODE oder API-Key autorisiert: Token trotzdem loggen aber nicht blockieren
      if (csrfToken) {
        console.log("CSRF-Token erhalten (wird ignoriert):", csrfToken.substring(0, 20) + "...");
      }
    }

    // 5. Login-Prüfung (nur für nicht-öffentliche Module und Aktionen)
    if (!isLoginRequest && !isPublicAction && !DEV_MODE && !isApiAuthorized) {
      const userRole = request.headers.get("X-User-Role");
      if (!userRole) {
        return sendError("Login erforderlich", 403, corsHeaders);
      }
    }

    // === 5.5 NATIVES MODUL: Archiv-KI ===
    if (normalizedModule === "archiv") {
      return await handleArchivRoutes(request, env, corsHeaders);
    }

    // === 5.6 NATIVES MODUL: News-KI ===
    if (normalizedModule === "news") {
      return await handleNewsRoutes(request, env, corsHeaders);
    }

    // === 5.7 NATIVES MODUL: Gesichtserkennung ===
    if (normalizedModule === "faces") {
      return await handleFacesRoutes(request, env, corsHeaders);
    }

    // === 5.8 NATIVES MODUL: Resultate KI OCR ===
    if (normalizedModule === "resultate") {
      return await handleResultateKiRoutes(request, env, corsHeaders);
    }

    // 6. Target-Script bestimmen
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

// === NATIVE PROTOKOLL-ARCHIV ROUTES ===
async function handleArchivRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  // C. Google Drive PDF-Link abrufen
  if (action === "getPdfLink") {
    try {
      const filename = url.searchParams.get("filename");
      if (!filename) {
        return new Response(JSON.stringify({ error: "filename ist erforderlich", success: false }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Weiterleitung an das Google Apps Script mit Drive-Rechten
      const targetScript = SCRIPTS.admin;
      const googleUrl = new URL(targetScript);
      googleUrl.searchParams.append("action", "getPdfLink");
      googleUrl.searchParams.append("filename", filename);

      const response = await fetch(googleUrl.toString(), { redirect: "follow" });
      const text = await response.text();
      
      try {
        const data = JSON.parse(text);
        return new Response(JSON.stringify(data), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (e) {
        return new Response(text, { 
           headers: { ...corsHeaders, "Content-Type": "text/html" } 
        });
      }
    } catch (err) {
      return new Response(JSON.stringify({ error: "Fehler beim Weiterleiten an Drive: " + err.message, success: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // A. Dokumenten-Import (Ingestion)
  if (action === "ingest" && request.method === "POST") {
    try {
      const { documentName, date, category, text } = await request.json();

      if (!text || !documentName) {
        return new Response(JSON.stringify({ error: "Text und documentName sind erforderlich", success: false }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      const chunks = splitTextIntoChunks(text, 500);
      const insertOperations = [];

      for (let i = 0; i < chunks.length; i++) {
        const chunkText = chunks[i];
        const chunkId = `${category || "vorstand"}_${(date || "unknown").replace(/-/g, "")}_chunk_${i}_${Date.now()}`;

        // 1. Embedding mit Workers AI erzeugen (Dimension 1024)
        const embeddingResponse = await env.AI.run("@cf/baai/bge-m3", {
          text: [chunkText]
        });
        const vector = embeddingResponse.data[0];

        // 2. D1-Daten vorbereiten (Vektor wird als JSON-String gespeichert)
        insertOperations.push(
          env.DB.prepare(
            "INSERT OR REPLACE INTO protocol_chunks (id, document_name, protocol_date, category, content, chunk_index, embedding) VALUES (?, ?, ?, ?, ?, ?, ?)"
          ).bind(chunkId, documentName, date || "", category || "vorstand", chunkText, i, JSON.stringify(vector))
        );
      }

      // 3. Texte und Vektoren gesammelt in D1 wegspeichern
      if (insertOperations.length > 0) {
        await env.DB.batch(insertOperations);
      }

      return new Response(JSON.stringify({ 
        success: true, 
        message: `${chunks.length} Abschnitte erfolgreich in D1 indexiert und gespeichert.` 
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Ingest-Fehler: " + err.message, success: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // B. Frage stellen (RAG Query mit In-Memory Vektorsuche)
  if (action === "ask" && request.method === "POST") {
    try {
      const { question } = await request.json();

      if (!question) {
        return new Response(JSON.stringify({ error: "Frage ist erforderlich", success: false }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 1. Frage vektorisieren
      const questionEmbedding = await env.AI.run("@cf/baai/bge-m3", {
        text: [question]
      });
      const questionVector = questionEmbedding.data[0];

      // 2. Alle Passagen und deren Vektoren aus D1 laden
      const { results } = await env.DB.prepare(
        "SELECT id, content, document_name, protocol_date, embedding FROM protocol_chunks"
      ).all();

      if (!results || results.length === 0) {
        return new Response(JSON.stringify({
          success: true,
          answer: "Es wurden noch keine Protokolle im Archiv hinterlegt. Bitte lade zuerst Protokolle hoch.",
          sources: []
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 3. Cosinus-Ähnlichkeit im Arbeitsspeicher berechnen
      const matches = [];
      for (const row of results) {
        if (!row.embedding) continue;
        
        try {
          const rowVector = JSON.parse(row.embedding);
          const similarity = cosineSimilarity(questionVector, rowVector);
          matches.push({
            id: row.id,
            content: row.content,
            document_name: row.document_name,
            protocol_date: row.protocol_date,
            similarity: similarity
          });
        } catch (e) {
          // Ignorieren bei parsing-Fehlern
        }
      }

      // Sortieren nach Ähnlichkeit (höchste zuerst)
      matches.sort((a, b) => b.similarity - a.similarity);

      // Top 4 Matches nehmen
      const topMatches = matches.slice(0, 4);

      // Falls die Ähnlichkeit der besten Ergebnisse zu gering ist (< 0.2)
      if (topMatches.length === 0 || topMatches[0].similarity < 0.2) {
        return new Response(JSON.stringify({
          success: true,
          answer: "Ich konnte in den Protokollen leider keine hinreichend relevanten Informationen zu deiner Frage finden.",
          sources: []
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // Kontext zusammenstellen
      const context = topMatches.map(row => 
        `[Quelle: ${row.document_name} vom ${row.protocol_date || "unbekannt"}] (Relevanz: ${Math.round(row.similarity * 100)}%)\n${row.content}`
      ).join("\n\n---\n\n");

      // 4. LLM-Prompt für Llama 3 formulieren
      const systemPrompt = `Du bist die intelligente Archiv-KI der Sportschützen Muhen. 
Deine Aufgabe ist es, Fragen basierend ausschliesslich auf den bereitgestellten Protokoll-Ausschnitten (Vorstand & Generalversammlung) sachlich, freundlich und präzise auf Deutsch zu beantworten.
Nenne am Ende deiner Antwort stichwortartig die Dokumente, aus denen du die Informationen hast (Quellenangabe).
Wenn die bereitgestellten Informationen die Frage nicht beantworten können, sage höflich, dass du dazu keine Informationen in den Protokollen finden konntest. Halluziniere keine Fakten.`;

      const userPrompt = `KONTEXT AUS VEREINSPROTOKOLLEN:\n${context}\n\nFRAGE: ${question}`;

      const chatResponse = await env.AI.run("@cf/meta/llama-3.2-3b-instruct", {
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ]
      });

      const answer = chatResponse.response || "Entschuldigung, bei der Generierung der Antwort gab es ein Problem.";
      
      // Detaillierte Quellen für das Frontend aufbereiten
      const sourcesList = topMatches.map(r => ({
        document_name: r.document_name,
        protocol_date: r.protocol_date || "unbekannt",
        content: r.content,
        similarity: r.similarity
      }));

      return new Response(JSON.stringify({
        success: true,
        answer: answer,
        sources: sourcesList
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: "Abfrage-Fehler: " + err.message, success: false }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ error: "Aktion nicht gefunden", success: false }), {
    status: 404,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
}

// Hilfsfunktion: Cosinus-Ähnlichkeit zwischen zwei Vektoren berechnen
function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0.0;
  let normA = 0.0;
  let normB = 0.0;
  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }
  if (normA === 0.0 || normB === 0.0) return 0.0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// Hilfsfunktion zum Splitten von Texten
function splitTextIntoChunks(text, chunkSize = 500) {
  const paragraphs = text.split(/\n+/);
  const chunks = [];
  let currentChunk = "";

  for (const paragraph of paragraphs) {
    if ((currentChunk + "\n" + paragraph).length > chunkSize) {
      if (currentChunk.trim().length > 0) chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk = currentChunk ? currentChunk + "\n" + paragraph : paragraph;
    }
  }
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  return chunks;
}

// === NATIVE NEWS-KI ROUTES ===
async function handleNewsRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method !== 'POST' && action !== 'list_models') {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST.", success: false }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    // --- AKTION: MODELLE ABRUFEN ---
    if (action === 'list_models') {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY fehlt in der Server-Konfiguration.");
      }
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google API Error: ${text}`);
      }
      const data = await res.json();
      const filtered = (data.models || [])
        .filter(m => m.supportedGenerationMethods && 
                     m.supportedGenerationMethods.includes('generateContent') && 
                     m.name.includes('gemini') && 
                     !m.name.includes('gemini-1.5') && 
                     !m.name.includes('gemini-1.0'))
        .map(m => ({
          name: m.name.replace('models/', ''),
          displayName: m.displayName,
          description: m.description
        }));
      return new Response(JSON.stringify({ success: true, models: filtered }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const data = await request.json();
    const { title, keywords, author, images, html, pdfData, model } = data;

    // --- AKTION: TEXT GENERIEREN (ENTWURF) ---
    if (action === 'generate') {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY fehlt in der Server-Konfiguration.");
      }
      let imageInstruction = "";
      if (images && Array.isArray(images) && images.length > 0) {
        imageInstruction = " Ein passendes Foto des Ereignisses ist ebenfalls als Kontext beigefügt. Analysiere das Bild und beziehe dessen visuellen Inhalt (z. B. die gezeigten Personen, die Stimmung, Auszeichnungen oder das Motiv) harmonisch und lebendig in den Bericht mit ein (beschreibe jedoch nicht plump, dass ein Foto existiert, sondern integriere die Bildinhalte direkt in deine Erzählung).";
      }

      let geminiPayload = {
        contents: [{
          parts: [
            { text: `Du bist der Medienverantwortliche des Vereins 'Sportschützen Muhen'. Schreibe einen spannenden, professionellen Bericht über folgendes Ereignis: ${keywords}.${imageInstruction} Formatiere den Bericht in HTML (nutze <p>, <strong>, <br>, <ul> etc. für Struktur). Schreibe KEIN <html>, <head> oder <body> Tag, nur den Inhalt. Erfinde nichts völlig Abwegiges, bleib bei den Fakten aus den Stichworten, aber schreibe flüssig und begeisternd.` }
          ]
        }]
      };

      // Wenn Bilder vorhanden sind, das erste als Kontext an Gemini schicken
      if (images && Array.isArray(images) && images.length > 0) {
        const firstImg = images[0];
        if (firstImg && firstImg.includes('base64,')) {
          geminiPayload.contents[0].parts.push({
            inline_data: {
              mime_type: "image/jpeg",
              data: firstImg.split('base64,')[1]
            }
          });
        }
      }

      const selectedModel = (model && /^gemini-[a-zA-Z0-9.\-_]+$/.test(model)) ? model : 'gemini-2.5-flash';

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        if (geminiRes.status === 429 || errText.includes("quota") || errText.includes("Quota exceeded") || errText.includes("RESOURCE_EXHAUSTED")) {
          throw new Error('QUOTA_EXCEEDED');
        }
        throw new Error(`Gemini API Error: ${errText}`);
      }

      const geminiData = await geminiRes.json();
      const generatedHtml = geminiData.candidates[0].content.parts[0].text;

      return new Response(JSON.stringify({ success: true, html: generatedHtml }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- AKTION: PDF TEXT EXTRAHIEREN ---
    if (action === 'extract_pdf') {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY fehlt in der Server-Konfiguration.");
      }
      if (!pdfData) {
        throw new Error("Keine PDF-Daten übergeben.");
      }

      let geminiPayload = {
        contents: [{
          parts: [
            { text: "Bitte extrahiere den gesamten Text aus diesem PDF. Achte auf Umlaute. Suche ausserdem das Datum der Sitzung/des Protokolls. WICHTIG: Antworte ausschliesslich mit einem gültigen JSON-Objekt, das exakt zwei Keys hat: 'text' (der extrahierte Text) und 'date' (das gefundene Datum im Format YYYY-MM-DD, oder null falls keines gefunden wurde)." },
            {
              inline_data: {
                mime_type: "application/pdf",
                data: pdfData
              }
            }
          ]
        }]
      };

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });

      if (!geminiRes.ok) {
        const err = await geminiRes.text();
        throw new Error(`Gemini API Error (PDF Extraction): ${err}`);
      }

      const geminiData = await geminiRes.json();
      let jsonString = geminiData.candidates[0].content.parts[0].text;
      
      jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
      
      let extractedText = "";
      let extractedDate = null;
      
      try {
        const parsed = JSON.parse(jsonString);
        extractedText = parsed.text;
        extractedDate = parsed.date;
      } catch(e) {
        extractedText = jsonString;
      }

      return new Response(JSON.stringify({ success: true, text: extractedText, date: extractedDate }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- AKTION: DEFINITIV PUBLIZIEREN ---
    if (action === 'publish') {
      if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
        throw new Error("Server-Konfiguration fehlt (GITHUB_TOKEN, GITHUB_REPO)");
      }
      if (!html) {
        throw new Error("Kein HTML-Inhalt zum Publizieren übergeben.");
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const newReport = {
        id: `report_${timestamp}`,
        title: title,
        author: author || 'Vorstand',
        date: new Date().toISOString(),
        content: html,
        imageUrls: [] 
      };

      const githubHeaders = {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Sportschuetzen-Worker'
      };

      // Bilder zu GitHub hochladen (falls vorhanden)
      if (images && Array.isArray(images)) {
        let imageCounter = 0;
        for (const img of images) {
          if (img && img.includes('base64,')) {
            const base64Data = img.split('base64,')[1];
            const imagePath = `img/reports/${timestamp}_${imageCounter}.jpg`;
            newReport.imageUrls.push(imagePath);

            await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${imagePath}`, {
              method: 'PUT',
              headers: githubHeaders,
              body: JSON.stringify({
                message: `Upload report image ${timestamp}_${imageCounter}`,
                content: base64Data
              })
            });
            imageCounter++;
          }
        }
      }

      // berichte.json abrufen
      const jsonPath = 'data/berichte.json';
      let existingBerichte = [];
      let fileSha = null;

      const getJsonRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${jsonPath}`, {
        headers: githubHeaders
      });

      if (getJsonRes.ok) {
        const fileData = await getJsonRes.json();
        fileSha = fileData.sha;
        const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
        try {
          existingBerichte = JSON.parse(decodedContent);
        } catch (e) {
          console.log("Could not parse existing berichte.json, starting fresh.");
        }
      }

      existingBerichte.unshift(newReport); 
      
      if (existingBerichte.length > 50) {
        existingBerichte = existingBerichte.slice(0, 50);
      }

      const updatedJsonBase64 = btoa(unescape(encodeURIComponent(JSON.stringify(existingBerichte, null, 2))));
      
      const putJsonRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${jsonPath}`, {
        method: 'PUT',
        headers: githubHeaders,
        body: JSON.stringify({
          message: `Auto-publish report: ${title}`,
          content: updatedJsonBase64,
          sha: fileSha 
        })
      });

      if (!putJsonRes.ok) {
        const err = await putJsonRes.text();
        throw new Error(`GitHub JSON Update Error: ${err}`);
      }

      const plainText = stripHtml(html);
      const socialLog = [];

      // Facebook-Post erstellen, falls konfiguriert
      if (env.META_ACCESS_TOKEN && env.FACEBOOK_PAGE_ID) {
        try {
          const branch = env.GITHUB_BRANCH || 'main';
          const isPhoto = newReport.imageUrls.length > 0;
          const fbUrl = isPhoto 
            ? `https://graph.facebook.com/v19.0/${env.FACEBOOK_PAGE_ID}/photos`
            : `https://graph.facebook.com/v19.0/${env.FACEBOOK_PAGE_ID}/feed`;

          const fbBody = {
            access_token: env.META_ACCESS_TOKEN
          };
          if (isPhoto) {
            fbBody.url = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${branch}/${newReport.imageUrls[0]}`;
            fbBody.caption = `${title}\n\n${plainText}`;
          } else {
            fbBody.message = `${title}\n\n${plainText}`;
          }

          const fbRes = await fetch(fbUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fbBody)
          });

          const fbTextRes = await fbRes.text();
          if (!fbRes.ok) {
            let errMsg = fbTextRes;
            try {
              const parsed = JSON.parse(fbTextRes);
              if (parsed.error && parsed.error.message) {
                errMsg = parsed.error.message;
              }
            } catch (e) {}
            socialLog.push(`Facebook: Fehler - ${errMsg}`);
          } else {
            socialLog.push("Facebook: Erfolgreich publiziert");
          }
        } catch (err) {
          socialLog.push(`Facebook: Verbindungsfehler - ${err.message}`);
        }
      }

      // Instagram-Post erstellen, falls konfiguriert und ein Bild vorhanden ist
      if (env.META_ACCESS_TOKEN && env.INSTAGRAM_BUSINESS_ID) {
        if (newReport.imageUrls.length > 0) {
          try {
            const branch = env.GITHUB_BRANCH || 'main';
            const publicImgUrl = `https://raw.githubusercontent.com/${env.GITHUB_REPO}/${branch}/${newReport.imageUrls[0]}`;

            // 1. Container erstellen
            const igContainerRes = await fetch(`https://graph.facebook.com/v19.0/${env.INSTAGRAM_BUSINESS_ID}/media`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                image_url: publicImgUrl,
                caption: `${title}\n\n${plainText}`,
                access_token: env.META_ACCESS_TOKEN
              })
            });

            const igContainerText = await igContainerRes.text();
            if (!igContainerRes.ok) {
              let errMsg = igContainerText;
              try {
                const parsed = JSON.parse(igContainerText);
                if (parsed.error && parsed.error.message) {
                  errMsg = parsed.error.message;
                }
              } catch (e) {}
              socialLog.push(`Instagram: Container-Fehler - ${errMsg}`);
            } else {
              const igContainerData = JSON.parse(igContainerText);
              const creationId = igContainerData.id;

              // 2. Veröffentlichen
              const igPublishRes = await fetch(`https://graph.facebook.com/v19.0/${env.INSTAGRAM_BUSINESS_ID}/media_publish`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  creation_id: creationId,
                  access_token: env.META_ACCESS_TOKEN
                })
              });

              const igPublishText = await igPublishRes.text();
              if (!igPublishRes.ok) {
                let errMsg = igPublishText;
                try {
                  const parsed = JSON.parse(igPublishText);
                  if (parsed.error && parsed.error.message) {
                    errMsg = parsed.error.message;
                  }
                } catch (e) {}
                socialLog.push(`Instagram: Veröffentlichungs-Fehler - ${errMsg}`);
              } else {
                socialLog.push("Instagram: Erfolgreich publiziert");
              }
            }
          } catch (err) {
            socialLog.push(`Instagram: Verbindungsfehler - ${err.message}`);
          }
        } else {
          socialLog.push("Instagram: Übersprungen (kein Bild vorhanden)");
        }
      }

      return new Response(JSON.stringify({ success: true, message: 'Bericht publiziert!', socialLog: socialLog }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error("Unbekannte Aktion für Modul news.");
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// === NATIVE GALERIE-FACES ROUTES ===
async function handleFacesRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST.", success: false }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const githubHeaders = {
      'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'User-Agent': 'Sportschuetzen-Worker'
    };
    const jsonPath = 'data/face-models.json';

    // --- AKTION: GESICHTER LADEN ---
    if (action === 'get') {
      if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
        throw new Error("Server-Konfiguration fehlt (GITHUB_TOKEN, GITHUB_REPO)");
      }

      const getJsonRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${jsonPath}`, {
        headers: githubHeaders
      });

      if (!getJsonRes.ok) {
        return new Response(JSON.stringify({ success: true, faces: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }

      const fileData = await getJsonRes.json();
      const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
      
      return new Response(decodedContent, {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // --- AKTION: GESICHTER SPEICHERN ---
    if (action === 'save') {
      if (!env.GITHUB_TOKEN || !env.GITHUB_REPO) {
        throw new Error("Server-Konfiguration fehlt (GITHUB_TOKEN, GITHUB_REPO)");
      }

      const data = await request.json();
      const { faces } = data;
      if (!faces) throw new Error("Keine Gesichter zum Speichern übergeben.");

      let fileSha = null;
      const getJsonRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${jsonPath}`, {
        headers: githubHeaders
      });

      if (getJsonRes.ok) {
        const fileData = await getJsonRes.json();
        fileSha = fileData.sha;
      }

      const updatedJsonBase64 = btoa(unescape(encodeURIComponent(JSON.stringify({ success: true, faces: faces }, null, 2))));
      
      const putJsonRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${jsonPath}`, {
        method: 'PUT',
        headers: githubHeaders,
        body: JSON.stringify({
          message: `Update face recognition models`,
          content: updatedJsonBase64,
          sha: fileSha 
        })
      });

      if (!putJsonRes.ok) {
        const err = await putJsonRes.text();
        throw new Error(`GitHub Face-Models Update Error: ${err}`);
      }

      return new Response(JSON.stringify({ success: true, message: 'Gesichter erfolgreich gespeichert!' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    throw new Error("Unbekannte Aktion für Modul faces.");
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

// === NATIVE RESULTATE-KI OCR ROUTES ===
async function handleResultateKiRoutes(request, env, corsHeaders) {
  const url = new URL(request.url);
  const action = url.searchParams.get("action");

  if (request.method !== 'POST' && action !== 'list_models') {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST.", success: false }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    if (action === 'list_models') {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY fehlt in der Server-Konfiguration.");
      }
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`Google API Error: ${text}`);
      }
      const data = await res.json();
      const filtered = (data.models || [])
        .filter(m => m.supportedGenerationMethods && 
                     m.supportedGenerationMethods.includes('generateContent') && 
                     m.name.includes('gemini') && 
                     !m.name.includes('gemini-1.5') && 
                     !m.name.includes('gemini-1.0'))
        .map(m => ({
          name: m.name.replace('models/', ''),
          displayName: m.displayName,
          description: m.description
        }));
      return new Response(JSON.stringify({ success: true, models: filtered }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'ocr_text') {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY fehlt in der Server-Konfiguration.");
      }
      
      const { image, model } = await request.json();
      if (!image) {
        throw new Error("Keine Bilddaten übergeben.");
      }

      const selectedModel = (model && /^gemini-[a-zA-Z0-9.\-_]+$/.test(model)) ? model : 'gemini-2.5-flash';

      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.includes('base64,')) {
        const parts = image.split('base64,');
        base64Data = parts[1];
        const match = parts[0].match(/data:(.*?);/);
        if (match && match[1]) {
          mimeType = match[1];
        }
      }

      const geminiPayload = {
        contents: [{
          parts: [
            { text: "Lies den gesamten Text aus diesem Bild präzise aus. Achte besonders auf Schiessergebnisse, Namen, Lizenznummern und Überschriften. Gib ausschliesslich den erkannten Text zeilenweise zurück, ohne zusätzliche Kommentare, Formatierungen oder Einleitungen." },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }]
      };

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini API Error: ${errText}`);
      }

      const geminiData = await geminiRes.json();
      if (!geminiData.candidates || geminiData.candidates.length === 0) {
        throw new Error("Keine Antwort von Gemini erhalten.");
      }
      const text = geminiData.candidates[0].content.parts[0].text;

      return new Response(JSON.stringify({ success: true, text: text }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (action === 'ocr') {
      if (!env.GEMINI_API_KEY) {
        throw new Error("GEMINI_API_KEY fehlt in der Server-Konfiguration.");
      }
      
      const { image, shooters, round, model } = await request.json();
      if (!image) {
        throw new Error("Keine Bilddaten übergeben.");
      }
      if (!shooters || !Array.isArray(shooters)) {
        throw new Error("Keine Schützenliste übergeben.");
      }

      const selectedModel = (model && /^gemini-[a-zA-Z0-9.\-_]+$/.test(model)) ? model : 'gemini-2.5-flash';

      let mimeType = "image/jpeg";
      let base64Data = image;
      if (image.includes('base64,')) {
        const parts = image.split('base64,');
        base64Data = parts[1];
        const match = parts[0].match(/data:(.*?);/);
        if (match && match[1]) {
          mimeType = match[1];
        }
      }

      const roundLabelText = round === 'r1' ? 'Runde 1' : round === 'r2' ? 'Runde 2' : 'Runde 3';

      const prompt = `Du bist ein präzises OCR-System für einen Sportschützenverein.
Deine Aufgabe ist es, Schiessergebnisse aus dem angehängten Foto auszulesen.
Hier ist die Liste unserer aktiven Schützen mit ihren IDs und Namen im System:
${shooters.map(s => `ID: "${s.id}", Name: "${s.name}"`).join("\n")}

Bitte lies die Ergebnisse auf dem Foto aus und ordne sie den Schützen in unserer Liste zu.
Finde für jeden Schützen das Ergebnis für ${roundLabelText}.

WICHTIG FÜR DIE WERTE:
- Lies ausschliesslich die Ganzpunktwertung (die Ganzzahl, z. B. 98) aus und ignoriere die Zehntelwertung (die Zahl mit Nachkommastelle, z. B. 103.0).
- Das Ergebnis MUSS eine Ganzzahl zwischen 0 und 100 sein. Ein Wert über 100 (wie 103 oder 104) ist ungültig und deutet darauf hin, dass fälschlicherweise die Zehntelwertung ausgelesen wurde.

Ordne die erkannten Namen intelligent zu, auch wenn Schreibweisen leicht abweichen (z. B. Vor- und Nachname vertauscht, Abkürzungen oder leichte Tippfehler).

WICHTIG: Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt.
Das JSON-Objekt MUSS folgendes Format haben:
{
  "ergebnisse": [
    { "id": "ID_DES_SCHUETZEN", "points": PUNKTZAHL }
  ]
}
Wenn für einen Schützen kein Ergebnis auf dem Bild gefunden wurde, nimm ihn nicht in das "ergebnisse"-Array auf.
Antworte NUR mit dem JSON-Objekt. Verwende KEINE Markdown-Formatierung wie \`\`\`json und keine Einleitung oder Erklärung.`;

      let geminiPayload = {
        contents: [{
          parts: [
            { text: prompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }]
      };

      const geminiRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${selectedModel}:generateContent?key=${env.GEMINI_API_KEY}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiPayload)
      });

      if (!geminiRes.ok) {
        const errText = await geminiRes.text();
        throw new Error(`Gemini API Error: ${errText}`);
      }

      const geminiData = await geminiRes.json();
      if (!geminiData.candidates || geminiData.candidates.length === 0) {
        throw new Error("Keine Antwort von Gemini erhalten.");
      }

      let jsonString = geminiData.candidates[0].content.parts[0].text;
      jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();

      try {
        const parsed = JSON.parse(jsonString);
        return new Response(JSON.stringify({ success: true, ergebnisse: parsed.ergebnisse || [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: "Ungültiges JSON-Format von Gemini", raw: jsonString }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    throw new Error("Unbekannte Aktion für Modul resultate.");
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, success: false }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}

function stripHtml(html) {
  if (!html) return "";
  let text = html;
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<li>/gi, '• ');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&nbsp;/g, ' ')
             .replace(/&lt;/g, '<')
             .replace(/&gt;/g, '>')
             .replace(/&amp;/g, '&')
             .replace(/&quot;/g, '"')
             .replace(/&apos;/g, "'")
             .replace(/&auml;/g, 'ä')
             .replace(/&Auml;/g, 'Ä')
             .replace(/&ouml;/g, 'ö')
             .replace(/&Ouml;/g, 'Ö')
             .replace(/&uuml;/g, 'ü')
             .replace(/&Uuml;/g, 'Ü')
             .replace(/&szlig;/g, 'ß');
  return text.replace(/\n{3,}/g, '\n\n').trim();
}