import { NextRequest } from "next/server";
import { recordAuditLog } from "@/lib/admin/audit-log";
import {
  createCmAbsence,
  listEnrichedCmAbsences,
  type CmAbsenceType,
  type CompensationMode,
} from "@/lib/admin/cm-absences";
import {
  changeCustomerAssignment,
  syncCustomerAssignmentFromProfile,
} from "@/lib/admin/cm-assignments";
import { syncOperationalSubscriptionState } from "@/lib/admin/subscription-operational-sync";
import { AuthError, requireAdminScope, validateApiRequest } from "@/lib/auth/api-auth";
import { stripe, stripeEnvironment } from "@/lib/stripe/dynamic-config";
import { logCustomerInvited } from "@/lib/activity/logger";
import {
  ensureStripeSubscriptionForProfile,
  sendCustomerInvite,
} from "@/lib/customers/invite";
import { upsertSubscriptionMirror } from "@/lib/stripe/mirror";
import { recurringUnitAmountFromMonthlySek } from "@/lib/stripe/price-amounts";
import { applyPriceToSubscription } from "@/lib/stripe/subscription-pricing";
import { resolveAccountManagerAssignment } from "@/lib/studio/account-manager";
import { getAppUrl } from "@/lib/url/public";
import {
  type CustomerInvitePayload,
  customerPatchSchema,
  sendInviteActionSchema,
} from "@/lib/schemas/customer";
import { z } from "zod";
import {
  applySubscriptionPriceChange,
  archiveStripeCustomer,
  cancelCustomerSubscription,
  type SubscriptionCancellationMode,
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

const pauseSubscriptionActionSchema = z
  .object({
    action: z.literal("pause_subscription"),
    pause_until: z.string().trim().min(1).optional().nullable(),
  })
  .strict();

const cancelSubscriptionActionSchema = z
  .object({
    action: z.literal("cancel_subscription"),
    mode: z.enum(["end_of_period", "immediate", "immediate_with_credit"]).default("end_of_period"),
    credit_amount_ore: z.number().int().min(0).optional().nullable(),
    invoice_id: z.string().uuid().optional().nullable(),
    memo: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

const changeSubscriptionPriceActionSchema = z
  .object({
    action: z.literal("change_subscription_price"),
    monthly_price: z.number().min(0).max(1_000_000),
    mode: z.enum(["now", "next_period"]),
  })
  .strict();

const changeAccountManagerActionSchema = z
  .object({
    action: z.literal("change_account_manager"),
    cm_id: z.string().uuid().optional().nullable(),
    effective_date: z.string().trim().min(1),
    handover_note: z.string().trim().max(1000).optional().nullable(),
  })
  .strict();

const resendInviteActionSchema = z
  .object({
    action: z.literal("resend_invite"),
  })
  .strict();

const reactivateArchiveActionSchema = z
  .object({
    action: z.literal("reactivate_archive"),
  })
  .strict();

const setTemporaryCoverageActionSchema = z
  .object({
    action: z.literal("set_temporary_coverage"),
    covering_cm_id: z.string().uuid(),
    starts_on: z.string().trim().min(1),
    ends_on: z.string().trim().min(1),
    note: z.string().trim().max(1000).optional().nullable(),
    compensation_mode: z.enum(["covering_cm", "primary_cm"]).default("covering_cm"),
  })
  .strict();

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
    coverageAbsences?: Array<Record<string, unknown>>;
  },
) {
  return {
    customer: {
      ...profile,
      latest_planned_publish_date:
        options?.bufferRow?.latest_planned_publish_date ?? null,
      last_published_at: options?.bufferRow?.last_published_at ?? null,
      attention_snoozes: options?.attentionSnoozes ?? [],
      coverage_absences: options?.coverageAbsences ?? [],
    },
    profile: {
      ...profile,
      latest_planned_publish_date:
        options?.bufferRow?.latest_planned_publish_date ?? null,
      last_published_at: options?.bufferRow?.last_published_at ?? null,
      attention_snoozes: options?.attentionSnoozes ?? [],
      coverage_absences: options?.coverageAbsences ?? [],
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

function profileToInvitePayload(profile: Record<string, unknown>): CustomerInvitePayload {
  const pricingStatus: "fixed" | "unknown" =
    profile.pricing_status === "unknown" ? "unknown" : "fixed";
  const firstInvoiceBehavior: "prorated" | "full" | "free_until_anchor" =
    profile.first_invoice_behavior === "full" ||
    profile.first_invoice_behavior === "free_until_anchor"
      ? profile.first_invoice_behavior
      : "prorated";
  const subscriptionInterval: "month" | "quarter" | "year" =
    profile.subscription_interval === "quarter" ||
    profile.subscription_interval === "year"
      ? profile.subscription_interval
      : "month";

  return {
    business_name: String(profile.business_name || ""),
    contact_email: String(profile.contact_email || ""),
    customer_contact_name:
      typeof profile.customer_contact_name === "string"
        ? profile.customer_contact_name
        : null,
    phone: typeof profile.phone === "string" ? profile.phone : null,
    tiktok_profile_url:
      typeof profile.tiktok_profile_url === "string"
        ? profile.tiktok_profile_url
        : null,
    account_manager:
      typeof profile.account_manager === "string" ? profile.account_manager : null,
    monthly_price: Number(profile.monthly_price) || 0,
    pricing_status: pricingStatus,
    contract_start_date:
      typeof profile.contract_start_date === "string"
        ? profile.contract_start_date
        : null,
    billing_day_of_month: Math.max(
      1,
      Math.min(28, Number(profile.billing_day_of_month) || 25),
    ),
    first_invoice_behavior: firstInvoiceBehavior,
    waive_days_until_billing: false,
    discount_type: "none",
    discount_value: 0,
    discount_duration_months: 1,
    discount_start_date: null,
    discount_end_date: null,
    subscription_interval: subscriptionInterval,
    invoice_text:
      typeof profile.invoice_text === "string" ? profile.invoice_text : null,
    scope_items: Array.isArray(profile.scope_items)
      ? profile.scope_items.filter(
          (entry): entry is string => typeof entry === "string",
        )
      : [],
    upcoming_monthly_price:
      profile.upcoming_monthly_price === null ||
      profile.upcoming_monthly_price === undefined
        ? null
        : Number(profile.upcoming_monthly_price) || null,
    upcoming_price_effective_date:
      typeof profile.upcoming_price_effective_date === "string"
        ? profile.upcoming_price_effective_date
        : null,
  };
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

    const [{ data: profile, error }, bufferResult, snoozesResult, coverageAbsences] =
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
        listEnrichedCmAbsences(supabaseAdmin, {
          customerProfileId: id,
          limit: 10,
        }),
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
        coverageAbsences: coverageAbsences.map((absence) => ({
          id: absence.id,
          cm_id: absence.cm_id,
          cm_name: absence.cm_name,
          backup_cm_id: absence.backup_cm_id,
          backup_cm_name: absence.backup_cm_name,
          absence_type: absence.absence_type,
          compensation_mode: absence.compensation_mode,
          starts_on: absence.starts_on,
          ends_on: absence.ends_on,
          note: absence.note,
          is_active: absence.is_active,
          is_upcoming: absence.is_upcoming,
        })),
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
    const beforeResult = await supabaseAdmin
      .from("customer_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    const beforeProfile = beforeResult.data as Record<string, unknown> | null;

    // --- Action: send_invite ---
    if (body.action === "send_invite") {
      const parsedInvite = sendInviteActionSchema.safeParse(body);
      if (!parsedInvite.success) {
        return buildValidationErrorResponse(parsedInvite.error);
      }

      const inviteInput = parsedInvite.data;
      const appUrl = getAppUrl();
      const assignment = await resolveAccountManagerAssignment(
        supabaseAdmin,
        inviteInput.account_manager,
      );
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
            unit_amount: recurringUnitAmountFromMonthlySek({
              monthlyPriceSek: inviteInput.monthly_price,
              interval: stripeInterval,
              intervalCount,
            }),
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
      if (inviteInput.account_manager !== undefined) {
        updateData.account_manager = assignment.accountManager;
        updateData.account_manager_profile_id =
          assignment.accountManagerProfileId;
      }
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

      await syncCustomerAssignmentFromProfile({
        supabaseAdmin,
        customerProfileId: id,
      });
      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: id,
      });
      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.invited",
        entityType: "customer_profile",
        entityId: id,
        beforeState: beforeProfile,
        afterState: profile as unknown as Record<string, unknown>,
        metadata: {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
        },
      });

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
      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.activated",
        entityType: "customer_profile",
        entityId: id,
        beforeState: beforeProfile,
        afterState: data as unknown as Record<string, unknown>,
      });
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

    if (body.action === "resend_invite") {
      const parsedResend = resendInviteActionSchema.safeParse(body);
      if (!parsedResend.success) {
        return buildValidationErrorResponse(parsedResend.error);
      }

      if (!beforeProfile) {
        return jsonError("Kunden hittades inte", 404);
      }

      const inviteResult = await sendCustomerInvite({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
        payload: profileToInvitePayload(beforeProfile),
        appUrl: getAppUrl(),
      });

      if (!inviteResult.ok) {
        return jsonError(inviteResult.error, inviteResult.status);
      }

      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: id,
      });
      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.invite_resent",
        entityType: "customer_profile",
        entityId: id,
        beforeState: beforeProfile,
        afterState: inviteResult.profile,
        metadata: {
          stripe_customer_id: inviteResult.stripeCustomerId,
          stripe_subscription_id: inviteResult.stripeSubscriptionId,
        },
      });

      return jsonOk({
        success: true,
        profile: inviteResult.profile,
        message: "Ny invite skickades.",
      });
    }

    if (body.action === "reactivate_archive") {
      const parsedReactivate = reactivateArchiveActionSchema.safeParse(body);
      if (!parsedReactivate.success) {
        return buildValidationErrorResponse(parsedReactivate.error);
      }

      if (!beforeProfile) {
        return jsonError("Kunden hittades inte", 404);
      }

      const invitePayload = profileToInvitePayload(beforeProfile);
      const needsPaidSubscription =
        invitePayload.pricing_status === "fixed" &&
        Number(invitePayload.monthly_price) > 0;
      let stripeCustomerId =
        typeof beforeProfile.stripe_customer_id === "string"
          ? beforeProfile.stripe_customer_id
          : null;
      let stripeSubscriptionId =
        typeof beforeProfile.stripe_subscription_id === "string"
          ? beforeProfile.stripe_subscription_id
          : null;
      let reactivatedSubscription = null;

      if (needsPaidSubscription) {
        if (!stripe) {
          return jsonError(
            "Stripe ar inte konfigurerat pa servern och kunden kan inte ateraktiveras med debitering.",
            503,
          );
        }

        try {
          const ensuredStripe = await ensureStripeSubscriptionForProfile({
            supabaseAdmin,
            stripeClient: stripe,
            profileId: id,
            payload: invitePayload,
          });
          stripeCustomerId = ensuredStripe.stripeCustomerId;
          stripeSubscriptionId = ensuredStripe.stripeSubscriptionId;
          reactivatedSubscription = ensuredStripe.subscription;
        } catch (stripeError) {
          return jsonError(
            stripeError instanceof Error
              ? stripeError.message
              : "Kunde inte ateraktivera abonnemanget i Stripe",
            502,
          );
        }
      }

      const nextStatus = stripeSubscriptionId ? "active" : "pending";
      const reactivatedAt = new Date().toISOString();
      const { error: reactivateError } = await supabaseAdmin
        .from("customer_profiles")
        .update({
          status: nextStatus,
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
          agreed_at:
            typeof beforeProfile.agreed_at === "string"
              ? beforeProfile.agreed_at
              : reactivatedAt,
          paused_until: null,
        } as never)
        .eq("id", id)
        .select("id")
        .single();

      if (reactivateError) {
        return jsonError(reactivateError.message, 500);
      }

      if (
        reactivatedSubscription &&
        stripe &&
        (reactivatedSubscription.pause_collection ||
          reactivatedSubscription.cancel_at_period_end)
      ) {
        reactivatedSubscription = await resumeCustomerSubscription({
          supabaseAdmin,
          stripeClient: stripe,
          profileId: id,
        });
      }

      if (reactivatedSubscription) {
        await upsertSubscriptionMirror({
          supabaseAdmin,
          subscription: reactivatedSubscription,
          environment: stripeEnvironment,
        });
      }

      await syncCustomerAssignmentFromProfile({
        supabaseAdmin,
        customerProfileId: id,
      });
      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: id,
      });
      const { data: reactivatedProfile, error: refreshedProfileError } = await supabaseAdmin
        .from("customer_profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (refreshedProfileError) {
        return jsonError(refreshedProfileError.message, 500);
      }
      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.reactivated",
        entityType: "customer_profile",
        entityId: id,
        beforeState: beforeProfile,
        afterState: reactivatedProfile as unknown as Record<string, unknown>,
        metadata: {
          stripe_customer_id: stripeCustomerId,
          stripe_subscription_id: stripeSubscriptionId,
        },
      });

      return jsonOk({
        success: true,
        profile: reactivatedProfile,
        message: "Kunden ateraktiverades pa befintlig profil.",
      });
    }

    if (body.action === "set_temporary_coverage") {
      const parsedCoverage = setTemporaryCoverageActionSchema.safeParse(body);
      if (!parsedCoverage.success) {
        return buildValidationErrorResponse(parsedCoverage.error);
      }

      if (!beforeProfile) {
        return jsonError("Kunden hittades inte", 404);
      }

      const currentAssignment = await (((supabaseAdmin.from("cm_assignments" as never) as never) as {
        select: (columns: string) => {
          eq: (column: string, value: string) => {
            is: (innerColumn: string, innerValue: null) => {
              maybeSingle: () => Promise<{
                data: { cm_id: string | null } | null;
                error: { message?: string } | null;
              }>;
            };
          };
        };
      }).select("cm_id")).eq("customer_id", id).is("valid_to", null).maybeSingle();

      if (currentAssignment.error) {
        return jsonError(currentAssignment.error.message || "Kunde inte lasa CM-assignment", 500);
      }

      if (!currentAssignment.data?.cm_id) {
        return jsonError("Kunden saknar ordinarie CM och kan inte temp-tackas", 400);
      }

      const createdAbsence = await createCmAbsence(supabaseAdmin, {
        cmId: currentAssignment.data.cm_id,
        customerProfileId: id,
        backupCmId: parsedCoverage.data.covering_cm_id,
        absenceType: "temporary_coverage" satisfies CmAbsenceType,
        compensationMode: parsedCoverage.data.compensation_mode satisfies CompensationMode,
        startsOn: parsedCoverage.data.starts_on,
        endsOn: parsedCoverage.data.ends_on,
        note: parsedCoverage.data.note ?? null,
        createdBy: user.id,
      });

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.temporary_coverage_created",
        entityType: "cm_absence",
        entityId: createdAbsence.id,
        beforeState: null,
        afterState: createdAbsence as unknown as Record<string, unknown>,
        metadata: {
          customer_profile_id: id,
        },
      });

      return jsonOk({
        success: true,
        absence: createdAbsence,
      });
    }

    if (body.action === "cancel_subscription") {
      requireAdminScope(
        user,
        "super_admin",
        "Endast super-admin kan avsluta eller kreditera abonnemang",
      );

      const parsedCancel = cancelSubscriptionActionSchema.safeParse(body);
      if (!parsedCancel.success) {
        return buildValidationErrorResponse(parsedCancel.error);
      }

      const result = await cancelCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
        mode: parsedCancel.data.mode as SubscriptionCancellationMode,
        creditAmountOre: parsedCancel.data.credit_amount_ore ?? null,
        invoiceId: parsedCancel.data.invoice_id ?? null,
        memo: parsedCancel.data.memo ?? null,
      });

      await supabaseAdmin
        .from("customer_profiles")
        .update({
          paused_until: null,
        } as never)
        .eq("id", id);

      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: id,
      });
      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.subscription_cancelled",
        entityType: "subscription",
        entityId: String(beforeProfile?.stripe_subscription_id ?? id),
        beforeState: beforeProfile,
        metadata: {
          mode: parsedCancel.data.mode,
          credit_amount_ore: parsedCancel.data.credit_amount_ore ?? null,
          credit_note_id: result.creditNote?.id ?? null,
        },
      });

      return jsonOk({ success: true, ...result });
    }

    if (body.action === "pause_subscription") {
      const parsedPause = pauseSubscriptionActionSchema.safeParse(body);
      if (!parsedPause.success) {
        return buildValidationErrorResponse(parsedPause.error);
      }

      const pauseUntil = parsedPause.data.pause_until ?? null;
      const subscription = await pauseCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
        pauseUntil,
      });

      const { data: profileAfterPause, error: pauseProfileError } = await supabaseAdmin
        .from("customer_profiles")
        .update({
          paused_until: pauseUntil,
        } as never)
        .eq("id", id)
        .select()
        .single();

      if (pauseProfileError) {
        return jsonError(pauseProfileError.message, 500);
      }

      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: id,
        profile: {
          id,
          stripe_subscription_id:
            typeof profileAfterPause.stripe_subscription_id === "string"
              ? profileAfterPause.stripe_subscription_id
              : null,
          paused_until:
            typeof profileAfterPause.paused_until === "string"
              ? profileAfterPause.paused_until
              : null,
          monthly_price: Number(profileAfterPause.monthly_price) || 0,
          upcoming_monthly_price:
            Number(profileAfterPause.upcoming_monthly_price) || null,
          upcoming_price_effective_date:
            typeof profileAfterPause.upcoming_price_effective_date === "string"
              ? profileAfterPause.upcoming_price_effective_date
              : null,
        },
      });
      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.subscription_paused",
        entityType: "subscription",
        entityId: String(beforeProfile?.stripe_subscription_id ?? id),
        beforeState: beforeProfile,
        afterState: profileAfterPause as unknown as Record<string, unknown>,
        metadata: {
          pause_until: pauseUntil,
        },
      });

      return jsonOk({ success: true, subscription, profile: profileAfterPause });
    }

    if (body.action === "resume_subscription") {
      const subscription = await resumeCustomerSubscription({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
      });

      const { data: profileAfterResume, error: resumeProfileError } = await supabaseAdmin
        .from("customer_profiles")
        .update({
          paused_until: null,
        } as never)
        .eq("id", id)
        .select()
        .single();

      if (resumeProfileError) {
        return jsonError(resumeProfileError.message, 500);
      }

      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: id,
        profile: {
          id,
          stripe_subscription_id:
            typeof profileAfterResume.stripe_subscription_id === "string"
              ? profileAfterResume.stripe_subscription_id
              : null,
          paused_until: null,
          monthly_price: Number(profileAfterResume.monthly_price) || 0,
          upcoming_monthly_price:
            Number(profileAfterResume.upcoming_monthly_price) || null,
          upcoming_price_effective_date:
            typeof profileAfterResume.upcoming_price_effective_date === "string"
              ? profileAfterResume.upcoming_price_effective_date
              : null,
        },
      });
      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.subscription_resumed",
        entityType: "subscription",
        entityId: String(beforeProfile?.stripe_subscription_id ?? id),
        beforeState: beforeProfile,
        afterState: profileAfterResume as unknown as Record<string, unknown>,
      });

      return jsonOk({ success: true, subscription, profile: profileAfterResume });
    }

    if (body.action === "change_subscription_price") {
      requireAdminScope(
        user,
        "super_admin",
        "Endast super-admin kan andra abonnemangspris",
      );

      const parsedPriceChange = changeSubscriptionPriceActionSchema.safeParse(body);
      if (!parsedPriceChange.success) {
        return buildValidationErrorResponse(parsedPriceChange.error);
      }

      const result = await applySubscriptionPriceChange({
        supabaseAdmin,
        stripeClient: stripe,
        profileId: id,
        monthlyPriceSek: parsedPriceChange.data.monthly_price,
        mode: parsedPriceChange.data.mode,
      });

      const updatePayload: TablesUpdate<"customer_profiles"> =
        parsedPriceChange.data.mode === "now"
          ? {
              monthly_price: parsedPriceChange.data.monthly_price,
              pricing_status: "fixed",
              upcoming_monthly_price: null,
              upcoming_price_effective_date: null,
            }
          : {
              upcoming_monthly_price: parsedPriceChange.data.monthly_price,
              upcoming_price_effective_date: result.effectiveDate,
            };

      const { data: updatedProfile, error: updatePriceError } = await supabaseAdmin
        .from("customer_profiles")
        .update(updatePayload)
        .eq("id", id)
        .select()
        .single();

      if (updatePriceError) {
        return jsonError(updatePriceError.message, 500);
      }

      await syncOperationalSubscriptionState({
        supabaseAdmin,
        customerProfileId: id,
        profile: {
          id,
          stripe_subscription_id:
            typeof updatedProfile.stripe_subscription_id === "string"
              ? updatedProfile.stripe_subscription_id
              : null,
          paused_until:
            typeof updatedProfile.paused_until === "string"
              ? updatedProfile.paused_until
              : null,
          monthly_price: Number(updatedProfile.monthly_price) || 0,
          upcoming_monthly_price:
            Number(updatedProfile.upcoming_monthly_price) || null,
          upcoming_price_effective_date:
            typeof updatedProfile.upcoming_price_effective_date === "string"
              ? updatedProfile.upcoming_price_effective_date
              : null,
        },
      });

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action: "admin.customer.subscription_price_changed",
        entityType: "subscription",
        entityId: String(beforeProfile?.stripe_subscription_id ?? id),
        beforeState: beforeProfile,
        afterState: updatedProfile as unknown as Record<string, unknown>,
        metadata: {
          mode: parsedPriceChange.data.mode,
          monthly_price: parsedPriceChange.data.monthly_price,
          effective_date: result.effectiveDate,
        },
      });

      return jsonOk({
        success: true,
        profile: updatedProfile,
        subscription: result.subscription,
        effective_date: result.effectiveDate,
      });
    }

    if (body.action === "change_account_manager") {
      const parsedAssignmentChange = changeAccountManagerActionSchema.safeParse(body);
      if (!parsedAssignmentChange.success) {
        return buildValidationErrorResponse(parsedAssignmentChange.error);
      }

      const assignmentResult = await changeCustomerAssignment({
        supabaseAdmin,
        customerProfileId: id,
        nextCmId: parsedAssignmentChange.data.cm_id ?? null,
        effectiveDate: parsedAssignmentChange.data.effective_date,
        handoverNote: parsedAssignmentChange.data.handover_note ?? null,
      });

      const { data: profileAfterAssignment, error: assignmentProfileError } = await supabaseAdmin
        .from("customer_profiles")
        .select("*")
        .eq("id", id)
        .single();

      if (assignmentProfileError) {
        return jsonError(assignmentProfileError.message, 500);
      }

      await recordAuditLog(supabaseAdmin, {
        actorUserId: user.id,
        actorEmail: user.email,
        actorRole: user.role,
        action:
          assignmentResult.status === "scheduled"
            ? "admin.customer.cm_change_scheduled"
            : "admin.customer.cm_changed",
        entityType: "customer_profile",
        entityId: id,
        beforeState: beforeProfile,
        afterState: profileAfterAssignment as unknown as Record<string, unknown>,
        metadata: {
          effective_date: assignmentResult.effectiveDate,
          next_cm_id: assignmentResult.nextCmId,
          handover_note: parsedAssignmentChange.data.handover_note ?? null,
        },
      });

      return jsonOk({
        success: true,
        profile: profileAfterAssignment,
        assignment: assignmentResult,
      });
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

    const nextContactEmail =
      typeof sanitizedBody.contact_email === "string"
        ? sanitizedBody.contact_email.trim()
        : null;
    const previousContactEmail =
      typeof beforeProfile?.contact_email === "string"
        ? beforeProfile.contact_email.trim()
        : null;

    if (
      stripe &&
      nextContactEmail &&
      nextContactEmail !== previousContactEmail &&
      typeof data.stripe_customer_id === "string" &&
      data.stripe_customer_id
    ) {
      await stripe.customers.update(data.stripe_customer_id, {
        email: nextContactEmail,
        name:
          typeof data.business_name === "string" && data.business_name
            ? data.business_name
            : undefined,
      });
    }

    await syncCustomerAssignmentFromProfile({
      supabaseAdmin,
      customerProfileId: id,
    });
    await syncOperationalSubscriptionState({
      supabaseAdmin,
      customerProfileId: id,
      profile: data
        ? {
            id: String(data.id),
            stripe_subscription_id:
              typeof data.stripe_subscription_id === "string"
                ? data.stripe_subscription_id
                : null,
            paused_until:
              typeof data.paused_until === "string" ? data.paused_until : null,
            monthly_price: Number(data.monthly_price) || 0,
            upcoming_monthly_price:
              Number(data.upcoming_monthly_price) || null,
            upcoming_price_effective_date:
              typeof data.upcoming_price_effective_date === "string"
                ? data.upcoming_price_effective_date
                : null,
          }
        : null,
    });
    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "admin.customer.updated",
      entityType: "customer_profile",
      entityId: id,
      beforeState: beforeProfile,
      afterState: data as unknown as Record<string, unknown>,
    });

    return jsonOk(buildCustomerPayload(data));
  } catch (error: unknown) {
    console.error("[API] PATCH error:", error);
    return buildRouteErrorResponse(error);
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const user = await validateApiRequest(request, ["admin"]);
    const { id } = await params;

    if (!id) {
      return jsonError("Kund-ID kravs", 400);
    }

    requireAdminScope(
      user,
      "super_admin",
      "Endast super-admin kan arkivera kunder",
    );

    const supabaseAdmin = createSupabaseAdmin();
    const before = await supabaseAdmin
      .from("customer_profiles")
      .select("*")
      .eq("id", id)
      .maybeSingle();
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

    await recordAuditLog(supabaseAdmin, {
      actorUserId: user.id,
      actorEmail: user.email,
      actorRole: user.role,
      action: "admin.customer.archived",
      entityType: "customer_profile",
      entityId: id,
      beforeState: before.data as Record<string, unknown> | null,
      afterState: data as unknown as Record<string, unknown>,
      metadata: {
        cleanup: cleanupSummary,
      },
    });

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
