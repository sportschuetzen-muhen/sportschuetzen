/**
 * fix-galerie-urls.js
 * 
 * Ersetzt direkte immich-muhen.danfamily.uk URLs in galerie.json
 * durch Cloudflare Worker Proxy URLs (CORS-kompatibel für GitHub Pages).
 * 
 * Ausführen: node fix-galerie-urls.js
 */

const { readFileSync, writeFileSync, copyFileSync } = require('fs');
const { join } = require('path');

const GALERIE_JSON = join(__dirname, 'frontend', 'data', 'galerie.json');
const WORKER_BASE = 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev';
const IMMICH_HOST = 'https://immich-muhen.danfamily.uk';

// Extrahiert die Asset-ID aus einer direkten Immich-Thumbnail-URL
// z.B. https://immich-muhen.danfamily.uk/api/assets/ASSET-ID/thumbnail?...
function extractAssetId(url) {
    if (!url) return null;
    const match = url.match(/\/api\/assets\/([a-f0-9-]{36})\/thumbnail/);
    return match ? match[1] : null;
}

// Extrahiert den Shared-Link-Key aus einer direkten Immich-URL
function extractKey(url) {
    if (!url) return null;
    const u = new URL(url);
    return u.searchParams.get('key') || null;
}

// Baut eine Worker-Proxy-URL für ein Bild
function buildWorkerUrl(assetId, key, size = 'thumbnail') {
    const params = new URLSearchParams({
        module: 'immich',
        action: 'image',
        host: IMMICH_HOST,
        key: key,
        id: assetId,
        size: size
    });
    return `${WORKER_BASE}?${params.toString()}`;
}

// Lese galerie.json
console.log('📖 Lese galerie.json...');
const raw = readFileSync(GALERIE_JSON, 'utf-8');
const photos = JSON.parse(raw);
console.log(`   → ${photos.length} Einträge gefunden.`);

// Backup
const backupPath = GALERIE_JSON + '.bak2';
copyFileSync(GALERIE_JSON, backupPath);
console.log(`💾 Backup erstellt: ${backupPath}`);

let converted = 0;
let skipped = 0;

const updated = photos.map(photo => {
    const thumbUrl = photo.thumbnailUrl || photo.imageUrl || '';
    
    // Nur direkte Immich-URLs konvertieren
    if (!thumbUrl.includes('immich-muhen.danfamily.uk')) {
        skipped++;
        return photo;
    }

    const assetId = extractAssetId(thumbUrl);
    const key = extractKey(thumbUrl);

    if (!assetId || !key) {
        console.warn(`⚠️  Konnte Asset-ID/Key nicht extrahieren für: ${photo.id} (${thumbUrl.substring(0, 80)}...)`);
        skipped++;
        return photo;
    }

    converted++;
    return {
        ...photo,
        thumbnailUrl: buildWorkerUrl(assetId, key, 'thumbnail'),
        imageUrl: buildWorkerUrl(assetId, key, 'preview'),
        // Originale URLs als Fallback aufbewahren
        _directThumbnailUrl: photo.thumbnailUrl,
        _directImageUrl: photo.imageUrl,
    };
});

// Speichern
writeFileSync(GALERIE_JSON, JSON.stringify(updated, null, 2), 'utf-8');

console.log(`\n✅ Fertig!`);
console.log(`   Konvertiert: ${converted} Bilder → Worker-Proxy-URLs`);
console.log(`   Übersprungen: ${skipped} (bereits Worker-URLs oder kein Immich)`);
console.log(`\n🔗 Beispiel (vorher):`);
console.log(`   ${photos[0]?.thumbnailUrl?.substring(0, 90)}...`);
console.log(`\n🔗 Beispiel (nachher):`);
console.log(`   ${updated[0]?.thumbnailUrl?.substring(0, 90)}...`);
