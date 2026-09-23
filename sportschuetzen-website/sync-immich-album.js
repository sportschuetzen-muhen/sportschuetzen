const fs = require('fs');
const path = require('path');
const https = require('https');

const arg = process.argv[2] || '';
const isPruneMode = arg === '--prune' || arg === '--clean' || arg === '-p';

const shareUrl = !isPruneMode ? (arg || 'https://immich-muhen.danfamily.uk/share/Npe_4JOlVmhdNBf62UtPT79P49n5LYg5mNyw_Tl_zu7TJeA-NGjel9Kwp266rtn3PA0') : '';
const match = shareUrl.match(/share\/([a-zA-Z0-9_-]+)/);
const key = match ? match[1] : null;
const hostMatch = shareUrl.match(/^https?:\/\/([^/]+)/);
const host = hostMatch ? hostMatch[1] : 'immich-muhen.danfamily.uk';

if (!isPruneMode && !key) {
  console.error('❌ Ungültiger Immich Share-Link. Bitte einen Link wie https://immich-.../share/KEY angeben.');
  process.exit(1);
}

const WORKER_BASE = 'https://sportschuetzen-website-worker.dan-hunziker73.workers.dev';

// Bekannte Vereinsmitglieder und historische Persönlichkeiten mit Alias-Namen
const knownPersons = [
  { first: 'Daniel', last: 'Berchtold', aliases: ['daniel bechtold', 'daniel berchtold'] },
  { first: 'Gerhard', last: 'Künzli', aliases: ['gerhard knzli', 'gerhard kuenzli', 'gerhard künzli'] },
  { first: 'Hans', last: 'Bäni', aliases: ['hans bni', 'hans baeni', 'hans bäni'] },
  { first: 'Fritz', last: 'Suter', aliases: ['fritz suter'] },
  { first: 'Bruno', last: 'Berchtold', aliases: ['bruno berchtold', 'bruno bechtold'] },
  { first: 'Hansjürg', last: 'Schmid', aliases: ['hansjrg schmid', 'hansjuerg schmid', 'hansjürg schmid'] },
  { first: 'Thomas', last: 'Hochuli', aliases: ['thomas hochuli'] },
  { first: 'Patrick', last: 'Schotzko', aliases: ['patrick schotzko'] },
  { first: 'Romano', last: 'Schotzko', aliases: ['romano schotzko'] },
  { first: 'Ruth', last: 'Künzli', aliases: ['ruth knzli', 'ruth kuenzli', 'ruth künzli'] },
  { first: 'Ernst', last: 'Kunz', aliases: ['ernst kunz'] },
  { first: 'Thomas', last: 'Gebert', aliases: ['thomas gebert'] },
  { first: 'Urs', last: 'Spinnler', aliases: ['urs spinnler'] },
  { first: 'Roger', last: 'Haller', aliases: ['roger haller'] },
  { first: 'Simon', last: 'Hediger', aliases: ['simon hediger'] },
  { first: 'Daniel', last: 'Hunziker', aliases: ['daniel hunziker'] }
];

function cleanWords(str) {
  const dict = [
    { pattern: /\bspatenstich\b/gi, replace: 'Spatenstich' },
    { pattern: /\bschnellstrasse\b/gi, replace: 'Zufahrtsstrasse / Schnellstrasse' },
    { pattern: /\bbetonbodenplatte\b/gi, replace: 'Betonbodenplatte giessen' },
    { pattern: /\bleitungen[- ]ins[- ]erdreich[- ]verlegen\b/gi, replace: 'Leitungen ins Erdreich verlegen' },
    { pattern: /\bwiese\b/gi, replace: 'Baugelände Rüteli' },
    { pattern: /\bknzli\b/gi, replace: 'Künzli' },
    { pattern: /\bkuenzli\b/gi, replace: 'Künzli' },
    { pattern: /\bbni\b/gi, replace: 'Bäni' },
    { pattern: /\bbaeni\b/gi, replace: 'Bäni' },
    { pattern: /\bhansjrg\b/gi, replace: 'Hansjürg' },
    { pattern: /\bhansjuerg\b/gi, replace: 'Hansjürg' },
    { pattern: /\bbechtold\b/gi, replace: 'Berchtold' },
    { pattern: /\blscher\b/gi, replace: 'Lüscher' },
    { pattern: /\bmller\b/gi, replace: 'Müller' },
    { pattern: /\brteli\b/gi, replace: 'Rüteli' },
    { pattern: /\brueteli\b/gi, replace: 'Rüteli' }
  ];

  let s = str.trim();
  for (const item of dict) {
    s = s.replace(item.pattern, item.replace);
  }

  return s.split(/\s+/).map(w => {
    return w.charAt(0).toUpperCase() + w.slice(1);
  }).join(' ');
}

function cleanTitleAndExtractPersons(rawFileName, albumName = 'Vereinsarchiv', index = 1) {
  // 1. Dateiendung entfernen
  let name = rawFileName.replace(/\.[^/.]+$/, '');

  // 2. Flickr IDs und Nummern-Suffixe bereinigen
  name = name.replace(/_?\d{10,12}(?:_[a-z0-9]+)*_o$/i, '');
  name = name.replace(/_?\d{10,12}(?:_[a-z0-9]+)*$/i, '');

  // 3. iOS/Kamera Zeitstempel-Präfixe entfernen (z.B. 20250427_115435136_ios_ oder IMG_)
  name = name.replace(/^\d{8}_\d{6,9}_ios_?/i, '');
  name = name.replace(/^\d{8}_\d{6,9}_?/i, '');

  const isGenericCameraName = /^img[_\s-]?\d+$/i.test(name.trim());

  // 4. Bindestriche und Unterstriche durch Leerzeichen ersetzen
  let normalized = name.replace(/[_-]+/g, ' ').trim().toLowerCase();

  // 5. Personen erkennen und herausfiltern
  const foundPersons = [];
  let remainingText = normalized;

  for (const kp of knownPersons) {
    for (const alias of kp.aliases) {
      if (remainingText.includes(alias)) {
        foundPersons.push(`${kp.first} ${kp.last}`);
        remainingText = remainingText.replace(alias, '').trim();
        break;
      }
    }
  }

  let finalTitle = '';

  if (foundPersons.length > 0) {
    if (foundPersons.length === 1) {
      finalTitle = foundPersons[0];
    } else if (foundPersons.length === 2) {
      finalTitle = `${foundPersons[0]} & ${foundPersons[1]}`;
    } else {
      const last = foundPersons[foundPersons.length - 1];
      finalTitle = `${foundPersons.slice(0, -1).join(', ')} & ${last}`;
    }

    if (remainingText.length > 2 && !/^img[_\s-]?\d*$/i.test(remainingText)) {
      const cleanRemaining = cleanWords(remainingText);
      if (cleanRemaining) {
        finalTitle = `${cleanRemaining}: ${finalTitle}`;
      }
    }
  } else if (!isGenericCameraName && normalized.length > 0 && !/^\d+$/.test(normalized)) {
    finalTitle = cleanWords(normalized);
  } else {
    // Falls nur generische Kameraname oder Zahlen -> Sinnvoller Titel anhand des Albums
    finalTitle = `${albumName} (${index})`;
  }

  return {
    title: finalTitle,
    detectedPersons: foundPersons
  };
}

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: host,
      path: urlPath,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Sportschuetzen-Sync' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch(e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function determineCategory(albumName) {
  const lower = albumName.toLowerCase();
  if (lower.includes('bau') || lower.includes('erstellung') || lower.includes('geschichte') || lower.includes('historisch') || lower.includes('199') || lower.includes('198') || lower.includes('197')) {
    return 'geschichte';
  }
  if (lower.includes('nachwuchs') || lower.includes('junioren') || lower.includes('jugend') || lower.includes('kurs')) {
    return 'nachwuchs';
  }
  return 'events';
}

function generateBaseTags(albumName) {
  const words = albumName.split(/[\s,/-]+/).map(w => w.trim()).filter(w => w.length > 2);
  const tags = [];
  words.forEach(w => {
    const cleanW = w.charAt(0).toUpperCase() + w.slice(1);
    if (!tags.includes(cleanW) && !['Und', 'Oder', 'Der', 'Die', 'Das', 'Im', 'In', 'Mit', 'Beim', 'Bei'].includes(cleanW)) {
      tags.push(cleanW);
    }
  });
  if (!tags.includes('Sportschützen') && !tags.includes('Muhen')) {
    tags.push('Muhen');
  }
  return tags;
}

async function run() {
  console.log('1. Abrufen der Freigabelink-Metadaten für Key:', key);
  const meData = await getJson(`/api/shared-links/me?key=${key}`);
  const albumId = meData.album?.id;
  const albumName = meData.album?.albumName || 'Vereinsarchiv';
  const albumDescription = meData.album?.description || '';
  console.log(`2. Gefundenes Album: "${albumName}" (ID: ${albumId})`);

  console.log('3. Lade Fotos und Videos aus dem Album...');
  const albumData = await getJson(`/api/albums/${albumId}?key=${key}`);
  const rawAssets = albumData.assets || [];
  console.log(`4. Medien insgesamt im Album: ${rawAssets.length}`);

  const category = determineCategory(albumName);
  const baseAlbumTags = generateBaseTags(albumName);

  let mediaIndex = 1;
  const formattedPhotos = rawAssets
    .filter(a => a.type === 'IMAGE' || a.type === 'VIDEO')
    .map((asset) => {
      const isVideo = asset.type === 'VIDEO';
      const { title, detectedPersons } = cleanTitleAndExtractPersons(asset.originalFileName || '', albumName, mediaIndex++);

      const createdDate = asset.fileCreatedAt || asset.createdAt;
      const dateFormatted = createdDate 
        ? new Date(createdDate).toLocaleDateString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit' }) 
        : new Date().getFullYear().toString();

      // Tags zusammenstellen (Basis-Tags + Nachnamen erkannter Personen)
      const tags = [...baseAlbumTags];
      detectedPersons.forEach(p => {
        const lastName = p.split(' ').pop();
        if (lastName && !tags.includes(lastName)) {
          tags.push(lastName);
        }
      });

      // Beschreibung
      let desc = '';
      if (albumDescription) {
        desc = albumDescription;
      } else if (detectedPersons.length > 0) {
        desc = `Aufnahme: ${title} aus dem Album «${albumName}».`;
      } else {
        desc = `Impressionen zum Anlass «${albumName}» (${dateFormatted}).`;
      }

      const directThumb = `https://${host}/api/assets/${asset.id}/thumbnail?key=${key}`;
      const directPreview = `https://${host}/api/assets/${asset.id}/thumbnail?size=preview&key=${key}`;
      const workerThumb = `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent('https://' + host)}&key=${encodeURIComponent(key)}&id=${encodeURIComponent(asset.id)}&size=thumbnail`;
      const workerPreview = `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent('https://' + host)}&key=${encodeURIComponent(key)}&id=${encodeURIComponent(asset.id)}&size=preview`;

      const photoObj = {
        id: asset.id,
        album: albumName,
        albumId: albumId,
        albumKey: key,
        title: title,
        category: category,
        date: dateFormatted,
        description: desc,
        mediaType: isVideo ? 'video' : 'image',
        thumbnailUrl: workerThumb,
        imageUrl: workerPreview,
        tags: tags,
        detectedPersons: detectedPersons,
        _directThumbnailUrl: directThumb,
        _directImageUrl: directPreview
      };

      if (isVideo) {
        photoObj.videoUrl = `${WORKER_BASE}?module=immich&action=video&host=${encodeURIComponent('https://' + host)}&key=${encodeURIComponent(key)}&id=${encodeURIComponent(asset.id)}`;
      }

      return photoObj;
    });

  console.log(`5. ${formattedPhotos.length} Medien erfolgreich aufbereitet.`);

  // Zielverzeichnis sicherstellen
  const dataDir = path.join(__dirname, 'frontend', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const targetPath = path.join(dataDir, 'galerie.json');
  const backupPath = path.join(dataDir, 'galerie.json.bak');

  // Vorherige Galerie-Daten laden (inkl. Fallback auf .bak falls vorhanden)
  let existingGallery = [];
  if (fs.existsSync(targetPath)) {
    try {
      existingGallery = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
    } catch(e) {
      console.warn('Konnte aktuelle galerie.json nicht parsen:', e.message);
    }
  }

  // Falls galerie.json durch einen früheren Lauf überschrieben wurde, prüfen wir .bak
  if (existingGallery.length < 10 && fs.existsSync(backupPath)) {
    try {
      const bakData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
      if (bakData.length > existingGallery.length) {
        console.log(`ℹ️ Wiederherstellung von ${bakData.length} vorherigen Fotos aus galerie.json.bak`);
        // Zusammenführen: fehlende Bilder aus Backup übernehmen
        const currentIds = new Set(existingGallery.map(p => p.id));
        bakData.forEach(bakItem => {
          if (!currentIds.has(bakItem.id)) {
            existingGallery.push(bakItem);
          }
        });
      }
    } catch(e) {}
  }

  // Alle bestehenden Elemente bereinigen (sicherstellen, dass Worker-URLs aktiv sind)
  existingGallery = existingGallery.map(item => {
    let thumb = item.thumbnailUrl || '';
    let img = item.imageUrl || '';
    let video = item.videoUrl || '';
    const assetId = item.id;
    const itemKey = item.albumKey || key;
    const itemHost = 'https://immich-muhen.danfamily.uk';

    if (assetId && itemKey) {
      if (!thumb.includes('workers.dev')) {
        thumb = `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent(itemHost)}&key=${encodeURIComponent(itemKey)}&id=${encodeURIComponent(assetId)}&size=thumbnail`;
      }
      if (!img.includes('workers.dev')) {
        img = `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent(itemHost)}&key=${encodeURIComponent(itemKey)}&id=${encodeURIComponent(assetId)}&size=preview`;
      }
      if ((item.mediaType === 'video' || video) && !video.includes('workers.dev')) {
        video = `${WORKER_BASE}?module=immich&action=video&host=${encodeURIComponent(itemHost)}&key=${encodeURIComponent(itemKey)}&id=${encodeURIComponent(assetId)}`;
      }
    }

    // Falls noch kein Album-Feld vergeben war
    if (!item.album) {
      if (item.tags && (item.tags.includes('Schützenhaus') || item.tags.includes('Rüteli') || item.tags.includes('1996'))) {
        item.album = '1996/1997 Erstellung Schützenhaus Rüteli';
      } else {
        item.album = 'Vereinsarchiv';
      }
    }
    return {
      ...item,
      thumbnailUrl: thumb,
      imageUrl: img,
      videoUrl: video
    };
  });

  // Backup vor dem Schreiben erstellen
  if (fs.existsSync(targetPath)) {
    fs.copyFileSync(targetPath, backupPath);
    console.log('Backup erstellt: frontend/data/galerie.json.bak');
  }

  // Neues Album sauber mergen:
  // Vorhandene Bilder dieses Albums oder dieser Asset-IDs ersetzen/hinzufügen
  const newAssetIds = new Set(formattedPhotos.map(p => p.id));
  const mergedGallery = existingGallery.filter(p => !newAssetIds.has(p.id) && p.album !== albumName);
  
  // Neue Bilder an den Anfang oder sortiert einfügen
  mergedGallery.unshift(...formattedPhotos);

  fs.writeFileSync(targetPath, JSON.stringify(mergedGallery, null, 2), 'utf8');

  // Album-Übersicht ausgeben
  const albumCounts = {};
  mergedGallery.forEach(p => {
    const a = p.album || 'Unbekannt';
    albumCounts[a] = (albumCounts[a] || 0) + 1;
  });

  console.log('\n========================================================');
  console.log(`✅ Erfolgreich gespeichert in frontend/data/galerie.json!`);
  console.log(`Gesamtzahl Medien in Galerie: ${mergedGallery.length}`);
  console.log('Alben in der Galerie:');
  Object.keys(albumCounts).forEach(a => {
    console.log(`  📁 "${a}": ${albumCounts[a]} Medien`);
  });
  console.log('========================================================\n');
}

function checkSharedLink(testKey, testHost = 'immich-muhen.danfamily.uk') {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: testHost,
      path: `/api/shared-links/me?key=${testKey}`,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Sportschuetzen-Sync' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

function getAlbumAssets(albumId, testKey, testHost = 'immich-muhen.danfamily.uk') {
  return new Promise((resolve, reject) => {
    https.get({
      hostname: testHost,
      path: `/api/albums/${albumId}?key=${testKey}`,
      headers: { 'Accept': 'application/json', 'User-Agent': 'Sportschuetzen-Sync' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            reject(e);
          }
        } else {
          reject(new Error(`HTTP ${res.statusCode}`));
        }
      });
    }).on('error', reject);
  });
}

async function pruneOrphanedAlbums() {
  console.log('\n========================================================');
  console.log('   Prüfe vorhandene Alben auf Immich (Bereinigung)      ');
  console.log('========================================================\n');

  const dataDir = path.join(__dirname, 'frontend', 'data');
  const targetPath = path.join(dataDir, 'galerie.json');
  const backupPath = path.join(dataDir, 'galerie.json.bak');

  if (!fs.existsSync(targetPath)) {
    console.log('Keine galerie.json gefunden.');
    return;
  }

  let gallery = JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  console.log(`Geladene Medien in galerie.json: ${gallery.length}`);

  // Finde alle Alben und zugehörige Keys
  const albumsMap = {};
  gallery.forEach(item => {
    const alb = item.album || 'Vereinsarchiv';
    const k = item.albumKey || (item.thumbnailUrl && item.thumbnailUrl.match(/[?&]key=([^&]+)/)?.[1]) || (item._directThumbnailUrl && item._directThumbnailUrl.match(/[?&]key=([^&]+)/)?.[1]);
    if (!albumsMap[alb]) {
      albumsMap[alb] = {
        name: alb,
        keys: new Set(),
        count: 0
      };
    }
    if (k) albumsMap[alb].keys.add(k);
    albumsMap[alb].count++;
  });

  const albumNames = Object.keys(albumsMap);
  console.log(`Vorhandene Alben (${albumNames.length}):`);
  albumNames.forEach(name => {
    console.log(` - 📁 "${name}": ${albumsMap[name].count} Medien`);
  });
  console.log('\nPrüfe Erreichbarkeit auf Immich...');

  const deletedAlbums = new Set();
  const deletedAssetIds = new Set();

  for (const name of albumNames) {
    const albInfo = albumsMap[name];
    const keys = Array.from(albInfo.keys);

    if (keys.length === 0) {
      console.log(` ℹ️ Album "${name}" hat keinen Immich-Key (wird beibehalten).`);
      continue;
    }

    let albumValid = false;
    for (const testKey of keys) {
      try {
        const linkData = await checkSharedLink(testKey);
        if (linkData && (linkData.id || linkData.album)) {
          albumValid = true;
          const albumId = linkData.album?.id;
          if (albumId) {
            try {
              const fullAlbum = await getAlbumAssets(albumId, testKey);
              const activeAssets = fullAlbum.assets || [];
              if (activeAssets.length > 0) {
                const activeAssetIds = new Set(activeAssets.map(a => a.id));
                const currentAlbumPhotos = gallery.filter(p => p.album === name);
                for (const p of currentAlbumPhotos) {
                  if (!activeAssetIds.has(p.id)) {
                    deletedAssetIds.add(p.id);
                  }
                }
              }
            } catch(e) {}
          }
          break;
        }
      } catch (err) {
        // HTTP 404/Fehler
      }
    }

    if (!albumValid) {
      console.log(` ❌ Album "${name}" wurde in Immich gelöscht oder der Share-Link ist ungültig.`);
      deletedAlbums.add(name);
    } else {
      console.log(` ✔️ Album "${name}" ist auf Immich aktiv.`);
    }
  }

  if (deletedAlbums.size > 0 || deletedAssetIds.size > 0) {
    fs.copyFileSync(targetPath, backupPath);
    console.log(`\n💾 Backup erstellt: frontend/data/galerie.json.bak`);

    const cleanedGallery = gallery.filter(p => {
      if (deletedAlbums.has(p.album)) return false;
      if (deletedAssetIds.has(p.id)) return false;
      return true;
    });

    const removedCount = gallery.length - cleanedGallery.length;
    fs.writeFileSync(targetPath, JSON.stringify(cleanedGallery, null, 2), 'utf8');

    console.log(`\n========================================================`);
    console.log(`✅ Bereinigung erfolgreich abgeschlossen!`);
    if (deletedAlbums.size > 0) {
      console.log(`   Gelöschte Alben entfernt: ${Array.from(deletedAlbums).map(a => `"${a}"`).join(', ')}`);
    }
    if (deletedAssetIds.size > 0) {
      console.log(`   Einzelne gelöschte Fotos entfernt: ${deletedAssetIds.size}`);
    }
    console.log(`   Entfernte Medien: ${removedCount}`);
    console.log(`   Verbleibende Medien in Galerie: ${cleanedGallery.length}`);
    console.log(`========================================================\n`);
  } else {
    console.log(`\n🎉 Alle Alben und Medien sind aktuell auf Immich vorhanden. Keine Bereinigung nötig!\n`);
  }
}

if (isPruneMode) {
  pruneOrphanedAlbums().catch(console.error);
} else {
  run().catch(console.error);
}
