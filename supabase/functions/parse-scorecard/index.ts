import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { corsHeaders } from "../_shared/cors.ts";

const SYSTEM_PROMPT = `Eres un experto en leer tarjetas de score (scorecards) de golf, tanto impresas como con anotaciones manuscritas.

Analiza la imagen y extrae los datos de los jugadores y sus scores por hoyo (18 hoyos estándar).

Reglas estrictas:
- Devuelve SIEMPRE JSON válido conforme al esquema entregado, sin texto adicional.
- Cada jugador debe tener un array "scores" de exactamente 18 posiciones. Si algún hoyo no es legible, usa null en ese índice.
- "putts" es opcional: si la tarjeta claramente incluye putts por hoyo devuelve array de 18 (usando null cuando no sea legible). Si la tarjeta NO tiene putts, devuelve null.
- Ignora filas que sean par, hándicap del hoyo, yardajes o totales — solo extrae filas de jugadores.
- "nameInCard" debe ser el nombre tal como aparece escrito (respeta mayúsculas/acentos si son legibles).
- "detectedCourseName": nombre del campo si aparece impreso o escrito, si no null.
- "detectedDate": formato YYYY-MM-DD si se puede inferir con seguridad, si no null.
- "detectedTeeColor": uno de "azul","blanco","amarillo","rojo","negro","dorado" si aparece marcado, si no null.
- "confidence": "high" si la tarjeta es muy legible, "medium" si hay ambigüedad parcial, "low" si mucha información es dudosa.`;

const SCHEMA = {
  type: "object",
  properties: {
    detectedPlayers: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nameInCard: { type: "string" },
          scores: {
            type: "array",
            items: { type: ["integer", "null"] },
          },
          putts: {
            type: ["array", "null"],
            items: { type: ["integer", "null"] },
          },
        },
        required: ["nameInCard", "scores", "putts"],
        additionalProperties: false,
      },
    },
    detectedCourseName: { type: ["string", "null"] },
    detectedDate: { type: ["string", "null"] },
    detectedTeeColor: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["detectedPlayers", "detectedCourseName", "detectedDate", "detectedTeeColor", "confidence"],
  additionalProperties: false,
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Require an authenticated caller before spending any AI credits
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const authClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userError } = await authClient.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "Missing LOVABLE_API_KEY" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const imageDataUrl: string | undefined = body?.imageDataUrl;
    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return new Response(
        JSON.stringify({ error: "imageDataUrl (data URL image) es requerido" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const gatewayResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "text", text: "Extrae los datos de esta tarjeta de score de golf." },
              { type: "image_url", image_url: { url: imageDataUrl } },
            ],
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "scorecard_extraction",
            strict: true,
            schema: SCHEMA,
          },
        },
      }),
    });

    if (!gatewayResp.ok) {
      const errText = await gatewayResp.text();
      const status = gatewayResp.status === 429 || gatewayResp.status === 402 ? gatewayResp.status : 502;
      return new Response(
        JSON.stringify({ error: "Fallo al analizar la tarjeta", detail: errText, upstreamStatus: gatewayResp.status }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const json = await gatewayResp.json();
    const content: string | undefined = json?.choices?.[0]?.message?.content;
    if (!content) {
      return new Response(JSON.stringify({ error: "Respuesta vacía del modelo" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      return new Response(JSON.stringify({ error: "Respuesta no era JSON válido", raw: content }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
