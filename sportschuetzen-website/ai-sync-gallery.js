const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const question = (query) => new Promise((resolve) => rl.question(query, resolve));

// Paths
const frontendDir = path.join(__dirname, 'frontend');
const assetsGalerieDir = path.join(frontendDir, 'assets', 'galerie');
const assetsReferenzenDir = path.join(frontendDir, 'assets', 'referenzen');
const galerieJsonPath = path.join(frontendDir, 'data', 'galerie.json');
const wranglerTomlPath = path.join(__dirname, 'backend-worker', 'wrangler.toml');

// Try to extract Gemini API Key from wrangler.toml or process.env
function getApiKey() {
    if (process.env.GEMINI_API_KEY) {
        return process.env.GEMINI_API_KEY;
    }
    if (fs.existsSync(wranglerTomlPath)) {
        const content = fs.readFileSync(wranglerTomlPath, 'utf8');
        // Search for GEMINI_API_KEY = "key" (uncommented or commented)
        const match = content.match(/(?:#\s*)?GEMINI_API_KEY\s*=\s*["']([^"']+)["']/);
        if (match && match[1] && !match[1].includes('your_gemini_api_key')) {
            return match[1];
        }
    }
    return null;
}

const promptText = `
Du bist eine hochentwickelte Bild-KI für den Schiesssportverein 'Sportschützen Muhen'.
Analysiere das beigefügte Foto und generiere Metadaten für unsere Vereinsgalerie.

Hier sind die bekannten Personen unseres Vereins als Referenz für die Gesichtserkennung / Zuordnung:
- Simon Hediger (Präsident, junger bis mittlerer Mann)
- Daniel Hunziker (Vizepräsident & Kassier, mittleres Alter)
- Andrea Rossi (Juniorenleiter Gewehr 50m)
- Marco Fischer (Schützenmeister Gewehr 50m)
- Olivia Rossi (Schützenmeisterin Gewehr 50m)
- Beat Augsburger (Mitgliederverwalter)
- Gerhard Künzli (Nachwuchs-Legende, älterer Herr)
- Christiane Keller (Juniorenausbildnerin)

Versuche, diese Personen auf dem Foto zu identifizieren. Wenn keine der bekannten Personen erkennbar ist (z.B. weil es historische Schwarz-Weiss-Bilder sind oder andere Personen zu sehen sind), lasse das Feld 'detectedPersons' leer. Nenne NUR Personen aus der obigen Referenzliste!

Antworte mit einem validen JSON-Objekt in folgender Struktur (wichtig: nur das reine JSON zurückgeben!):
{
  "title": "Ein prägnanter, spannender deutscher Titel für das Bild (max. 6 Wörter)",
  "date": "Das geschätzte Jahr (z.B. '1981', '2016') oder ein Zeitraum (z.B. 'Herbst 2016', '1990er Jahre')",
  "category": "Eine der folgenden Kategorien: 'geschichte', 'events', 'nachwuchs'",
  "description": "Eine flüssige, spannende Beschreibung des Bildinhalts auf Deutsch (2-4 Sätze). Hebe das Vereinsleben, die Kameradschaft oder die sportliche Präzision hervor.",
  "detectedPersons": ["Name1", "Name2"], 
  "tags": ["Tag1", "Tag2"] 
}
`;

async function main() {
    console.log("\n=======================================================");
    console.log("   Sportschützen Muhen - KI Galerie Tagger & Sync      ");
    console.log("=======================================================\n");

    // 1. Get API Key
    let apiKey = getApiKey();
    if (!apiKey) {
        console.log("Es wurde kein Gemini API Key in den Umgebungsvariablen oder in backend-worker/wrangler.toml gefunden.");
        apiKey = await question("Bitte gib deinen Google Gemini API-Key ein: ");
        apiKey = apiKey.trim();
        if (!apiKey) {
            console.error("❌ Kein API-Key angegeben. Abbruch.");
            rl.close();
            return;
        }
    } else {
        console.log("🔑 Gemini API-Key erfolgreich geladen.");
    }

    // 2. Ensure directories exist
    if (!fs.existsSync(assetsGalerieDir)) {
        fs.mkdirSync(assetsGalerieDir, { recursive: true });
    }
    if (!fs.existsSync(assetsReferenzenDir)) {
        fs.mkdirSync(assetsReferenzenDir, { recursive: true });
        console.log(`Ordner für visuelle Referenzen erstellt: ${assetsReferenzenDir}`);
        console.log(`Tipp: Lege hier Portraitfotos deiner Mitglieder ab (z.B. 'simon_hediger.jpg'), damit die KI ihre Gesichter lernt!`);
    }

    // 3. Ask for Flickr source directory
    console.log("\nHinweis: Du kannst den Flickr-Download-Ordner einfach aus dem Windows-Explorer per Drag & Drop hierhin ziehen!");
    const sourceDir = await question("Pfad zum lokalen Flickr-Bilderordner (Enter zum Überspringen): ");
    
    if (sourceDir.trim()) {
        const cleanSourceDir = sourceDir.trim().replace(/^["']|["']$/g, '');
        if (fs.existsSync(cleanSourceDir)) {
            const files = fs.readdirSync(cleanSourceDir);
            let copiedCount = 0;
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                    const srcPath = path.join(cleanSourceDir, file);
                    const cleanFileName = file.toLowerCase()
                        .replace(/\s+/g, '_')
                        .replace(/[^a-z0-9_.]/g, '');
                    const destPath = path.join(assetsGalerieDir, cleanFileName);
                    fs.copyFileSync(srcPath, destPath);
                    copiedCount++;
                }
            }
            console.log(`\n✅ ${copiedCount} Bilder nach 'frontend/assets/galerie/' kopiert.`);
        } else {
            console.log(`\n⚠️ Pfad nicht gefunden: ${cleanSourceDir}. Kopieren übersprungen.`);
        }
    }

    // 4. Load existing galerie.json
    let galerieData = [];
    if (fs.existsSync(galerieJsonPath)) {
        try {
            galerieData = JSON.parse(fs.readFileSync(galerieJsonPath, 'utf8'));
        } catch (e) {
            console.error("Fehler beim Lesen der galerie.json.", e);
        }
    }

    // 5. Find new images
    const localFiles = fs.readdirSync(assetsGalerieDir);
    const existingImageUrls = new Set(galerieData.map(item => item.imageUrl));

    const newFiles = localFiles.filter(file => {
        const ext = path.extname(file).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return false;
        return !existingImageUrls.has(`assets/galerie/${file}`);
    });

    let filesToProcess = newFiles;

    if (newFiles.length === 0) {
        console.log("\n🎉 Alle Bilder im Galerie-Ordner sind bereits in der galerie.json registriert!");
        const rescan = await question("Möchtest du einen Re-Scan für Bilder durchführen, bei denen noch keine Personen markiert wurden? (ja/nein) [nein]: ");
        if (rescan.toLowerCase().startsWith('j')) {
            // Find images with no detected persons
            const imagesToRescan = galerieData.filter(item => !item.detectedPersons || item.detectedPersons.length === 0);
            filesToRescan = imagesToRescan.map(item => path.basename(item.imageUrl));
            
            if (filesToRescan.length === 0) {
                console.log("Alle Bilder haben bereits Personen-Tags! Abbruch.");
                rl.close();
                return;
            }
            console.log(`Es werden ${filesToRescan.length} Bilder neu analysiert...`);
            filesToProcess = filesToRescan;
        } else {
            rl.close();
            return;
        }
    } else {
        console.log(`\nEs wurden ${newFiles.length} neue(s) Bild(er) gefunden.`);
    }

    const startAi = await question("Möchtest du diese jetzt von der Gemini KI beschreiben und taggen lassen? (ja/nein) [ja]: ") || "ja";

    if (!startAi.toLowerCase().startsWith('j')) {
        console.log("Abgebrochen. Verwende 'node sync-gallery.js' für manuellen Import ohne KI.");
        rl.close();
        return;
    }

    console.log("\n🤖 Starte KI-Analyse... Bitte warten...");

    // Load visual reference images once for the whole run
    const referenceParts = [];
    if (fs.existsSync(assetsReferenzenDir)) {
        const refFiles = fs.readdirSync(assetsReferenzenDir);
        for (const file of refFiles) {
            const ext = path.extname(file).toLowerCase();
            if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                const filePath = path.join(assetsReferenzenDir, file);
                try {
                    const imgBuffer = fs.readFileSync(filePath);
                    const base64 = imgBuffer.toString('base64');
                    let refMime = 'image/jpeg';
                    if (file.endsWith('.png')) refMime = 'image/png';
                    if (file.endsWith('.webp')) refMime = 'image/webp';

                    // Convert filename "simon_hediger.jpg" -> "Simon Hediger"
                    const baseName = path.basename(file, path.extname(file));
                    const personName = baseName
                        .split(/[_-]+/)
                        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');

                    referenceParts.push({
                        text: `Das folgende Bild zeigt das Gesicht von: ${personName}`
                    });
                    referenceParts.push({
                        inline_data: {
                            mime_type: refMime,
                            data: base64
                        }
                    });
                } catch (e) {
                    console.error(`Fehler beim Laden des Referenzbildes ${file}:`, e.message);
                }
            }
        }
    }
    if (referenceParts.length > 0) {
        console.log(`💡 Es wurden ${referenceParts.length / 2} visuelle Referenzbilder (Gesichter) aus assets/referenzen geladen. Die KI nutzt diese für den Bildabgleich!`);
    }

    // Also load references from galerie.json marked as isAiReference
    let jsonRefCount = 0;
    for (const item of galerieData) {
        if (item.isAiReference && item.detectedPersons && item.detectedPersons.length > 0) {
            const filePath = path.join(frontendDir, item.imageUrl);
            if (fs.existsSync(filePath)) {
                try {
                    const imgBuffer = fs.readFileSync(filePath);
                    const base64 = imgBuffer.toString('base64');
                    let refMime = 'image/jpeg';
                    if (item.imageUrl.toLowerCase().endsWith('.png')) refMime = 'image/png';
                    if (item.imageUrl.toLowerCase().endsWith('.webp')) refMime = 'image/webp';

                    const personNames = item.detectedPersons.join(', ');
                    referenceParts.push({
                        text: `Das folgende Bild zeigt das Gesicht bzw. die Personen: ${personNames}`
                    });
                    referenceParts.push({
                        inline_data: {
                            mime_type: refMime,
                            data: base64
                        }
                    });
                    jsonRefCount++;
                } catch (e) {
                    console.error(`Fehler beim Laden des KI-Lernbildes ${item.imageUrl}:`, e.message);
                }
            }
        }
    }
    if (jsonRefCount > 0) {
        console.log(`🎓 Es wurden ${jsonRefCount} zusätzliche KI-Lernbilder aus der Galerie-Datenbank geladen.`);
    }

    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

    for (let i = 0; i < filesToProcess.length; i++) {
        const file = filesToProcess[i];
        const filePath = path.join(assetsGalerieDir, file);
        console.log(`\n[${i + 1}/${filesToProcess.length}] Analysiere: ${file}...`);

        try {
            // Read image and convert to base64
            const imageBuffer = fs.readFileSync(filePath);
            const base64Image = imageBuffer.toString('base64');
            let mimeType = 'image/jpeg';
            if (file.endsWith('.png')) mimeType = 'image/png';
            if (file.endsWith('.webp')) mimeType = 'image/webp';

            let success = false;
            let retryCount = 0;
            let aiMetadata = null;

            while (!success && retryCount < 5) {
                try {
                    // Construct multimodal payload parts
                    const parts = [
                        { text: promptText }
                    ];

                    // Inject visual face references if available
                    if (referenceParts.length > 0) {
                        parts.push({ text: "\n--- VISUELLE REPRÄSENTANTEN & GESICHTER ---" });
                        parts.push(...referenceParts);
                        parts.push({ text: "\n--- ZU ANALYSIERENDES BILD ---" });
                    }

                    // Add target image
                    parts.push({
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    });

                    // Call Gemini API
                    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-lite-latest:generateContent?key=${apiKey}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            contents: [{
                                parts: parts
                            }],
                            generationConfig: {
                                responseMimeType: "application/json"
                            }
                        })
                    });

                    if (!response.ok) {
                        const errText = await response.text();
                        
                        // Check for rate limits / quota issues
                        if (response.status === 429 || errText.includes('QuotaFailure') || errText.includes('RESOURCE_EXHAUSTED')) {
                            console.log(`⚠️ Rate-Limit erreicht. Warte 35 Sekunden vor einem erneuten Versuch...`);
                            await sleep(35000);
                            retryCount++;
                            continue;
                        }
                        
                        throw new Error(`Gemini API Fehler: ${response.status} - ${errText}`);
                    }

                    const resData = await response.json();
                    const rawJsonText = resData.candidates[0].content.parts[0].text;
                    aiMetadata = JSON.parse(rawJsonText.trim());
                    success = true;

                } catch (err) {
                    if (retryCount >= 4) {
                        throw err; // max retries reached
                    }
                    console.log(`⚠️ Verbindungsfehler: ${err.message}. Versuche es in 10 Sekunden erneut...`);
                    await sleep(10000);
                    retryCount++;
                }
            }

            console.log(`   ✨ Titel: "${aiMetadata.title}"`);
            console.log(`   📅 Datum/Jahr: ${aiMetadata.date}`);
            console.log(`   📁 Kategorie: ${aiMetadata.category}`);
            console.log(`   👥 Personen: ${aiMetadata.detectedPersons.length > 0 ? aiMetadata.detectedPersons.join(', ') : 'Keine erkannt'}`);
            console.log(`   🏷️ Tags: ${aiMetadata.tags.join(', ')}`);
            console.log(`   📝 Beschreibung: ${aiMetadata.description}`);

            // Add to database
            const baseName = path.basename(file, path.extname(file));
            const id = baseName.toLowerCase().replace(/[^a-z0-9]/g, '_');

            galerieData.push({
                id,
                title: aiMetadata.title,
                category: aiMetadata.category,
                date: aiMetadata.date,
                description: aiMetadata.description,
                imageUrl: `assets/galerie/${file}`,
                detectedPersons: aiMetadata.detectedPersons,
                tags: aiMetadata.tags
            });

            // Write to file incrementally to prevent data loss on crash
            fs.writeFileSync(galerieJsonPath, JSON.stringify(galerieData, null, 2), 'utf8');

            // Rate-limit prevention for Free Tier (Max 5 requests per minute -> 1 request every 12s)
            if (i < filesToProcess.length - 1) {
                console.log("⏳ Warte 12 Sekunden vor dem nächsten Bild (Rate-Limit-Schutz)...");
                await sleep(12000);
            }

        } catch (error) {
            console.error(`❌ Fehler bei der Analyse von ${file}:`, error.message);
            console.log("Bild wird übersprungen. Du kannst es später erneut versuchen.");
        }
    }

    console.log(`\n=======================================================\n`);
    console.log(`✅ Fertig! ${filesToProcess.length} Bilder wurden erfolgreich von der KI analysiert und in der galerie.json gespeichert.`);
    console.log(`Die Gesichterzuordnungen und Tags wurden ebenfalls für das interne Archiv hinterlegt.`);
    console.log(`=======================================================\n`);

    rl.close();
}

main().catch(console.error);
