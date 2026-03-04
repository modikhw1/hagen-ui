import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';
import { withAuth } from '@/lib/auth/api-auth';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'LeTrend <hej@letrend.se>';

// Build simple HTML for weekly summary
function buildWeeklySummaryHtml(
  customer: { business_name: string; contact_name?: string },
  weekData: {
    conceptsAdded: number;
    concepts: Array<{ id: string; headline: string; matchPercentage: number; added_at: string }>;
    totalConcepts: number;
  }
) {
  const conceptsHtml = weekData.concepts.length > 0 ? weekData.concepts.map((c, i) => `
    <div style="background: #f9fafb; border-radius: 8px; padding: 12px; margin: 8px 0;">
      <div style="font-weight: 600; color: #1a1a2e;">${i + 1}. ${c.headline}</div>
      <span style="color: #10b981; font-size: 12px;">${c.matchPercentage}% matchning</span>
    </div>
  `).join('') : '<p>Inga nya koncept denna vecka.</p>';

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 20px; font-family: sans-serif; background: #f8f9fa;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 12px; padding: 30px;">
    <h1 style="color: #1a1a2e; margin: 0 0 20px;">📊 Veckan som gick — ${customer.business_name}</h1>
    
    <div style="display: flex; gap: 16px; margin: 20px 0;">
      <div style="flex: 1; background: #f0fdf4; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #10b981;">${weekData.conceptsAdded}</div>
        <div style="color: #6b7280; font-size: 14px;">Nya koncept</div>
      </div>
      <div style="flex: 1; background: #eff6ff; border-radius: 8px; padding: 16px; text-align: center;">
        <div style="font-size: 32px; font-weight: 700; color: #3b82f6;">${weekData.totalConcepts}</div>
        <div style="color: #6b7280; font-size: 14px;">Totalt</div>
      </div>
    </div>
    
    <h3 style="color: #1a1a2e; margin: 20px 0 10px;">Nya koncept denna vecka:</h3>
    ${conceptsHtml}
    
    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <a href="https://hagen.se/m" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;">Se alla koncept →</a>
    </div>
    
    <p style="color: #9ca3af; font-size: 12px; margin-top: 20px;">
      LeTrend — letrend.se
    </p>
  </div>
</body>
</html>`;
}

/**
 * GET /api/studio/email/schedules
 * Get email schedules for a customer
 */
export const GET = withAuth(async (request: NextRequest, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');

    let query = supabase.from('email_schedules').select('*').order('created_at', { ascending: false });
    
    if (customerId) {
      query = query.eq('customer_profile_id', customerId);
    }

    const { data: schedules, error } = await query;
    
    if (error) throw error;

    return NextResponse.json({ schedules: schedules || [] });

  } catch (error: any) {
    console.error('[schedules] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);

/**
 * POST /api/studio/email/schedules
 * Create or update an email schedule
 */
export const POST = withAuth(async (request: NextRequest, user) => {
  try {
    const body = await request.json();
    const { 
      customer_profile_id,
      schedule_type,
      day_of_week,
      send_time,
      rules,
      email_subject,
      email_intro,
      email_outro,
      is_active
    } = body;

    if (!customer_profile_id) {
      return NextResponse.json({ error: 'customer_profile_id required' }, { status: 400 });
    }

    // Calculate next send date
    const now = new Date();
    let nextSend = new Date(now);
    const sendDay = day_of_week !== undefined ? day_of_week : 1; // Default Monday
    const [hours, minutes] = (send_time || '09:00').split(':');

    nextSend.setHours(parseInt(hours), parseInt(minutes), 0, 0);

    // If the day has passed this week, schedule for next week
    if (nextSend.getDay() < sendDay || (nextSend.getDay() === sendDay && nextSend <= now)) {
      const daysUntil = (sendDay + 7 - nextSend.getDay()) % 7 || 7;
      nextSend.setDate(nextSend.getDate() + daysUntil);
    }

    const scheduleData = {
      customer_profile_id,
      schedule_type: schedule_type || 'weekly',
      day_of_week: day_of_week !== undefined ? day_of_week : 1,
      send_time: send_time || '09:00',
      rules: rules || {},
      email_subject: email_subject || '📊 Veckan som gick — {{business_name}}',
      email_intro: email_intro || 'Hej! Här är veckans sammanfattning:',
      email_outro: email_outro || 'Med vänliga hälsningar,\nLeTrend',
      is_active: is_active !== false,
      next_send_at: nextSend.toISOString(),
    };

    // Check if schedule exists for this customer
    const { data: existing } = await supabase
      .from('email_schedules')
      .select('id')
      .eq('customer_profile_id', customer_profile_id)
      .eq('schedule_type', schedule_type || 'weekly')
      .single();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from('email_schedules')
        .update({ ...scheduleData, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from('email_schedules')
        .insert(scheduleData)
        .select()
        .single();
      
      if (error) throw error;
      result = data;
    }

    return NextResponse.json({ success: true, schedule: result });

  } catch (error: any) {
    console.error('[schedules] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);

/**
 * DELETE /api/studio/email/schedules
 * Delete an email schedule
 */
export const DELETE = withAuth(async (request: NextRequest, user) => {
  try {
    const { searchParams } = new URL(request.url);
    const scheduleId = searchParams.get('id');

    if (!scheduleId) {
      return NextResponse.json({ error: 'Schedule ID required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('email_schedules')
      .delete()
      .eq('id', scheduleId);

    if (error) throw error;

    return NextResponse.json({ success: true });

  } catch (error: any) {
    console.error('[schedules] DELETE error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}, ['admin', 'content_manager']);
