// supabase/functions/send-push-notification/index.ts
// ==============================================================================
// Edge Function: OneSignal Push-Mitteilungen
// Projekt: Vereinsportal Sportschützen Muhen
// ==============================================================================

import { corsHeaders } from "../_shared/cors.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

interface SendPushPayload {
  title: string;
  message: string;
  target_group: "alle" | "aktiv" | "passiv" | "vorstand" | "individual";
  target_person_number?: number;
  target_url?: string;
  sent_by_user?: string;
  simulate?: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || Deno.env.get("API_EXTERNAL_URL") || "http://supabase-kong:8000";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("SERVICE_ROLE_KEY") || "";
    const supa = createClient(supabaseUrl, supabaseServiceKey);

    const body: SendPushPayload = await req.json();
    const { title, message, target_group, target_person_number, target_url, sent_by_user, simulate } = body;

    if (!title || !message || !target_group) {
      return new Response(
        JSON.stringify({ success: false, error: "Titel, Nachricht und Zielgruppe sind Pflichtfelder." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. OneSignal Konfiguration aus system_app_configs abrufen
    const { data: configs } = await supa
      .from("system_app_configs")
      .select("key, value")
      .in("key", ["onesignal_app_id", "onesignal_rest_api_key"]);

    let appId = "fe30b2b7-1dcb-43e9-8e39-b1870d1a6815";
    let restApiKey = Deno.env.get("ONESIGNAL_REST_API_KEY") || "";

    if (configs) {
      for (const c of configs) {
        if (c.key === "onesignal_app_id" && c.value) appId = c.value.trim();
        if (c.key === "onesignal_rest_api_key" && c.value) restApiKey = c.value.trim();
      }
    }

    const isSimulated = Boolean(simulate) || !restApiKey;

    // 2. Simulationsmodus (wenn kein API Key hinterlegt ist)
    if (isSimulated) {
      const { data: record, error: insErr } = await supa
        .from("push_notifications")
        .insert({
          title,
          message,
          target_group,
          target_person_number: target_person_number || null,
          target_url: target_url || null,
          sent_by_user: sent_by_user || "Vorstand",
          recipients_count: 0,
          onesignal_id: "simulated_" + Date.now(),
          status: "simulated",
          error_message: restApiKey ? null : "Simulationsmodus: OneSignal REST API Key noch nicht in den Einstellungen hinterlegt."
        })
        .select()
        .single();

      return new Response(
        JSON.stringify({
          success: true,
          simulated: true,
          message: restApiKey
            ? "Simulationsmodus erfolgreich ausgeführt."
            : "OneSignal REST API Key ist noch nicht hinterlegt. Die Mitteilung wurde im Protokoll als Simulation erfasst.",
          record
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. OneSignal REST API Payload aufbauen
    const oneSignalPayload: Record<string, any> = {
      app_id: appId,
      headings: { de: title, en: title },
      contents: { de: message, en: message }
    };

    if (target_url && target_url.trim() !== "") {
      oneSignalPayload.url = target_url.trim();
    }

    if (target_group === "alle") {
      oneSignalPayload.included_segments = ["Total Subscriptions"];
    } else if (target_group === "aktiv") {
      oneSignalPayload.filters = [{ field: "tag", key: "personenkreis", relation: "=", value: "aktiv" }];
    } else if (target_group === "passiv") {
      oneSignalPayload.filters = [{ field: "tag", key: "personenkreis", relation: "=", value: "passiv" }];
    } else if (target_group === "vorstand") {
      oneSignalPayload.filters = [{ field: "tag", key: "is_board", relation: "=", value: "true" }];
    } else if (target_group === "individual" && target_person_number) {
      const paddedPid = String(target_person_number).padStart(6, "0");
      oneSignalPayload.filters = [{ field: "tag", key: "lizenz", relation: "=", value: paddedPid }];
    } else {
      oneSignalPayload.included_segments = ["Total Subscriptions"];
    }

    console.log("Sende OneSignal Push:", JSON.stringify(oneSignalPayload));

    // 4. API Request an OneSignal senden
    const osResponse = await fetch("https://onesignal.com/api/v1/notifications", {
      method: "POST",
      headers: {
        "Authorization": `Key ${restApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(oneSignalPayload)
    });

    const osData = await osResponse.json();
    console.log("OneSignal Rückmeldung:", osResponse.status, osData);

    const isSuccess = osResponse.ok && Boolean(osData.id);
    const osErrors = osData.errors ? JSON.stringify(osData.errors) : null;

    // 5. In public.push_notifications protokollieren
    const { data: record, error: insErr } = await supa
      .from("push_notifications")
      .insert({
        title,
        message,
        target_group,
        target_person_number: target_person_number || null,
        target_url: target_url || null,
        sent_by_user: sent_by_user || "Vorstand",
        recipients_count: osData.recipients || 0,
        onesignal_id: osData.id || null,
        status: isSuccess ? "sent" : "failed",
        error_message: isSuccess ? null : (osErrors || "Fehler beim OneSignal REST Aufruf")
      })
      .select()
      .single();

    if (!isSuccess) {
      return new Response(
        JSON.stringify({
          success: false,
          error: osErrors || "OneSignal hat den Versand abgelehnt.",
          details: osData
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        onesignal_id: osData.id,
        recipients: osData.recipients || 0,
        record
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (err: any) {
    console.error("send-push-notification Fehler:", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message || "Interner Serverfehler" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
