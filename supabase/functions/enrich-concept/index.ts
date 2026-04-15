import { serve } from "https://deno.land/std@0.224.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `Du är en innehållsstrateg för svenska restauranger, barer, caféer och hotell.

Du får analysdata för ett videokoncept och ska returnera strukturerad JSON för LeTrends konceptbibliotek.

Regler:
- All text ska vara på svenska.
- headline_sv: max 60 tecken, konkret och säljbar.
- description_sv: 1-2 meningar om vad kunden faktiskt ska filma.
- whyItWorks_sv: 2-3 meningar om varför formatet engagerar.
- script_sv: använd befintligt transkript om det finns, annars skriv ett föreslaget manus.
- productionNotes_sv: 3-5 tydliga steg.
- whyItFits_sv: 2-3 korta argument.
- businessTypes: välj 1-3 av [bar, restaurang, cafe, bistro, hotell, foodtruck, nattklubb, bageri].
- difficulty: easy, medium eller advanced.
- filmTime: 5min, 10min, 15min, 20min, 30min, 1hr eller 1hr_plus.
- peopleNeeded: solo, duo, small_team eller team.
- mechanism: subversion, contrast, recognition, dark, escalation, deadpan eller absurdism.
- market: SE, US eller UK.
- trendLevel: 1-5.
- estimatedBudget: free, low, medium eller high.
- hasScript ska vara true om konceptet har ett tydligt manus eller tydliga repliker att följa.`;

const TOOL = {
  type: "function",
  function: {
    name: "enrich_concept",
    description: "Return structured concept data for the concept library",
    parameters: {
      type: "object",
      properties: {
        headline_sv: { type: "string" },
        description_sv: { type: "string" },
        whyItWorks_sv: { type: "string" },
        script_sv: { type: "string" },
        productionNotes_sv: { type: "array", items: { type: "string" } },
        whyItFits_sv: { type: "array", items: { type: "string" } },
        difficulty: { type: "string", enum: ["easy", "medium", "advanced"] },
        filmTime: { type: "string", enum: ["5min", "10min", "15min", "20min", "30min", "1hr", "1hr_plus"] },
        peopleNeeded: { type: "string", enum: ["solo", "duo", "small_team", "team"] },
        mechanism: { type: "string", enum: ["subversion", "contrast", "recognition", "dark", "escalation", "deadpan", "absurdism"] },
        market: { type: "string", enum: ["SE", "US", "UK"] },
        trendLevel: { type: "number" },
        businessTypes: {
          type: "array",
          items: { type: "string", enum: ["bar", "restaurang", "cafe", "bistro", "hotell", "foodtruck", "nattklubb", "bageri"] }
        },
        hasScript: { type: "boolean" },
        estimatedBudget: { type: "string", enum: ["free", "low", "medium", "high"] }
      },
      required: [
        "headline_sv",
        "description_sv",
        "whyItWorks_sv",
        "script_sv",
        "productionNotes_sv",
        "whyItFits_sv",
        "difficulty",
        "filmTime",
        "peopleNeeded",
        "mechanism",
        "market",
        "trendLevel",
        "businessTypes",
        "hasScript",
        "estimatedBudget"
      ],
      additionalProperties: false
    }
  }
} as const;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { backend_data } = await req.json();
    if (!backend_data || typeof backend_data !== "object") {
      return new Response(JSON.stringify({ error: "backend_data is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: Deno.env.get("LOVABLE_AI_MODEL") || "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: `Analysera detta koncept och returnera enbart strukturerad data:\n\n${JSON.stringify(backend_data, null, 2)}`,
          },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "enrich_concept" } },
      }),
    });

    if (!response.ok) {
      const details = await response.text().catch(() => "");
      return new Response(JSON.stringify({ error: "AI gateway error", details }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await response.json();
    const toolCall = result?.choices?.[0]?.message?.tool_calls?.[0];
    const rawArgs = toolCall?.function?.arguments;

    if (typeof rawArgs !== "string" || !rawArgs.trim()) {
      return new Response(JSON.stringify({ error: "No structured response" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ overrides: JSON.parse(rawArgs) }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
