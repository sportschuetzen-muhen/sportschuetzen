import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const IMMICH_API_URL = Deno.env.get("IMMICH_INTERNAL_URL") || "http://192.168.68.120:2283";
const IMMICH_API_KEY = Deno.env.get("IMMICH_API_KEY") || "pNNisFU2flcT181a9RbVGYcG0vtWOHHdpt2xNhTxXyc";
const WORKER_BASE = "https://sportschuetzen-website-worker.dan-hunziker73.workers.dev";
const IMMICH_PUBLIC_HOST = "https://immich-muhen.danfamily.uk";
const INBOX_ALBUM_ID = "6184f06d-be38-426b-8737-1bec29ab045e";

// Supabase DB Zugriff via Service Role
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "http://api-gw:8000";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

// Bekannte Vereinsmitglieder fuer Namens-Extraktion
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

function cleanWords(str: string): string {
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

function cleanTitleAndExtractPersons(rawFileName: string, albumName: string = 'Vereinsarchiv', index: number = 1) {
  let name = rawFileName.replace(/\.[^/.]+$/, '');
  name = name.replace(/_?\d{10,12}(?:_[a-z0-9]+)*_o$/i, '');
  name = name.replace(/_?\d{10,12}(?:_[a-z0-9]+)*$/i, '');
  name = name.replace(/^\d{8}_\d{6,9}_ios_?/i, '');
  name = name.replace(/^\d{8}_\d{6,9}_?/i, '');

  const isGenericCameraName = /^img[_\s-]?\d+$/i.test(name.trim());
  const normalized = name.replace(/[_-]+/g, ' ').trim().toLowerCase();

  const foundPersons: string[] = [];
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
    finalTitle = `${albumName} (${index})`;
  }

  return { title: finalTitle, detectedPersons: foundPersons };
}

function determineCategory(albumName: string): string {
  const lower = albumName.toLowerCase();
  if (lower.includes('bau') || lower.includes('erstellung') || lower.includes('geschichte') || lower.includes('historisch') || lower.includes('199') || lower.includes('198') || lower.includes('197')) {
    return 'geschichte';
  }
  if (lower.includes('nachwuchs') || lower.includes('junioren') || lower.includes('jugend') || lower.includes('kurs')) {
    return 'nachwuchs';
  }
  return 'events';
}

function generateBaseTags(albumName: string): string[] {
  const words = albumName.split(/[\s,/-]+/).map(w => w.trim()).filter(w => w.length > 2);
  const tags: string[] = [];
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const url = new URL(req.url);
  const action = url.searchParams.get("action") || "";

  // =========================================================
  //  GET: VERFÜGBARE & PUBLIZIERTE ALBEN ODER INBOX-FOTOS LADEN
  // =========================================================
  if (req.method === "GET") {
    // -------------------------------------------------------
    // A. INBOX ASSETS LADEN (FÜR KURATIERUNGS-COCKPIT)
    // -------------------------------------------------------
    if (action === "get_inbox_assets") {
      try {
        const inboxRes = await fetch(`${IMMICH_API_URL}/api/albums/${INBOX_ALBUM_ID}`, {
          headers: { "x-api-key": IMMICH_API_KEY }
        });
        if (!inboxRes.ok) throw new Error(`HTTP ${inboxRes.status}`);
        const inboxData = await inboxRes.json();
        const rawAssets = inboxData.assets || [];

        // Share-Key für Worker-Proxy ermitteln oder erstellen
        const sharesRes = await fetch(`${IMMICH_API_URL}/api/shared-links`, {
          headers: { "x-api-key": IMMICH_API_KEY }
        });
        let shareKey = "";
        if (sharesRes.ok) {
          const shares = await sharesRes.json();
          const existingShare = shares.find((s: any) => s.album?.id === INBOX_ALBUM_ID || s.albumId === INBOX_ALBUM_ID);
          if (existingShare && existingShare.key) {
            shareKey = existingShare.key;
          }
        }

        if (!shareKey) {
          const createShareRes = await fetch(`${IMMICH_API_URL}/api/shared-links`, {
            method: "POST",
            headers: {
              "x-api-key": IMMICH_API_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              albumId: INBOX_ALBUM_ID,
              type: "ALBUM",
              allowDownload: true,
              showMetadata: true
            })
          });
          if (createShareRes.ok) {
            const newShare = await createShareRes.json();
            shareKey = newShare.key;
          }
        }

        const assets = rawAssets.map((a: any) => ({
          id: a.id,
          originalFileName: a.originalFileName || "Foto",
          type: a.type,
          fileCreatedAt: a.fileCreatedAt || a.createdAt,
          thumbnailUrl: `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent(IMMICH_PUBLIC_HOST)}&key=${encodeURIComponent(shareKey)}&id=${encodeURIComponent(a.id)}&size=thumbnail`,
          previewUrl: `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent(IMMICH_PUBLIC_HOST)}&key=${encodeURIComponent(shareKey)}&id=${encodeURIComponent(a.id)}&size=preview`
        }));

        return new Response(JSON.stringify({
          success: true,
          count: assets.length,
          albumId: INBOX_ALBUM_ID,
          assets
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      } catch (err: any) {
        console.error("Fehler beim Laden der Inbox-Fotos:", err);
        return new Response(JSON.stringify({ success: false, error: err.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    try {
      // 1. Immich Alben abrufen
      const immichRes = await fetch(`${IMMICH_API_URL}/api/albums`, {
        headers: { "x-api-key": IMMICH_API_KEY }
      });
      if (!immichRes.ok) {
        throw new Error(`Immich Server Fehler: HTTP ${immichRes.status}`);
      }
      const rawAlbums = await immichRes.json();

      // Filtere Sammelalbum und leere Alben
      const immichAlbums = rawAlbums
        .filter((a: any) => a.id !== INBOX_ALBUM_ID)
        .map((a: any) => ({
          id: a.id,
          name: a.albumName,
          assetCount: a.assetCount || 0,
          createdAt: a.createdAt,
          thumbnailAssetId: a.albumThumbnailAssetId
        }))
        .sort((a: any, b: any) => (b.name || '').localeCompare(a.name || ''));

      // 2. Bereits publizierte Alben aus Supabase laden
      const { data: publishedAlbums, error: pubErr } = await supabase
        .from("gallery_albums")
        .select("*")
        .order("created_at", { ascending: false });

      if (pubErr) throw pubErr;

      return new Response(JSON.stringify({
        success: true,
        immichAlbums,
        publishedAlbums: publishedAlbums || []
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (e: any) {
      console.error("Fehler beim Laden der Alben:", e);
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  // =========================================================
  //  POST: SYNCHRONISATION, ALBUM-ERSTELLUNG & KURATIERUNG
  // =========================================================
  if (req.method === "POST") {
    try {
      const body = await req.json();
      const postAction = body.action || action || "sync";

      // -------------------------------------------------------
      // A0. INBOX KURATIEREN (1-KLICK BEREINIGUNG & VERSCHIEBEN)
      // -------------------------------------------------------
      if (postAction === "curate_inbox") {
        const { selectedIds = [], targetAlbumId, unselectedIds = [], unselectedAction = 'keep', archiveAlbumId } = body;

        let movedToTarget = 0;
        let movedToArchive = 0;
        let deletedCount = 0;

        // 1. Ausgewählte Fotos ins Zielalbum schieben
        if (selectedIds.length > 0 && targetAlbumId) {
          const addRes = await fetch(`${IMMICH_API_URL}/api/albums/${targetAlbumId}/assets`, {
            method: "PUT",
            headers: {
              "x-api-key": IMMICH_API_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ ids: selectedIds })
          });
          if (!addRes.ok) {
            const errTxt = await addRes.text();
            throw new Error(`Konnte Fotos nicht zu Zielalbum hinzufügen: ${errTxt}`);
          }

          // Aus Sammelalbum austragen
          const remRes = await fetch(`${IMMICH_API_URL}/api/albums/${INBOX_ALBUM_ID}/assets`, {
            method: "DELETE",
            headers: {
              "x-api-key": IMMICH_API_KEY,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({ ids: selectedIds })
          });
          if (!remRes.ok) {
            console.warn("Warnung beim Austragen aus Sammelalbum:", await remRes.text());
          }
          movedToTarget = selectedIds.length;
        }

        // 2. Nicht ausgewählte Fotos behandeln
        if (unselectedIds.length > 0) {
          if (unselectedAction === 'archive' && archiveAlbumId) {
            await fetch(`${IMMICH_API_URL}/api/albums/${archiveAlbumId}/assets`, {
              method: "PUT",
              headers: {
                "x-api-key": IMMICH_API_KEY,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ ids: unselectedIds })
            });

            await fetch(`${IMMICH_API_URL}/api/albums/${INBOX_ALBUM_ID}/assets`, {
              method: "DELETE",
              headers: {
                "x-api-key": IMMICH_API_KEY,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ ids: unselectedIds })
            });
            movedToArchive = unselectedIds.length;
          } else if (unselectedAction === 'delete') {
            await fetch(`${IMMICH_API_URL}/api/assets`, {
              method: "DELETE",
              headers: {
                "x-api-key": IMMICH_API_KEY,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ ids: unselectedIds })
            });
            deletedCount = unselectedIds.length;
          }
        }

        // Aktuellen Stand der Inbox abfragen
        const inboxCheck = await fetch(`${IMMICH_API_URL}/api/albums/${INBOX_ALBUM_ID}`, {
          headers: { "x-api-key": IMMICH_API_KEY }
        });
        const inboxData = inboxCheck.ok ? await inboxCheck.json() : null;
        const remainingCount = inboxData?.assetCount || 0;

        return new Response(JSON.stringify({
          success: true,
          movedToTarget,
          movedToArchive,
          deletedCount,
          remainingCount
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // -------------------------------------------------------
      // A0.1 KI-JOBS AUF IMMICH SERVER ANSTOSSEN (FACIAL RECOGNITION & SMART SEARCH)
      // -------------------------------------------------------
      if (postAction === "trigger_ml_jobs") {
        try {
          const [faceRes, searchRes] = await Promise.all([
            fetch(`${IMMICH_API_URL}/api/jobs/facialRecognition`, {
              method: "PUT",
              headers: {
                "x-api-key": IMMICH_API_KEY,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ command: "start" })
            }),
            fetch(`${IMMICH_API_URL}/api/jobs/smartSearch`, {
              method: "PUT",
              headers: {
                "x-api-key": IMMICH_API_KEY,
                "Content-Type": "application/json"
              },
              body: JSON.stringify({ command: "start" })
            })
          ]);

          return new Response(JSON.stringify({
            success: true,
            message: "KI-Erkennung auf Proxmox CT 116 erfolgreich gestartet",
            facialRecognition: faceRes.ok,
            smartSearch: searchRes.ok
          }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        } catch (err: any) {
          return new Response(JSON.stringify({ success: false, error: err.message }), {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }
      }

      // -------------------------------------------------------
      // A1. NEUES IMMICH-ALBUM ERSTELLEN
      // -------------------------------------------------------
      if (postAction === "create_album") {
        const { albumName, description } = body;
        const cleanName = (albumName || "").trim();
        if (!cleanName) {
          return new Response(JSON.stringify({ error: "albumName ist erforderlich" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        // Immich API: Neues Album anlegen
        const createRes = await fetch(`${IMMICH_API_URL}/api/albums`, {
          method: "POST",
          headers: {
            "x-api-key": IMMICH_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            albumName: cleanName,
            description: description || ""
          })
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          console.error("Immich Create Album Error:", errText);
          return new Response(JSON.stringify({ error: `Immich Fehler: ${createRes.status}`, details: errText }), {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const createdAlbum = await createRes.json();
        return new Response(JSON.stringify({
          success: true,
          album: {
            id: createdAlbum.id,
            name: createdAlbum.albumName,
            assetCount: 0,
            createdAt: createdAlbum.createdAt
          }
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // -------------------------------------------------------
      // A. ALBUM ENTFERNEN (UNPUBLISH)
      // -------------------------------------------------------
      if (postAction === "unpublish") {
        const { albumId } = body;
        if (!albumId) {
          return new Response(JSON.stringify({ error: "albumId erforderlich" }), {
            status: 400,
            headers: { ...corsHeaders, "Content-Type": "application/json" }
          });
        }

        const { error: delErr } = await supabase
          .from("gallery_albums")
          .delete()
          .eq("id", albumId);

        if (delErr) throw delErr;

        return new Response(JSON.stringify({ success: true, message: "Album erfolgreich depubliziert" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // -------------------------------------------------------
      // B. ALBUM SYNCHRONISIEREN (SYNC)
      // -------------------------------------------------------
      const { albumId, websiteTitle, visibility, category } = body;
      if (!albumId) {
        return new Response(JSON.stringify({ error: "albumId erforderlich" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }

      // 1. Details & Fotos des Albums aus Immich laden
      const albumRes = await fetch(`${IMMICH_API_URL}/api/albums/${albumId}`, {
        headers: { "x-api-key": IMMICH_API_KEY }
      });
      if (!albumRes.ok) {
        throw new Error(`Konnte Album ${albumId} nicht von Immich laden (HTTP ${albumRes.status})`);
      }
      const albumData = await albumRes.json();
      const rawAssets = albumData.assets || [];
      const effectiveAlbumName = (websiteTitle || albumData.albumName || "Vereinsarchiv").trim();
      const effectiveVisibility = (visibility === 'public') ? 'public' : 'members';
      const effectiveCategory = ['events', 'nachwuchs', 'geschichte'].includes(category) 
        ? category 
        : determineCategory(effectiveAlbumName);

      // 2. Prüfen, ob für dieses Album ein Immich Share-Link existiert
      const sharesRes = await fetch(`${IMMICH_API_URL}/api/shared-links`, {
        headers: { "x-api-key": IMMICH_API_KEY }
      });
      let shareKey = "";
      if (sharesRes.ok) {
        const shares = await sharesRes.json();
        const existingShare = shares.find((s: any) => s.album?.id === albumId || s.albumId === albumId);
        if (existingShare && existingShare.key) {
          shareKey = existingShare.key;
        }
      }

      // Falls noch kein Share-Link existiert: automatisch per API anlegen!
      if (!shareKey) {
        const createShareRes = await fetch(`${IMMICH_API_URL}/api/shared-links`, {
          method: "POST",
          headers: {
            "x-api-key": IMMICH_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            albumId: albumId,
            type: "ALBUM",
            allowDownload: true,
            showMetadata: true
          })
        });
        if (createShareRes.ok) {
          const newShare = await createShareRes.json();
          shareKey = newShare.key;
        } else {
          console.warn("Konnte Share-Link nicht automatisch anlegen:", await createShareRes.text());
        }
      }

      // 3. Medien aufbereiten
      const baseAlbumTags = generateBaseTags(effectiveAlbumName);
      let mediaIndex = 1;

      const formattedPhotos = rawAssets
        .filter((a: any) => a.type === 'IMAGE' || a.type === 'VIDEO')
        .map((asset: any) => {
          const isVideo = asset.type === 'VIDEO';
          let { title, detectedPersons } = cleanTitleAndExtractPersons(asset.originalFileName || '', effectiveAlbumName, mediaIndex++);

          // 1. Personen aus Immich ML-Erkennung übernehmen falls auf Server getaggt
          if (Array.isArray(asset.people) && asset.people.length > 0) {
            for (const p of asset.people) {
              const pName = (p.name || '').trim();
              if (pName && !detectedPersons.includes(pName)) {
                detectedPersons.push(pName);
              }
            }
          }

          // 2. Falls Personen erkannt wurden und der Titel nur generisch war, Namen als Titel setzen
          let finalPhotoTitle = title;
          if (detectedPersons.length > 0 && finalPhotoTitle.startsWith(effectiveAlbumName)) {
            if (detectedPersons.length === 1) {
              finalPhotoTitle = detectedPersons[0];
            } else if (detectedPersons.length === 2) {
              finalPhotoTitle = `${detectedPersons[0]} & ${detectedPersons[1]}`;
            } else {
              finalPhotoTitle = `${detectedPersons.slice(0, -1).join(', ')} & ${detectedPersons[detectedPersons.length - 1]}`;
            }
          } else if (detectedPersons.length === 0 && asset.exifInfo?.description) {
            finalPhotoTitle = asset.exifInfo.description.trim();
          }

          const createdDate = asset.fileCreatedAt || asset.createdAt;
          const dateFormatted = createdDate 
            ? new Date(createdDate).toLocaleDateString('de-CH', { year: 'numeric', month: '2-digit', day: '2-digit' }) 
            : new Date().getFullYear().toString();

          const tags = [...baseAlbumTags];
          detectedPersons.forEach((p: string) => {
            const lastName = p.split(' ').pop();
            if (lastName && !tags.includes(lastName)) {
              tags.push(lastName);
            }
          });

          let desc = '';
          if (detectedPersons.length > 0) {
            desc = `Aufnahme: ${finalPhotoTitle} aus dem Album «${effectiveAlbumName}».`;
          } else if (asset.exifInfo?.description) {
            desc = asset.exifInfo.description;
          } else {
            desc = `Impressionen zum Anlass «${effectiveAlbumName}» (${dateFormatted}).`;
          }

          const workerThumb = `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent(IMMICH_PUBLIC_HOST)}&key=${encodeURIComponent(shareKey)}&id=${encodeURIComponent(asset.id)}&size=thumbnail`;
          const workerPreview = `${WORKER_BASE}?module=immich&action=image&host=${encodeURIComponent(IMMICH_PUBLIC_HOST)}&key=${encodeURIComponent(shareKey)}&id=${encodeURIComponent(asset.id)}&size=preview`;

          const photoObj: any = {
            id: asset.id,
            album_id: albumId,
            album: effectiveAlbumName,
            album_key: shareKey,
            title: finalPhotoTitle,
            category: effectiveCategory,
            visibility: effectiveVisibility,
            date: dateFormatted,
            description: desc,
            media_type: isVideo ? 'video' : 'image',
            thumbnail_url: workerThumb,
            image_url: workerPreview,
            tags: tags,
            detected_persons: detectedPersons,
            sort_order: mediaIndex
          };

          if (isVideo) {
            photoObj.video_url = `${WORKER_BASE}?module=immich&action=video&host=${encodeURIComponent(IMMICH_PUBLIC_HOST)}&key=${encodeURIComponent(shareKey)}&id=${encodeURIComponent(asset.id)}`;
          }

          return photoObj;
        });

      // 4. In Supabase speichern (Transaktional)
      // a) Album upserten
      const { error: albUpsertErr } = await supabase
        .from("gallery_albums")
        .upsert({
          id: albumId,
          album_name: albumData.albumName || effectiveAlbumName,
          website_title: effectiveAlbumName,
          visibility: effectiveVisibility,
          category: effectiveCategory,
          share_key: shareKey,
          media_count: formattedPhotos.length,
          last_synced_at: new Date().toISOString()
        });

      if (albUpsertErr) throw albUpsertErr;

      // b) Vorherige Fotos dieses Albums entfernen
      const { error: delPhotosErr } = await supabase
        .from("gallery_photos")
        .delete()
        .eq("album_id", albumId);

      if (delPhotosErr) throw delPhotosErr;

      // c) Neue Fotos im Batch einfügen
      if (formattedPhotos.length > 0) {
        // Chunked in Schritten von 100 Datensätzen
        const chunkSize = 100;
        for (let i = 0; i < formattedPhotos.length; i += chunkSize) {
          const chunk = formattedPhotos.slice(i, i + chunkSize);
          const { error: insertErr } = await supabase
            .from("gallery_photos")
            .insert(chunk);
          if (insertErr) throw insertErr;
        }
      }

      return new Response(JSON.stringify({
        success: true,
        count: formattedPhotos.length,
        album: effectiveAlbumName,
        visibility: effectiveVisibility,
        category: effectiveCategory
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });

    } catch (e: any) {
      console.error("Fehler beim Synchronisieren des Albums:", e);
      return new Response(JSON.stringify({ success: false, error: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { ...corsHeaders, "Content-Type": "application/json" }
  });
});
