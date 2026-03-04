/**
 * Activity Logger
 *
 * Utility functions for logging Content Manager activities
 * for admin oversight and tracking.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export type ActivityType =
  | 'concept_added'
  | 'concept_removed'
  | 'concept_customized'
  | 'email_sent'
  | 'gameplan_updated'
  | 'customer_created'
  | 'customer_updated'
  | 'customer_invited';

export interface LogActivityParams {
  cmUserId: string;
  cmEmail: string;
  customerProfileId?: string;
  activityType: ActivityType;
  description: string;
  metadata?: Record<string, any>;
}

/**
 * Logs a CM activity to the database
 *
 * @example
 * await logActivity({
 *   cmUserId: user.id,
 *   cmEmail: user.email,
 *   customerProfileId: 'uuid-123',
 *   activityType: 'concept_added',
 *   description: 'Lade till koncept: Snabba hacks',
 *   metadata: { concept_id: 'quick-hacks-001', match_percentage: 92 }
 * });
 */
export async function logActivity(params: LogActivityParams): Promise<void> {
  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { error } = await supabase.from('cm_activities').insert({
      cm_user_id: params.cmUserId,
      cm_email: params.cmEmail,
      customer_profile_id: params.customerProfileId || null,
      activity_type: params.activityType,
      description: params.description,
      metadata: params.metadata || {},
    });

    if (error) {
      console.error('[Activity Logger] Error logging activity:', error);
      // Don't throw - activity logging should not break the main flow
    } else {
      console.log(`[Activity Logger] ✅ Logged: ${params.activityType} - ${params.description}`);
    }
  } catch (err) {
    console.error('[Activity Logger] Unexpected error:', err);
    // Silently fail - activity logging is not critical
  }
}

/**
 * Convenience functions for common activities
 */

export async function logConceptAdded(
  cmUserId: string,
  cmEmail: string,
  customerProfileId: string,
  conceptId: string,
  conceptHeadline: string,
  matchPercentage?: number
) {
  await logActivity({
    cmUserId,
    cmEmail,
    customerProfileId,
    activityType: 'concept_added',
    description: `Lade till koncept: ${conceptHeadline}`,
    metadata: {
      concept_id: conceptId,
      match_percentage: matchPercentage,
    },
  });
}

export async function logConceptRemoved(
  cmUserId: string,
  cmEmail: string,
  customerProfileId: string,
  conceptId: string,
  conceptHeadline: string
) {
  await logActivity({
    cmUserId,
    cmEmail,
    customerProfileId,
    activityType: 'concept_removed',
    description: `Tog bort koncept: ${conceptHeadline}`,
    metadata: {
      concept_id: conceptId,
    },
  });
}

export async function logConceptCustomized(
  cmUserId: string,
  cmEmail: string,
  customerProfileId: string,
  conceptId: string,
  conceptHeadline: string,
  customizations: string[]
) {
  await logActivity({
    cmUserId,
    cmEmail,
    customerProfileId,
    activityType: 'concept_customized',
    description: `Anpassade koncept: ${conceptHeadline} (${customizations.join(', ')})`,
    metadata: {
      concept_id: conceptId,
      customizations,
    },
  });
}

export async function logEmailSent(
  cmUserId: string,
  cmEmail: string,
  customerProfileId: string,
  emailType: string,
  conceptCount: number
) {
  await logActivity({
    cmUserId,
    cmEmail,
    customerProfileId,
    activityType: 'email_sent',
    description: `Skickade ${emailType} (${conceptCount} koncept)`,
    metadata: {
      email_type: emailType,
      concept_count: conceptCount,
    },
  });
}

export async function logGamePlanUpdated(
  cmUserId: string,
  cmEmail: string,
  customerProfileId: string
) {
  await logActivity({
    cmUserId,
    cmEmail,
    customerProfileId,
    activityType: 'gameplan_updated',
    description: 'Uppdaterade Game Plan',
    metadata: {},
  });
}

export async function logCustomerCreated(
  cmUserId: string,
  cmEmail: string,
  customerProfileId: string,
  businessName: string
) {
  await logActivity({
    cmUserId,
    cmEmail,
    customerProfileId,
    activityType: 'customer_created',
    description: `Skapade ny kund: ${businessName}`,
    metadata: {
      business_name: businessName,
    },
  });
}

export async function logCustomerInvited(
  cmUserId: string,
  cmEmail: string,
  customerProfileId: string,
  businessName: string,
  inviteEmail: string
) {
  await logActivity({
    cmUserId,
    cmEmail,
    customerProfileId,
    activityType: 'customer_invited',
    description: `Bjöd in ${businessName} (${inviteEmail})`,
    metadata: {
      business_name: businessName,
      invite_email: inviteEmail,
    },
  });
}
