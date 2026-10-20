import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const IMMICH_API_URL = Deno.env.get("IMMICH_INTERNAL_URL") || "http://192.168.68.120:2283";
const IMMICH_API_KEY = Deno.env.get("IMMICH_API_KEY") || "pNNisFU2flcT181a9RbVGYcG0vtWOHHdpt2xNhTxXyc";
const DEFAULT_ALBUM_ID = "6184f06d-be38-426b-8737-1bec29ab045e"; // Mitglieder-Uploads

Deno.serve(async (req: Request) => {
  // CORS Preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // GET: Healthcheck & Album Status
  if (req.method === "GET") {
    try {
      const res = await fetch(`${IMMICH_API_URL}/api/albums/${DEFAULT_ALBUM_ID}`, {
        headers: { "x-api-key": IMMICH_API_KEY }
      });
      const album = res.ok ? await res.json() : null;
      return new Response(JSON.stringify({
        status: "online",
        album: album ? { id: album.id, name: album.albumName, count: album.assetCount } : null
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    } catch (e: any) {
      return new Response(JSON.stringify({ status: "error", message: e.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  // Authentifizierung: Prüfe Supabase Token
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Nicht autorisiert. Bitte melde dich an." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "https://supabase-muhen.danfamily.uk";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5ODI0MTM4LCJleHAiOjE5NDc1MDQxMzh9.N6UO60NvNYVRcYc4gcDzwNGp676PNM5SkqGcbayzY3M";

  let userIdentifier = "Vereinsmitglied";
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    userIdentifier = user.email || user.id;
  } else if (token !== supabaseAnonKey) {
    return new Response(JSON.stringify({ error: "Ungültige oder abgelaufene Sitzung. Bitte neu anmelden." }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }

  try {
    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(JSON.stringify({ error: "Erwartet multipart/form-data mit Datei." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return new Response(JSON.stringify({ error: "Keine Datei im Feld 'file' übergeben." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const memberName = (formData.get("memberName") as string) || userIdentifier;
    const targetAlbumId = (formData.get("albumId") as string) || DEFAULT_ALBUM_ID;
    const originalName = file.name || "vereinsfoto.jpg";
    const fileBytes = await file.arrayBuffer();
    const blob = new Blob([fileBytes], { type: file.type || "application/octet-stream" });

    // Immich Upload FormData vorbereiten
    const immichForm = new FormData();
    immichForm.append("assetData", blob, originalName);
    immichForm.append("deviceAssetId", `${Date.now()}-${originalName.replace(/\W+/g, "_")}`);
    immichForm.append("deviceId", "sportschuetzen-member-portal");
    immichForm.append("fileCreatedAt", new Date().toISOString());
    immichForm.append("fileModifiedAt", new Date().toISOString());
    immichForm.append("isFavorite", "false");

    // 1. Upload in Immich
    const uploadRes = await fetch(`${IMMICH_API_URL}/api/assets`, {
      method: "POST",
      headers: {
        "x-api-key": IMMICH_API_KEY
      },
      body: immichForm
    });

    if (!uploadRes.ok) {
      const errText = await uploadRes.text();
      console.error("Immich Asset Upload Error:", errText);
      return new Response(JSON.stringify({ error: `Immich Fehler: ${uploadRes.status}`, details: errText }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const uploadData = await uploadRes.json();
    const assetId = uploadData.id;

    // 2. Zu Ziel-Album hinzufügen
    if (assetId && targetAlbumId) {
      try {
        const albumRes = await fetch(`${IMMICH_API_URL}/api/albums/${targetAlbumId}/assets`, {
          method: "PUT",
          headers: {
            "x-api-key": IMMICH_API_KEY,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ ids: [assetId] })
        });
        if (!albumRes.ok) {
          console.warn(`Konnte Asset ${assetId} nicht zu Album ${targetAlbumId} hinzufügen:`, await albumRes.text());
        }
      } catch (albErr) {
        console.warn("Fehler beim Hinzufügen zum Album:", albErr);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      assetId: assetId,
      status: uploadData.status || "created",
      duplicate: uploadData.duplicate || false,
      filename: originalName,
      albumId: targetAlbumId,
      uploadedBy: memberName
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (err: any) {
    console.error("Edge Function immich-upload Exception:", err);
    return new Response(JSON.stringify({ error: err.message || "Interner Serverfehler" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
