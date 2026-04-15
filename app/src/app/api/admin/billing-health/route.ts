import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { withAuth } from "@/lib/auth/api-auth";
import { getStripeEnvironment } from "@/lib/stripe/environment";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

function isMissingColumnError(message?: string | null) {
  return typeof message === "string" && message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist");
}

export const GET = withAuth(async () => {
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
  const environment = getStripeEnvironment();
  const schemaWarnings: string[] = [];

  const countInvoices = async (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin
      .from("invoices")
      .select("*", { count: "exact", head: true });

    if (withEnvironmentFilter) {
      query = query.eq("environment", environment);
    }

    return query;
  };

  const countSubscriptions = async (withEnvironmentFilter: boolean) => {
    let query = supabaseAdmin
      .from("subscriptions")
      .select("*", { count: "exact", head: true });

    if (withEnvironmentFilter) {
      query = query.eq("environment", environment);
    }

    return query;
  };

  const [
    invoicesCountResult,
    subscriptionsCountResult,
    failedSyncCountResult,
    recentSyncsResult,
    recentFailuresResult,
    latestSuccessResult,
  ] = await Promise.all([
    countInvoices(true),
    countSubscriptions(true),
    supabaseAdmin
      .from("stripe_sync_log")
      .select("*", { count: "exact", head: true })
      .eq("status", "failed"),
    supabaseAdmin
      .from("stripe_sync_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20),
    supabaseAdmin
      .from("stripe_sync_log")
      .select("*")
      .eq("status", "failed")
      .order("created_at", { ascending: false })
      .limit(10),
    supabaseAdmin
      .from("stripe_sync_log")
      .select("created_at, event_type, object_type, object_id")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  let mirroredInvoices = invoicesCountResult.count || 0;
  let mirroredSubscriptions = subscriptionsCountResult.count || 0;

  if (invoicesCountResult.error && isMissingColumnError(invoicesCountResult.error.message)) {
    schemaWarnings.push("Migration 040 saknas i databasen. Billing Health visar totalsiffror utan miljöseparation.");
    const fallbackInvoices = await countInvoices(false);
    mirroredInvoices = fallbackInvoices.count || 0;
  }

  if (subscriptionsCountResult.error && isMissingColumnError(subscriptionsCountResult.error.message)) {
    const fallbackSubscriptions = await countSubscriptions(false);
    mirroredSubscriptions = fallbackSubscriptions.count || 0;
  }

  return NextResponse.json({
    environment,
    schemaWarnings,
    stats: {
      mirroredInvoices,
      mirroredSubscriptions,
      failedSyncs: failedSyncCountResult.count || 0,
      latestSuccessfulSyncAt: latestSuccessResult.data?.created_at || null,
    },
    latestSuccess: latestSuccessResult.data || null,
    recentSyncs: recentSyncsResult.data || [],
    recentFailures: recentFailuresResult.data || [],
  });
}, ["admin"]);
