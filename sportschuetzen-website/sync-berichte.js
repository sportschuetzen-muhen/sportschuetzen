// sync-berichte.js
// Synchronisiert Live-Berichte und deren Bilder aus dem GitHub-Repository (sportschuetzen-muhen/website)

const fs = require('fs');
const path = require('path');

const REPO_OWNER = 'sportschuetzen-muhen';
const REPO_NAME = 'website';
const BRANCH = 'main';

const BASE_RAW_URL = `https://raw.githubusercontent.com/${REPO_OWNER}/${REPO_NAME}/${BRANCH}`;
const BERICHTE_URL = `${BASE_RAW_URL}/data/berichte.json`;

const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'frontend', 'data');
const TARGET_FILE = path.join(DATA_DIR, 'berichte.json');
const BACKUP_FILE = path.join(DATA_DIR, 'berichte.json.bak');
const IMG_DIR = path.join(ROOT_DIR, 'frontend', 'img', 'reports');

async function downloadFile(url, destPath) {
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`HTTP ${res.status} (${res.statusText})`);
    }
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
}

async function main() {
    console.log(`[1/3] Pruefe lokale Ordner...`);
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(IMG_DIR)) {
        fs.mkdirSync(IMG_DIR, { recursive: true });
    }

    console.log(`[2/3] Erstelle lokales Backup der berichte.json...`);
    if (fs.existsSync(TARGET_FILE)) {
        fs.copyFileSync(TARGET_FILE, BACKUP_FILE);
        console.log(`      Backup erstellt: frontend/data/berichte.json.bak`);
    } else {
        console.log(`      (Keine vorherige berichte.json vorhanden)`);
    }

    console.log(`[3/3] Lade aktuelle Live-Berichte von GitHub herunter...`);
    console.log(`      Quelle: ${BERICHTE_URL}`);

    let berichte = [];
    try {
        const res = await fetch(BERICHTE_URL);
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} (${res.statusText})`);
        }
        const text = await res.text();
        berichte = JSON.parse(text);
        fs.writeFileSync(TARGET_FILE, JSON.stringify(berichte, null, 2), 'utf8');
        console.log(`      \x1b[32m✔ ${berichte.length} Berichte erfolgreich aktualisiert!\x1b[0m`);
    } catch (err) {
        console.error(`      \x1b[31m✖ Download fehlgeschlagen: ${err.message}\x1b[0m`);
        process.exit(1);
    }

    // Bilder synchronisieren
    console.log(`\n[Bilder] Pruefe zugehoerige Bericht-Bilder...`);
    const rawContent = fs.readFileSync(TARGET_FILE, 'utf8');
    const matches = rawContent.matchAll(/img\/reports\/([a-zA-Z0-9_\-\.]+)/g);
    const filenames = new Set();
    for (const match of matches) {
        if (match[1]) {
            filenames.add(match[1]);
        }
    }

    console.log(`      Gefundene Bild-Referenzen: ${filenames.size}`);
    let downloadedCount = 0;
    let skippedCount = 0;

    for (const filename of filenames) {
        const localImgPath = path.join(IMG_DIR, filename);
        if (fs.existsSync(localImgPath)) {
            skippedCount++;
            continue;
        }

        const imgUrl = `${BASE_RAW_URL}/img/reports/${filename}`;
        try {
            process.stdout.write(`      Lade ${filename}... `);
            await downloadFile(imgUrl, localImgPath);
            downloadedCount++;
            console.log(`\x1b[32mOK\x1b[0m`);
        } catch (imgErr) {
            console.log(`\x1b[33mFehler (${imgErr.message})\x1b[0m`);
        }
    }

    if (downloadedCount > 0) {
        console.log(`      \x1b[32m✔ ${downloadedCount} neue(s) Bild(er) heruntergeladen.\x1b[0m`);
    } else {
        console.log(`      \x1b[90mAlle Bilder sind bereits lokal vorhanden (${skippedCount} geprueft).\x1b[0m`);
    }
}

main().catch(err => {
    console.error(`Unerwarteter Fehler: ${err}`);
    process.exit(1);
});
