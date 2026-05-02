import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { TablesInsert, TablesUpdate } from '@/types/database';
import { withAuth } from '@/lib/auth/api-auth';
import { asJsonObject } from '@/lib/database/json';
import { createSupabaseAdmin } from '@/lib/server/supabase-admin';

const schedulePayloadSchema = z.object({
  customer_profile_id: z.string().trim().min(1),
  schedule_type: z.string().trim().min(1).default('weekly'),
  day_of_week: z.number().int().min(0).max(6).optional(),
  send_time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  rules: z.record(z.string(), z.unknown()).optional(),
  email_subject: z.string().trim().max(250).optional(),
  email_intro: z.string().trim().max(5000).optional(),
  email_outro: z.string().trim().max(5000).optional(),
  is_active: z.boolean().optional(),
});

export const GET = withAuth(async (request: NextRequest) => {
  try {
    const supabase = createSupabaseAdmin();
    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('customer_id');

    let query = supabase.from('email_schedules').select('*').order('created_at', { ascending: false });

    if (customerId) {
      query = query.eq('customer_profile_id', customerId);
    }

    const { data: schedules, error } = await query;

    if (error) throw error;

    return NextResponse.json({ schedules: schedules || [] });
  } catch (error: unknown) {
    console.error('[schedules] GET error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to load schedules' }, { status: 500 });
  }
}, ['admin', 'content_manager']);

export const POST = withAuth(async (request: NextRequest) => {
  try {
    const supabase = createSupabaseAdmin();
    const body = schedulePayloadSchema.parse(await request.json());
    const {
      customer_profile_id,
      schedule_type,
      day_of_week,
      send_time,
      rules,
      email_subject,
      email_intro,
      email_outro,
      is_active,
    } = body;

    const now = new Date();
    const nextSend = new Date(now);
    const sendDay = day_of_week !== undefined ? day_of_week : 1;
    const [hours, minutes] = (send_time || '09:00').split(':');

    nextSend.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    const currentDay = nextSend.getDay();
    const daysUntilTarget = (sendDay - currentDay + 7) % 7;
    if (daysUntilTarget > 0) {
      nextSend.setDate(nextSend.getDate() + daysUntilTarget);
    } else if (nextSend <= now) {
      nextSend.setDate(nextSend.getDate() + 7);
    }

    const scheduleData: TablesInsert<'email_schedules'> = {
      customer_profile_id,
      schedule_type,
      day_of_week: day_of_week !== undefined ? day_of_week : 1,
      send_time: send_time || '09:00',
      rules: asJsonObject(rules),
      email_subject: email_subject || 'Veckouppdatering - LeTrend',
      email_intro: email_intro || 'Hej! Här är veckans sammanfattning:',
      email_outro: email_outro || 'Med vänliga hälsningar,\nLeTrend',
      is_active: is_active !== false,
      next_send_at: nextSend.toISOString(),
    };

    const { data: existing } = await supabase
      .from('email_schedules')
      .select('id')
      .eq('customer_profile_id', customer_profile_id)
      .eq('schedule_type', schedule_type)
      .maybeSingle();

    let result;
    if (existing) {
      const updateData: TablesUpdate<'email_schedules'> = {
        ...scheduleData,
        updated_at: new Date().toISOString(),
      };
      const { data, error } = await supabase
        .from('email_schedules')
        .update(updateData)
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
  } catch (error: unknown) {
    console.error('[schedules] POST error:', error);
    return NextResponse.json(
      { error: error instanceof z.ZodError ? error.issues[0]?.message : error instanceof Error ? error.message : 'Failed to save schedule' },
      { status: error instanceof z.ZodError ? 400 : 500 }
    );
  }
}, ['admin', 'content_manager']);

export const DELETE = withAuth(async (request: NextRequest) => {
  try {
    const supabase = createSupabaseAdmin();
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
  } catch (error: unknown) {
    console.error('[schedules] DELETE error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to delete schedule' }, { status: 500 });
  }
}, ['admin', 'content_manager']);
