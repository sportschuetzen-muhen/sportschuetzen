export default {
    async fetch(request, env, ctx) {
        // 1. Handle CORS (Allow frontend to call this API)
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                },
            });
        }

        if (request.method !== 'POST') {
            return new Response('Method not allowed', { status: 405 });
        }

        try {
            const data = await request.json();
            // Erwartete Felder je nach Action
            const { action, title, keywords, author, images, html, pdfData, model } = data; 

            if (!env.GEMINI_API_KEY || !env.GITHUB_TOKEN || !env.GITHUB_REPO) {
                throw new Error("Server-Konfiguration fehlt (GEMINI_API_KEY, GITHUB_TOKEN, GITHUB_REPO)");
            }

            // --- AKTION: TEXT GENERIEREN (ENTWURF) ---
            if (action === 'generate') {
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

                const allowedModels = ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-2.5-pro', 'gemini-3.5-flash', 'gemini-3.1-flash-lite'];
                const selectedModel = allowedModels.includes(model) ? model : 'gemini-2.5-flash';

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

                // Gib nur das HTML zurück (kein Upload)
                return new Response(JSON.stringify({ success: true, html: generatedHtml }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }

            // --- AKTION: PDF TEXT EXTRAHIEREN ---
            if (action === 'extract_pdf') {
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
                
                // Entferne Markdown-Code-Blöcke falls die KI sie hinzufügt (```json ... ```)
                jsonString = jsonString.replace(/^```json\s*/, '').replace(/\s*```$/, '').trim();
                
                let extractedText = "";
                let extractedDate = null;
                
                try {
                    const parsed = JSON.parse(jsonString);
                    extractedText = parsed.text;
                    extractedDate = parsed.date;
                } catch(e) {
                    // Fallback falls die KI wider Erwarten kein sauberes JSON liefert
                    extractedText = jsonString;
                }

                return new Response(JSON.stringify({ success: true, text: extractedText, date: extractedDate }), {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }

            // --- AKTION: DEFINITIV PUBLIZIEREN ---
            if (action === 'publish') {
                if (!html) {
                    throw new Error("Kein HTML-Inhalt zum Publizieren übergeben.");
                }

                const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                const newReport = {
                    id: `report_${timestamp}`,
                    title: title,
                    author: author || 'Vorstand',
                    date: new Date().toISOString(),
                    content: html, // Das manuell bearbeitete HTML aus dem Entwurf
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
                            newReport.imageUrls.push(imagePath); // Pfad ohne 'frontend/' speichern

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
                const jsonPath = 'data/berichte.json'; // Kein frontend/ Präfix!
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

                // Bericht hinzufügen und speichern
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
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }

            // --- AKTION: GESICHTER LADEN (Langzeitgedächtnis) ---
            if (action === 'get_faces') {
                const jsonPath = 'data/face-models.json';
                const githubHeaders = {
                    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Sportschuetzen-Worker'
                };

                const getJsonRes = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/contents/${jsonPath}`, {
                    headers: githubHeaders
                });

                if (!getJsonRes.ok) {
                    // Falls die Datei noch nicht existiert (404), leeres Array zurückgeben
                    return new Response(JSON.stringify({ success: true, faces: [] }), {
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*',
                        },
                    });
                }

                const fileData = await getJsonRes.json();
                const decodedContent = decodeURIComponent(escape(atob(fileData.content.replace(/\n/g, ''))));
                
                return new Response(decodedContent, {
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }

            // --- AKTION: GESICHTER SPEICHERN ---
            if (action === 'save_faces') {
                const { faces } = data;
                if (!faces) throw new Error("Keine Gesichter zum Speichern übergeben.");

                const jsonPath = 'data/face-models.json';
                const githubHeaders = {
                    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
                    'Accept': 'application/vnd.github.v3+json',
                    'User-Agent': 'Sportschuetzen-Worker'
                };

                // Zuerst SHA holen (für Update nötig)
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
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                    },
                });
            }

            throw new Error("Unbekannte Aktion übergeben.");

        } catch (error) {
            console.error("Worker Error:", error.message);
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    },
};

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