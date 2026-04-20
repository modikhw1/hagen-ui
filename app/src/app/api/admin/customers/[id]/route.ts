import { NextRequest } from "next/server";
import { AuthError, validateApiRequest } from "@/lib/auth/api-auth";
import { stripe } from "@/lib/stripe/dynamic-config";
import { logCustomerInvited } from "@/lib/activity/logger";
import { applyPriceToSubscription } from "@/lib/stripe/subscription-pricing";
import { resolveAccountManagerAssignment } from "@/lib/studio/account-manager";
import { getAppUrl } from "@/lib/url/public";
import {
  customerPatchSchema,
  sendInviteActionSchema,
} from "@/lib/schemas/customer";
import { z } from "zod";
import {
  archiveStripeCustomer,
  cancelCustomerSubscription,
  pauseCustomerSubscription,
  resumeCustomerSubscription,
} from "@/lib/stripe/admin-billing";
import { deriveTikTokHandle, toCanonicalTikTokProfileUrl } from "@/lib/tiktok/profile";
import { jsonError, jsonOk } from "@/lib/server/api-response";
import { createSupabaseAdmin } from "@/lib/server/supabase-admin";
import type { TablesUpdate } from "@/types/database";

interface RouteParams {
  params: Promise<{ id: string }>;
}

function isMissingRelationError(message?: string | null) {
  return (
    typeof message === "string" &&
    message.toLowerCase().includes("relation") &&
    message.toLowerCase().includes("does not exist")
  );
}

function buildCustomerPayload(
  profile: Record<string, unknown>,
  options?: {
    bufferRow?: Record<string, unknown> | null;
    attentionSnoozes?: Array<Record<string, unknown>>;
  },
) {
  return {
    customer: {
      ...profile,
      latest_planned_publish_date:
        options?.bufferRow?.latest_planned_publish_date ?? null,
      last_published_at: options?.bufferRow?.last_published_at ?? null,
      attention_snoozes: options?.attentionSnoozes ?? [],
    },
    profile: {
      ...profile,
      latest_planned_publish_date:
        options?.bufferRow?.latest_planned_publish_date ?? null,
      last_published_at: options?.bufferRow?.last_published_at ?? null,
      attention_snoozes: options?.attentionSnoozes ?? [],
    },
  };
}

function buildValidationErrorResponse(error: z.ZodError) {
  return jsonError(
    "Ogiltig payload",
    400,
    {
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
  );
}

function buildRouteErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return jsonError(error.message, error.statusCode);
  }

  const message =
    error instanceof Error ? error.message : "Internt serverfel";
  return jsonError(message, 500);
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, [
      "admin",
      "customer",
      "content_manager",
    ]);
    const { id } = await params;

    if (!id) {
      return jsonError("Kund-ID kravs", 400);
    }

    const supabaseAdmin = createSupabaseAdmin();

    const [{ data: profile, error }, bufferResult, snoozesResult] =
      await Promise.all([
        supabaseAdmin
          .from("customer_profiles")
          .select("*")
          .eq("id", id)
          .single(),
        (((supabaseAdmin.from("v_customer_buffer" as never) as never) as {
          select: (
            columns: string,
          ) => {
            eq: (
              column: string,
              value: string,
            ) => {
              maybeSingle: () => Promise<{
                data: Record<string, unknown> | null;
                error: { message?: string } | null;
              }>;
            };
          };
        }).select(
          "customer_id, assigned_cm_id, concepts_per_week, paused_until, latest_planned_publish_date, last_published_at",
        )).eq("customer_id", id).maybeSingle(),
        (((supabaseAdmin.from("attention_snoozes" as never) as never) as {
          select: (
            columns: string,
          ) => {
            in: (
              column: string,
              values: string[],
            ) => {
              eq: (
                innerColumn: string,
                innerValue: string,
              ) => {
                is: (
                  nullableColumn: string,
                  nullableValue: null,
                ) => Promise<{
                  data: Array<Record<string, unknown>> | null;
                  error: { message?: string } | null;
                }>;
              };
            };
          };
        }).select(
          "subject_type, subject_id, snoozed_until, released_at, note",
        )).in("subject_type", ["onboarding", "customer_blocking"])
          .eq("subject_id", id)
          .is("released_at", null),
      ]);

    if (error) {
      return jsonError(error.message, 500);
    }

    if (bufferResult.error && !isMissingRelationError(bufferResult.error.message)) {
      return jsonError(
        bufferResult.error.message || "Kunde inte hamta bufferdata",
        500,
      );
    }

    if (snoozesResult.error && !isMissingRelationError(snoozesResult.error.message)) {
      return jsonError(
        snoozesResult.error.message || "Kunde inte hamta hanteras-markeringar",
        500,
      );
    }

    // Non-admin access follows the explicit role/ownership model.
    if (!user.is_admin && user.role !== "admin") {
      const isAssignedContentManager =
        user.role === "content_manager" &&
        profile?.account_manager_profile_id === user.id;
      const isCustomerOwner =
        user.role === "customer" &&
        (profile?.user_id === user.id || profile?.id === user.id);

      if (!isAssignedContentManager && !isCustomerOwner) {
        return jsonError("Du saknar behorighet", 403);
      }
    }

    return jsonOk(
      buildCustomerPayload(profile as Record<string, unknown>, {
        bufferRow: bufferResult.data ?? null,
        attentionSnoozes: snoozesResult.data ?? [],
      }),
    );
  } catch (error: unknown) {
    return buildRouteErrorResponse(error);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ["admin"]);

    const { id } = await params;

    if (!id) {
      return jsonError("Kund-ID kravs", 400);
    }

    const body = await request.json();
    const supabaseAdmin = createSupabaseAdmin();

    // --- Action: send_invite ---
    if (body.action === "send_invite") {
      const parsedInvite = sendInviteActionSchema.safeParse(body);
      if (!parsedInvite.success) {
        return buildValidationErrorResponse(parsedInvite.error);
      }

      const inviteInput = parsedInvite.data;
      const appUrl = getAppUrl();
      const canonicalTikTokProfileUrl = inviteInput.tiktok_profile_url
        ? toCanonicalTikTokProfileUrl(inviteInput.tiktok_profile_url)
        : null;
      const tiktokHandle = inviteInput.tiktok_profile_url
        ? deriveTikTokHandle(inviteInput.tiktok_profile_url)
        : null;

      if (inviteInput.tiktok_profile_url && (!canonicalTikTokProfileUrl || !tiktokHandle)) {
        return jsonError(
          "Ogiltig TikTok-profil. Anvand en profil-URL eller @handle.",
          400,
        );
      }

      let stripeCustomerId: string | null = null;
      let stripeSubscriptionId: string | null = null;

      const pricingStatus =
        inviteInput.pricing_status === "unknown" ? "unknown" : "fixed";
      if (
        stripe &&
        pricingStatus === "fixed" &&
        Number(inviteInput.monthly_price) > 0
      ) {
        try {
          const customer = await stripe.customers.create({
            email: inviteInput.contact_email,
            name: inviteInput.business_name,
            preferred_locales: ["sv"],
            metadata: {
              customer_profile_id: id,
              pricing_status: pricingStatus,
            },
          });
          stripeCustomerId = customer.id;

          const subscriptionInterval =
            inviteInput.subscription_interval || "month";
          const stripeInterval: "day" | "week" | "month" | "year" =
            subscriptionInterval === "quarter"
              ? "month"
              : subscriptionInterval === "year"
                ? "year"
                : "month";
          const intervalCount = subscriptionInterval === "quarter" ? 3 : 1;

          const intervalText =
            subscriptionInterval === "month"
              ? "manadsvis"
              : subscriptionInterval === "quarter"
                ? "kvartalsvis"
                : "arligen";

          const product = await stripe.products.create({
            name: "LeTrend Prenumeration",
            description:
              inviteInput.invoice_text ||
              `${inviteInput.business_name} - ${intervalText}`,
            tax_code: "txcd_10000000",
            metadata: {
              scope_items: JSON.stringify(inviteInput.scope_items || []),
              invoice_text: inviteInput.invoice_text || "",
              contract_start_date: inviteInput.contract_start_date || "",
              billing_day_of_month: String(
                inviteInput.billing_day_of_month || 25,
              ),
              first_invoice_behavior:
                inviteInput.first_invoice_behavior || "prorated",
              upcoming_monthly_price: String(
                inviteInput.upcoming_monthly_price || "",
              ),
              upcoming_price_effective_date:
                inviteInput.upcoming_price_effective_date || "",
            },
          });

          const price = await stripe.prices.create({
            unit_amount: Math.round(inviteInput.monthly_price * 100),
            currency: "sek",
            recurring: {
              interval: stripeInterval,
              interval_count: intervalCount,
            },
            product: product.id,
          });

          const subscription = await stripe.subscriptions.create({
            customer: customer.id,
            items: [{ price: price.id }],
            collection_method: "send_invoice",
            days_until_due: 14,
            metadata: {
              customer_profile_id: id,
              scope_items: JSON.stringify(inviteInput.scope_items || []),
              invoice_text: inviteInput.invoice_text || "",
              pricing_status: pricingStatus,
              contract_start_date: inviteInput.contract_start_date || "",
              billing_day_of_month: String(
                inviteInput.billing_day_of_month || 25,
              ),
              first_invoice_behavior:
                inviteInput.first_invoice_behavior || "prorated",
              upcoming_monthly_price: String(
                inviteInput.upcoming_monthly_price || "",
              ),
              upcoming_price_effective_date:
                inviteInput.upcoming_price_effective_date || "",
            },
          });
          stripeSubscriptionId = subscription.id;
        } catch (stripeError: unknown) {
          const e = stripeError as Record<string, unknown>;
          console.error("Stripe error:", e?.type, e?.message, e?.code);
          // Don't leave an orphaned Stripe customer
          if (stripeCustomerId && !stripeSubscriptionId && stripe) {
            try {
              await stripe.customers.del(stripeCustomerId);
              stripeCustomerId = null;
            } catch (deleteError) {
              console.error("Failed to delete orphaned customer:", deleteError);
            }
          }
        }
      }

      const { error: inviteError } =
        await supabaseAdmin.auth.admin.inviteUserByEmail(
          inviteInput.contact_email,
          {
          data: {
            business_name: inviteInput.business_name,
            customer_profile_id: id,
            stripe_customer_id: stripeCustomerId,
            stripe_subscription_id: stripeSubscriptionId,
          },
          redirectTo: `${appUrl}/auth/callback`,
          },
        );

      if (inviteError) {
        console.error("Invite error:", inviteError);
        return jsonError(inviteError.message, 500);
      }

      const updateData: TablesUpdate<"customer_profiles"> = {
        status: "invited",
        invited_at: new Date().toISOString(),
      };

      if (stripeCustomerId) updateData.stripe_customer_id = stripeCustomerId;
      if (stripeSubscriptionId)
        updateData.stripe_subscription_id = stripeSubscriptionId;
      if (inviteInput.invoice_text)
        updateData.invoice_text = inviteInput.invoice_text;
      if (inviteInput.scope_items?.length > 0)
        updateData.scope_items = inviteInput.scope_items;
      if (inviteInput.subscription_interval)
        updateData.subscription_interval = inviteInput.subscription_interval;
      if (inviteInput.customer_contact_name !== undefined)
        updateData.customer_contact_name =
          inviteInput.customer_contact_name || null;
      if (inviteInput.account_manager !== undefined)
        updateData.account_manager = inviteInput.account_manager || null;
      if (canonicalTikTokProfileUrl !== null) {
        updateData.tiktok_profile_url = canonicalTikTokProfileUrl;
        updateData.tiktok_handle = tiktokHandle;
      }
      if (inviteInput.pricing_status)
        updateData.pricing_status =
          inviteInput.pricing_status === "unknown" ? "unknown" : "fixed";
      if (inviteInput.contract_start_date)
        updateData.contract_start_date = inviteInput.contract_start_date;
      if (inviteInput.billing_day_of_month)
        updateData.billing_day_of_month = Math.max(
          1,
          Math.min(28, Number(inviteInput.billing_day_of_month) || 25),
        );
      if (inviteInput.first_invoice_behavior)
        updateData.first_invoice_behavior =
          inviteInput.first_invoice_behavior;
      if (inviteInput.upcoming_monthly_price !== undefined)
        updateData.upcoming_monthly_price =
          Number(inviteInput.upcoming_monthly_price) || null;
      if (inviteInput.upcoming_price_effective_date !== undefined)
        updateData.upcoming_price_effective_date =
          inviteInput.upcoming_price_effective_date || null;

      const { data: profile, error: updateError } = await supabaseAdmin
        .from("customer_profiles")
        .update(updateData)
        .eq("id", id)
        .select()
        .single();

      if (updateError) {
        return jsonError(updateError.message, 500);
      }

      await logCustomerInvited(
        user.id,
        user.email || "unknown",
        id,
        inviteInput.business_name,
        inviteInput.contact_email,
      );

      return jsonOk({
        ...buildCustomerPayload(profile),
        message: "Inbjudan skickades.",
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: stripeSubscriptionId,
      });
    }

    // --- Action: activate ---
    if (body.action === "activate") {
      const { data, error } = await supabaseAdmin
        .from("customer_profiles")
        .update({ status: "active", agreed_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error)
        return jsonError(error.message, 500);
      return jsonOk(buildCustomerPayload(data));
    }

    // --- Action: send_reminder ---
    if (body.action === "send_reminder") {
      const { error: profileError } = await supabaseAdmin
        .from("customer_profiles")
        .select("id")
        .eq("id", id)
        .single();

      if (profileError)
        return jsonError(profileError.message, 500);

      return jsonOk({
        message:
          "Kunden har redan ett konto och kan logga in for att fortsatta.",
        already_registered: true,
      });
    }

    if (body.action === "cancel_subscription") {
      const subscription = await cancelCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      return jsonOk({ success: true, subscription });
    }

    if (body.action === "pause_subscription") {
      const subscription = await pauseCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      return jsonOk({ success: true, subscription });
    }

    if (body.action === "resume_subscription") {
      const subscription = await resumeCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      return jsonOk({ success: true, subscription });
    }

    // --- General update (allowlisted fields only) ---
    const { data: existingProfile, error: existingProfileError } =
      await supabaseAdmin
        .from("customer_profiles")
        .select(
          "id, monthly_price, pricing_status, stripe_subscription_id, upcoming_monthly_price, upcoming_price_effective_date",
        )
        .eq("id", id)
        .single();

    if (existingProfileError || !existingProfile) {
      return jsonError(
        existingProfileError?.message || "Kunden hittades inte",
        404,
      );
    }

    const parsedPatch = customerPatchSchema.safeParse(body);
    if (!parsedPatch.success) {
      return buildValidationErrorResponse(parsedPatch.error);
    }

    const sanitizedBody = {
      ...parsedPatch.data,
    } as TablesUpdate<"customer_profiles">;

    if (sanitizedBody.billing_day_of_month !== undefined) {
      sanitizedBody.billing_day_of_month = Math.max(
        1,
        Math.min(28, Number(sanitizedBody.billing_day_of_month) || 25),
      );
    }
    if (sanitizedBody.monthly_price !== undefined) {
      sanitizedBody.monthly_price = Number(sanitizedBody.monthly_price) || 0;
    }
    if (sanitizedBody.pricing_status !== undefined) {
      sanitizedBody.pricing_status =
        sanitizedBody.pricing_status === "unknown" ? "unknown" : "fixed";
      if (sanitizedBody.pricing_status === "unknown")
        sanitizedBody.monthly_price = 0;
    }
    if (sanitizedBody.upcoming_monthly_price !== undefined) {
      sanitizedBody.upcoming_monthly_price =
        Number(sanitizedBody.upcoming_monthly_price) || null;
    }
    if (
      sanitizedBody.upcoming_price_effective_date !== undefined &&
      !sanitizedBody.upcoming_price_effective_date
    ) {
      sanitizedBody.upcoming_price_effective_date = null;
    }
    if (
      Object.prototype.hasOwnProperty.call(sanitizedBody, "account_manager")
    ) {
      const assignment = await resolveAccountManagerAssignment(
        supabaseAdmin,
        sanitizedBody.account_manager as string | null | undefined,
      );
      sanitizedBody.account_manager = assignment.accountManager;
      sanitizedBody.account_manager_profile_id =
        assignment.accountManagerProfileId;
    }

    // Sync price to Stripe if subscription exists and price has changed
    const nextPricingStatus =
      (sanitizedBody.pricing_status as string | undefined) ||
      existingProfile.pricing_status ||
      "fixed";
    const nextMonthlyPrice =
      Number(
        sanitizedBody.monthly_price !== undefined
          ? sanitizedBody.monthly_price
          : existingProfile.monthly_price,
      ) || 0;
    const currentMonthlyPrice = Number(existingProfile.monthly_price) || 0;
    const hasActiveStripeSubscription = Boolean(
      existingProfile.stripe_subscription_id,
    );
    const monthlyPriceChanged =
      sanitizedBody.monthly_price !== undefined &&
      nextMonthlyPrice !== currentMonthlyPrice;
    const nextUpcomingPrice =
      Number(
        sanitizedBody.upcoming_monthly_price !== undefined
          ? sanitizedBody.upcoming_monthly_price
          : existingProfile.upcoming_monthly_price,
      ) || 0;
    const nextUpcomingEffectiveDate = (
      sanitizedBody.upcoming_price_effective_date !== undefined
        ? sanitizedBody.upcoming_price_effective_date
        : existingProfile.upcoming_price_effective_date
    ) as string | null | undefined;
    const today = new Date().toISOString().slice(0, 10);
    const upcomingDueNow = Boolean(
      nextUpcomingPrice > 0 &&
      nextUpcomingEffectiveDate &&
      nextUpcomingEffectiveDate <= today,
    );

    if (hasActiveStripeSubscription && nextPricingStatus === "unknown") {
      return jsonError(
        'Aktiv Stripe-prenumeration kan inte ha "pris ej satt". Avsluta eller pausa abonnemang forst.',
        400,
      );
    }

    if (
      hasActiveStripeSubscription &&
      nextPricingStatus === "fixed" &&
      (upcomingDueNow || (monthlyPriceChanged && nextMonthlyPrice > 0))
    ) {
      if (!stripe)
        return jsonError("Stripe ar inte konfigurerat pa servern", 503);

      const syncedPrice = upcomingDueNow ? nextUpcomingPrice : nextMonthlyPrice;
      await applyPriceToSubscription({
        stripeClient: stripe,
        subscriptionId: String(existingProfile.stripe_subscription_id),
        monthlyPriceSek: syncedPrice,
        source: upcomingDueNow ? "scheduled_upcoming" : "admin_manual",
        supabaseAdmin,
      });

      if (upcomingDueNow) {
        sanitizedBody.monthly_price = syncedPrice;
        sanitizedBody.pricing_status = "fixed";
        sanitizedBody.upcoming_monthly_price = null;
        sanitizedBody.upcoming_price_effective_date = null;
      }
    }

    const { data, error } = await supabaseAdmin
      .from("customer_profiles")
      .update(sanitizedBody)
      .eq("id", id)
      .select()
      .single();

    if (error)
      return jsonError(error.message, 500);

    return jsonOk(buildCustomerPayload(data));
  } catch (error: unknown) {
    console.error("[API] PATCH error:", error);
    return buildRouteErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await validateApiRequest(request, ["admin"]);
    const { id } = await params;

    if (!id) {
      return jsonError("Kund-ID kravs", 400);
    }

    const supabaseAdmin = createSupabaseAdmin();
    const cleanupSummary = await archiveStripeCustomer({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: id,
    });

    const { data, error } = await supabaseAdmin
      .from("customer_profiles")
      .update({ status: "archived" })
      .eq("id", id)
      .select()
      .single();

    if (error)
      return jsonError(error.message, 500);

    return jsonOk({
      success: true,
      message: "Kunden arkiverades.",
      customer: data,
      cleanup: cleanupSummary,
    });
  } catch (error: unknown) {
    return buildRouteErrorResponse(error);
  }
}
