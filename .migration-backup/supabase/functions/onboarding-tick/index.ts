import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type CustomerRow = {
  id: string;
  concepts_per_week: number;
  tiktok_handle: string | null;
  onboarding_state: "invited" | "cm_ready" | "live" | "settled";
};

type FeedplanConceptRow = {
  customer_id: string;
  status: string;
};

type PublicationRow = {
  customer_id: string;
  published_at: string;
};

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getSupabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("NEXT_PUBLIC_SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !key) {
    throw new Error("Supabase admin env vars are missing");
  }

  return createClient(url, key, { auth: { persistSession: false } });
}

function getCronSecret() {
  return Deno.env.get("CRON_SECRET") ?? Deno.env.get("VERCEL_CRON_SECRET") ?? "";
}

function deriveState(input: {
  contentPlanSet: boolean;
  startConceptsLoaded: boolean;
  tiktokHandleConfirmed: boolean;
  firstPublicationAt: string | null;
}): "invited" | "cm_ready" | "live" | "settled" {
  if (input.firstPublicationAt) {
    const liveForMs = Date.now() - new Date(input.firstPublicationAt).getTime();
    if (liveForMs >= 14 * 86_400_000) {
      return "settled";
    }
    return "live";
  }

  if (input.contentPlanSet && input.startConceptsLoaded && input.tiktokHandleConfirmed) {
    return "cm_ready";
  }

  return "invited";
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  const cronSecret = getCronSecret();
  if (!cronSecret) {
    return json(503, { error: "CRON_SECRET is not configured" });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (token !== cronSecret) {
    return json(401, { error: "Unauthorized" });
  }

  try {
    const supabase = getSupabaseAdmin();
    const [{ data: customers, error: customerError }, { data: feedplanConcepts, error: feedplanError }, { data: publications, error: publicationError }] =
      await Promise.all([
        supabase
          .from("customer_profiles")
          .select("id, concepts_per_week, tiktok_handle, onboarding_state")
          .in("status", ["pending", "invited", "agreed", "active"]),
        supabase
          .from("feedplan_concepts")
          .select("customer_id, status")
          .in("status", ["draft", "ready"]),
        supabase
          .from("tiktok_publications")
          .select("customer_id, published_at")
          .order("published_at", { ascending: true }),
      ]);

    if (customerError || feedplanError || publicationError) {
      throw new Error(customerError?.message || feedplanError?.message || publicationError?.message || "Query failed");
    }

    const conceptCounts = new Map<string, number>();
    for (const row of (feedplanConcepts ?? []) as FeedplanConceptRow[]) {
      conceptCounts.set(row.customer_id, (conceptCounts.get(row.customer_id) ?? 0) + 1);
    }

    const firstPublicationAt = new Map<string, string>();
    for (const row of (publications ?? []) as PublicationRow[]) {
      if (!firstPublicationAt.has(row.customer_id)) {
        firstPublicationAt.set(row.customer_id, row.published_at);
      }
    }

    let updated = 0;

    for (const customer of (customers ?? []) as CustomerRow[]) {
      const nextState = deriveState({
        contentPlanSet: customer.concepts_per_week >= 1,
        startConceptsLoaded: (conceptCounts.get(customer.id) ?? 0) > 0,
        tiktokHandleConfirmed: Boolean(customer.tiktok_handle),
        firstPublicationAt: firstPublicationAt.get(customer.id) ?? null,
      });

      if (nextState !== customer.onboarding_state) {
        const { error } = await supabase
          .from("customer_profiles")
          .update({ onboarding_state: nextState })
          .eq("id", customer.id);

        if (error) {
          throw new Error(error.message);
        }

        updated++;
      }
    }

    return json(200, {
      ok: true,
      customers_seen: customers?.length ?? 0,
      onboarding_updated: updated,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
