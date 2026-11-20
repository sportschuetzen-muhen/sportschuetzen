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
const galerieJsonPath = path.join(frontendDir, 'data', 'galerie.json');

async function main() {
    console.log("\n=========================================");
    console.log("   Sportschützen Muhen - Galerie Sync    ");
    console.log("=========================================\n");

    // 1. Ensure directories exist
    if (!fs.existsSync(assetsGalerieDir)) {
        fs.mkdirSync(assetsGalerieDir, { recursive: true });
        console.log(`Verzeichnis erstellt: ${assetsGalerieDir}`);
    }

    // 2. Ask for Flickr source directory
    console.log("Tipp: Du kannst den Ordner einfach aus dem Windows-Explorer hier in das Fenster hineinziehen (Drag & Drop)!");
    const sourceDir = await question("Pfad zu deinem lokalen Flickr-Bilderordner (oder Enter zum Überspringen): ");
    
    if (sourceDir.trim()) {
        const cleanSourceDir = sourceDir.trim().replace(/^["']|["']$/g, ''); // Remove quotes if drag-and-dropped
        if (fs.existsSync(cleanSourceDir)) {
            const files = fs.readdirSync(cleanSourceDir);
            let copiedCount = 0;
            for (const file of files) {
                const ext = path.extname(file).toLowerCase();
                if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
                    const srcPath = path.join(cleanSourceDir, file);
                    // Safe filename (lowercase, no spaces, keep it clean)
                    const cleanFileName = file.toLowerCase()
                        .replace(/\s+/g, '_')
                        .replace(/[^a-z0-9_.]/g, '');
                    const destPath = path.join(assetsGalerieDir, cleanFileName);
                    fs.copyFileSync(srcPath, destPath);
                    copiedCount++;
                }
            }
            console.log(`\n✅ ${copiedCount} Bilder erfolgreich nach 'frontend/assets/galerie/' kopiert und Dateinamen bereinigt.\n`);
        } else {
            console.log(`\n⚠️ Pfad nicht gefunden: ${cleanSourceDir}. Kopieren übersprungen.\n`);
        }
    }

    // 3. Load existing galerie.json
    let galerieData = [];
    if (fs.existsSync(galerieJsonPath)) {
        try {
            galerieData = JSON.parse(fs.readFileSync(galerieJsonPath, 'utf8'));
        } catch (e) {
            console.error("Fehler beim Lesen der galerie.json. Starte neu.", e);
        }
    }

    // 4. Scan assets/galerie/
    const localFiles = fs.readdirSync(assetsGalerieDir);
    const existingImageUrls = new Set(galerieData.map(item => item.imageUrl));

    const newFiles = localFiles.filter(file => {
        const ext = path.extname(file).toLowerCase();
        if (!['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) return false;
        
        const relativeUrl = `assets/galerie/${file}`;
        return !existingImageUrls.has(relativeUrl);
    });

    if (newFiles.length === 0) {
        console.log("🎉 Keine neuen Bilder zum Registrieren gefunden. Galerie-Datenbank ist auf dem neuesten Stand!");
        rl.close();
        return;
    }

    console.log(`Gefunden: ${newFiles.length} neue(s) Bild(er), das/die noch nicht in galerie.json eingetragen ist/sind.\n`);
    
    const autoImport = await question("Möchtest du alle neuen Bilder automatisch mit Standardwerten importieren? (ja/nein) [ja]: ") || "ja";
    
    for (const file of newFiles) {
        // Infer default title, year and category from filename
        const baseName = path.basename(file, path.extname(file));
        
        // Try to guess a year (e.g. 1981, 2016 etc)
        const yearMatch = baseName.match(/\b(19\d\d|20\d\d)\b/);
        const defaultYear = yearMatch ? yearMatch[0] : new Date().getFullYear().toString();
        
        // Clean title (remove year, replace underscores/hyphens with spaces)
        let defaultTitle = baseName
            .replace(/\b(19\d\d|20\d\d)\b/g, '')
            .replace(/[_-]+/g, ' ')
            .trim();
        
        // Capitalize title
        defaultTitle = defaultTitle.split(' ')
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        if (!defaultTitle) defaultTitle = "Bild " + baseName;

        let title = defaultTitle;
        let date = defaultYear;
        let category = "events";
        let description = "";

        if (autoImport.toLowerCase().startsWith('n')) {
            console.log(`\n---------------------------------`);
            console.log(`Verarbeite: ${file}`);
            title = await question(`Titel [${defaultTitle}]: `) || defaultTitle;
            date = await question(`Datum/Jahr [${defaultYear}]: `) || defaultYear;
            category = await question(`Kategorie (geschichte/events/nachwuchs) [events]: `) || "events";
            description = await question(`Beschreibung: `) || "";
        } else {
            // Check if standard flickr filenames exist and guess category/title better
            if (file.includes('nachwuchs')) category = 'nachwuchs';
            if (file.includes('geschichte') || file.includes('1981') || file.includes('neubau') || file.includes('1996')) category = 'geschichte';
            
            console.log(`-> Automatisch importiert: "${title}" (${date}) in Kategorie "${category}"`);
        }

        const id = baseName.toLowerCase().replace(/[^a-z0-9]/g, '_');
        
        galerieData.push({
            id,
            title,
            category,
            date,
            description,
            imageUrl: `assets/galerie/${file}`
        });
    }

    // Write updated galerie.json
    fs.writeFileSync(galerieJsonPath, JSON.stringify(galerieData, null, 2), 'utf8');
    console.log(`\n✅ '${galerieJsonPath}' wurde erfolgreich aktualisiert!`);
    rl.close();
}

main().catch(console.error);
