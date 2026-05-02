import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

type AttentionSnooze = {
  id: string;
  subject_type: "invoice" | "onboarding" | "cm_notification" | "customer_blocking" | "demo_response";
  subject_id: string;
  snoozed_until: string | null;
  released_at: string | null;
};

type InvoiceRow = {
  stripe_invoice_id: string;
  customer_profile_id: string | null;
  status: string | null;
  due_date: string | null;
  created_at: string;
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

async function releaseSnooze(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  snoozeId: string,
  reason: "expired" | "escalated",
) {
  const { error } = await supabase
    .from("attention_snoozes")
    .update({
      released_at: new Date().toISOString(),
      release_reason: reason,
    })
    .eq("id", snoozeId)
    .is("released_at", null);

  if (error) {
    throw new Error(error.message);
  }
}

async function shouldReleaseInvoiceSnooze(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subjectId: string,
) {
  const { data: invoice, error } = await supabase
    .from("invoices")
    .select("stripe_invoice_id, customer_profile_id, status, due_date, created_at")
    .eq("stripe_invoice_id", subjectId)
    .maybeSingle<InvoiceRow>();

  if (error) {
    throw new Error(error.message);
  }

  if (!invoice) {
    return true;
  }

  const status = (invoice.status ?? "").toLowerCase();
  if (!["open", "past_due", "uncollectible"].includes(status)) {
    return true;
  }

  if (invoice.due_date) {
    const daysPastDue = Math.floor((Date.now() - new Date(invoice.due_date).getTime()) / 86_400_000);
    if (daysPastDue >= 14) {
      return true;
    }
  }

  if (invoice.customer_profile_id) {
    const { count, error: newerInvoiceError } = await supabase
      .from("invoices")
      .select("id", { count: "exact", head: true })
      .eq("customer_profile_id", invoice.customer_profile_id)
      .gt("created_at", invoice.created_at);

    if (newerInvoiceError) {
      throw new Error(newerInvoiceError.message);
    }

    if ((count ?? 0) > 0) {
      return true;
    }
  }

  return false;
}

async function shouldReleaseOnboardingSnooze(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subjectId: string,
) {
  const { data, error } = await supabase
    .from("customer_profiles")
    .select("onboarding_state")
    .eq("id", subjectId)
    .maybeSingle<{ onboarding_state: string | null }>();

  if (error) {
    throw new Error(error.message);
  }

  return !data || data.onboarding_state !== "cm_ready";
}

async function shouldReleaseCmNotificationSnooze(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subjectId: string,
) {
  const { data, error } = await supabase
    .from("cm_notifications")
    .select("resolved_at")
    .eq("id", subjectId)
    .maybeSingle<{ resolved_at: string | null }>();

  if (error) {
    throw new Error(error.message);
  }

  return !data || data.resolved_at !== null;
}

async function shouldReleaseDemoResponseSnooze(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subjectId: string,
) {
  const { data, error } = await supabase
    .from("demos")
    .select("status")
    .eq("id", subjectId)
    .maybeSingle<{ status: string | null }>();

  if (error) {
    throw new Error(error.message);
  }

  return !data || data.status !== "responded";
}

async function shouldReleaseCustomerBlockingSnooze(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  subjectId: string,
) {
  const [{ data: customer, error: customerError }, { data: publications, error: publicationError }] =
    await Promise.all([
      supabase
        .from("customer_profiles")
        .select("paused_until")
        .eq("id", subjectId)
        .maybeSingle<{ paused_until: string | null }>(),
      supabase
        .from("tiktok_publications")
        .select("published_at")
        .eq("customer_id", subjectId)
        .order("published_at", { ascending: false })
        .limit(1),
    ]);

  if (customerError) {
    throw new Error(customerError.message);
  }

  if (publicationError) {
    throw new Error(publicationError.message);
  }

  if (!customer) {
    return true;
  }

  if (customer.paused_until && new Date(customer.paused_until) > new Date()) {
    return true;
  }

  const latestPublication = publications?.[0]?.published_at ?? null;
  if (!latestPublication) {
    return false;
  }

  const daysSincePublish = Math.floor((Date.now() - new Date(latestPublication).getTime()) / 86_400_000);
  return daysSincePublish < 10;
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
    const releasedExpired = await supabase
      .from("attention_snoozes")
      .update({
        released_at: new Date().toISOString(),
        release_reason: "expired",
      })
      .is("released_at", null)
      .not("snoozed_until", "is", null)
      .lt("snoozed_until", new Date().toISOString())
      .select("id");

    if (releasedExpired.error) {
      throw new Error(releasedExpired.error.message);
    }

    const expiredDemos = await supabase
      .from("demos")
      .update({ status: "expired" })
      .eq("status", "sent")
      .lt("sent_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .select("id");

    if (expiredDemos.error) {
      throw new Error(expiredDemos.error.message);
    }

    const { data: activeSnoozes, error: activeSnoozesError } = await supabase
      .from("attention_snoozes")
      .select("id, subject_type, subject_id, snoozed_until, released_at")
      .is("released_at", null)
      .is("snoozed_until", null);

    if (activeSnoozesError) {
      throw new Error(activeSnoozesError.message);
    }

    let escalatedReleased = 0;

    for (const snooze of (activeSnoozes ?? []) as AttentionSnooze[]) {
      let shouldRelease = false;

      switch (snooze.subject_type) {
        case "invoice":
          shouldRelease = await shouldReleaseInvoiceSnooze(supabase, snooze.subject_id);
          break;
        case "onboarding":
          shouldRelease = await shouldReleaseOnboardingSnooze(supabase, snooze.subject_id);
          break;
        case "cm_notification":
          shouldRelease = await shouldReleaseCmNotificationSnooze(supabase, snooze.subject_id);
          break;
        case "demo_response":
          shouldRelease = await shouldReleaseDemoResponseSnooze(supabase, snooze.subject_id);
          break;
        case "customer_blocking":
          shouldRelease = await shouldReleaseCustomerBlockingSnooze(supabase, snooze.subject_id);
          break;
      }

      if (shouldRelease) {
        await releaseSnooze(supabase, snooze.id, "escalated");
        escalatedReleased++;
      }
    }

    return json(200, {
      ok: true,
      expired_snoozes_released: releasedExpired.data?.length ?? 0,
      escalated_snoozes_released: escalatedReleased,
      demos_expired: expiredDemos.data?.length ?? 0,
    });
  } catch (error) {
    return json(500, {
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});
