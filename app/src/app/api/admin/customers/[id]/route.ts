import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
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
  applyCustomerDiscount,
  archiveStripeCustomer,
  cancelCustomerSubscription,
  pauseCustomerSubscription,
  resumeCustomerSubscription,
} from "@/lib/stripe/admin-billing";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

interface RouteParams {
  params: Promise<{ id: string }>;
}

function buildCustomerPayload(profile: unknown) {
  return {
    customer: profile,
    profile,
  };
}

function buildValidationErrorResponse(error: z.ZodError) {
  return NextResponse.json(
    {
      error: "Ogiltig payload",
      details: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 },
  );
}

const applyDiscountActionSchema = z
  .object({
    action: z.literal("apply_discount"),
    type: z.enum(["percent", "amount", "free_period"]),
    value: z.number().min(0),
    duration_months: z.number().int().min(1).max(36).nullable().optional(),
    ongoing: z.boolean().default(false),
  })
  .strict();

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, [
      "admin",
      "customer",
      "content_manager",
    ]);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Profile ID required" },
        { status: 400 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error } = await supabaseAdmin
      .from("customer_profiles")
      .select("*")
      .eq("id", id)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Non-admins can only access their own profile
    if (!user.is_admin && user.role !== "admin") {
      const userEmail = (user.email || "").trim().toLowerCase();
      const profileEmail = (profile?.contact_email || "").trim().toLowerCase();
      if (!profileEmail || profileEmail !== userEmail) {
        return NextResponse.json(
          { error: "Insufficient permissions" },
          { status: 403 },
        );
      }
    }

    return NextResponse.json(buildCustomerPayload(profile));
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  console.log("[API] PATCH called for customer");
  try {
    const user = await validateApiRequest(request, ["admin"]);
    console.log("[API] User validated:", user.email);

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Profile ID is required" },
        { status: 400 },
      );
    }

    const body = await request.json();
    console.log("[API] Body action:", body.action);
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // --- Action: send_invite ---
    if (body.action === "send_invite") {
      const parsedInvite = sendInviteActionSchema.safeParse(body);
      if (!parsedInvite.success) {
        return buildValidationErrorResponse(parsedInvite.error);
      }

      const inviteInput = parsedInvite.data;
      const appUrl = getAppUrl();

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
          console.log("Created Stripe customer:", customer.id);

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
          console.log("Created Stripe subscription:", subscription.id);
        } catch (stripeError: unknown) {
          const e = stripeError as Record<string, unknown>;
          console.error("Stripe error:", e?.type, e?.message, e?.code);
          // Don't leave an orphaned Stripe customer
          if (stripeCustomerId && !stripeSubscriptionId && stripe) {
            try {
              await stripe.customers.del(stripeCustomerId);
              stripeCustomerId = null;
              console.log("Deleted orphaned Stripe customer");
            } catch (deleteError) {
              console.error("Failed to delete orphaned customer:", deleteError);
            }
          }
        }
      }

      const { data: inviteData, error: inviteError } =
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
        return NextResponse.json(
          { error: inviteError.message },
          { status: 500 },
        );
      }

      console.log("Invited user:", inviteData);

      const updateData: Record<string, unknown> = {
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
        return NextResponse.json(
          { error: updateError.message },
          { status: 500 },
        );
      }

      await logCustomerInvited(
        user.id,
        user.email || "unknown",
        id,
        inviteInput.business_name,
        inviteInput.contact_email,
      );

      return NextResponse.json({
        ...buildCustomerPayload(profile),
        message: "Invitation email sent!",
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
        return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(buildCustomerPayload(data));
    }

    // --- Action: send_reminder ---
    if (body.action === "send_reminder") {
      const { error: profileError } = await supabaseAdmin
        .from("customer_profiles")
        .select("id")
        .eq("id", id)
        .single();

      if (profileError)
        return NextResponse.json(
          { error: profileError.message },
          { status: 500 },
        );

      return NextResponse.json({
        message:
          "Kunden har redan ett konto. De kan logga in for att fortsatta.",
        already_registered: true,
      });
    }

    if (body.action === "apply_discount") {
      const parsedDiscount = applyDiscountActionSchema.safeParse(body);
      if (!parsedDiscount.success) {
        return buildValidationErrorResponse(parsedDiscount.error);
      }

      const result = await applyCustomerDiscount({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
        input: {
          type: parsedDiscount.data.type,
          value: parsedDiscount.data.value,
          durationMonths: parsedDiscount.data.duration_months ?? null,
          ongoing: parsedDiscount.data.ongoing,
        },
      });

      return NextResponse.json(result);
    }

    if (body.action === "cancel_subscription") {
      const subscription = await cancelCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      return NextResponse.json({ success: true, subscription });
    }

    if (body.action === "pause_subscription") {
      const subscription = await pauseCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      return NextResponse.json({ success: true, subscription });
    }

    if (body.action === "resume_subscription") {
      const subscription = await resumeCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      return NextResponse.json({ success: true, subscription });
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
      return NextResponse.json(
        {
          error: existingProfileError?.message || "Customer profile not found",
        },
        { status: 404 },
      );
    }

    const parsedPatch = customerPatchSchema.safeParse(body);
    if (!parsedPatch.success) {
      return buildValidationErrorResponse(parsedPatch.error);
    }

    const sanitizedBody = { ...parsedPatch.data } as Record<string, unknown>;

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
    if (sanitizedBody.discount_value !== undefined) {
      sanitizedBody.discount_value = Number(sanitizedBody.discount_value) || 0;
    }
    if (sanitizedBody.discount_duration_months !== undefined) {
      sanitizedBody.discount_duration_months =
        Number(sanitizedBody.discount_duration_months) || null;
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
      return NextResponse.json(
        {
          error:
            'Aktiv Stripe-prenumeration kan inte ha "pris ej satt". Avsluta eller pausa abonnemang forst.',
        },
        { status: 400 },
      );
    }

    if (
      hasActiveStripeSubscription &&
      nextPricingStatus === "fixed" &&
      (upcomingDueNow || (monthlyPriceChanged && nextMonthlyPrice > 0))
    ) {
      if (!stripe)
        return NextResponse.json(
          { error: "Stripe is not configured on server" },
          { status: 503 },
        );

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
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json(buildCustomerPayload(data));
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    console.error("[API] PATCH error:", error);
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    await validateApiRequest(request, ["admin"]);
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Profile ID is required" },
        { status: 400 },
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const cleanupSummary = await archiveStripeCustomer({
      supabaseAdmin,
      stripeClient: stripe,
      profileId: id,
    });

    const { error } = await supabaseAdmin
      .from("customer_profiles")
      .delete()
      .eq("id", id);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({
      success: true,
      message: "Profile deleted successfully",
      cleanup: cleanupSummary,
    });
  } catch (error: unknown) {
    if (error instanceof AuthError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.statusCode },
      );
    }
    const message =
      error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
