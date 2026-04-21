import { withAuth } from "@/lib/auth/api-auth";
import { jsonOk } from "@/lib/server/api-response";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import { getStripeEnvironment } from "@/lib/stripe/environment";

function isMissingColumnError(message?: string | null) {
  return typeof message === "string" && message.toLowerCase().includes("column") && message.toLowerCase().includes("does not exist");
}

export const GET = withAuth(async () => {
  const supabaseAdmin = createSupabaseAdmin();
  const environment = getStripeEnvironment();
  const schemaWarnings: string[] = [];
  const syncLogEnvironmentWarning =
    "stripe_sync_log saknar environment-kolumn i databasen. Billing Health visar sync-loggar utan garanterad test/live-separation.";

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

  const runSyncLogQueries = async (withEnvironmentFilter: boolean) => {
    const applyEnvironmentFilter = <T extends { eq: (column: string, value: string) => T }>(
      query: T
    ) => {
      if (!withEnvironmentFilter) {
        return query;
      }

      return query.eq("environment", environment);
    };

    return Promise.all([
      applyEnvironmentFilter(
        supabaseAdmin
          .from("stripe_sync_log")
          .select("*", { count: "exact", head: true })
          .eq("status", "failed")
      ),
      applyEnvironmentFilter(
        supabaseAdmin
          .from("stripe_sync_log")
          .select("*")
          .order("created_at", { ascending: false })
          .limit(20)
      ),
      applyEnvironmentFilter(
        supabaseAdmin
          .from("stripe_sync_log")
          .select("*")
          .eq("status", "failed")
          .order("created_at", { ascending: false })
          .limit(10)
      ),
      applyEnvironmentFilter(
        supabaseAdmin
          .from("stripe_sync_log")
          .select("created_at, event_type, object_type, object_id")
          .eq("status", "success")
          .order("created_at", { ascending: false })
          .limit(1)
      ).maybeSingle(),
    ]);
  };

  const [
    invoicesCountResult,
    subscriptionsCountResult,
  ] = await Promise.all([
    countInvoices(true),
    countSubscriptions(true),
  ]);
  let [
    failedSyncCountResult,
    recentSyncsResult,
    recentFailuresResult,
    latestSuccessResult,
  ] = await runSyncLogQueries(true);

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

  const syncLogEnvironmentColumnMissing = [
    failedSyncCountResult,
    recentSyncsResult,
    recentFailuresResult,
    latestSuccessResult,
  ].some((result) => isMissingColumnError(result.error?.message));

  if (syncLogEnvironmentColumnMissing) {
    schemaWarnings.push(syncLogEnvironmentWarning);
    [
      failedSyncCountResult,
      recentSyncsResult,
      recentFailuresResult,
      latestSuccessResult,
    ] = await runSyncLogQueries(false);
  }

  return jsonOk({
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
