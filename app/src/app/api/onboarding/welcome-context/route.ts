import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { z } from 'zod';
import { extractGamePlanEmailData, resolveGamePlanDocument } from '@/lib/game-plan';

const querySchema = z.object({
  profileId: z.string().trim().min(1).max(128),
});

const PROCESS_STEPS = [
  { number: '01', title: 'Kickoff och målbild', description: 'Vi lär känna er verksamhet, era mål och er tonalitet.' },
  { number: '02', title: 'En anpassad plan för er', description: 'Vi identifierar relevanta trender, teman och idéer — anpassat för er.' },
  { number: '03', title: 'Inspelning med stöd', description: 'Ni filmar, vi styr riktningen. Koncept, instruktioner och manus finns redo.' },
  { number: '04', title: 'Publicera och iterera', description: 'Vi mäter era resultat, ger feedback och justerar riktningen.' },
  { number: '05', title: 'Skala det som fungerar', description: 'Mer av det som ger resultat. Iterativ förbättring med ögon mot data.' },
];

export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} } }
    );
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const parsed = querySchema.safeParse({
      profileId: req.nextUrl.searchParams.get('profileId'),
    });
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid profileId' }, { status: 400 });
    }
    const { profileId } = parsed.data;

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Ownership check
    const { data: profileLink } = await supabaseAdmin
      .from('profiles')
      .select('matching_data')
      .eq('id', user.id)
      .maybeSingle();

    const matchingData = profileLink?.matching_data as Record<string, unknown> | null;
    const linkedId = typeof matchingData?.customer_profile_id === 'string'
      ? matchingData.customer_profile_id : null;

    const { data: cp, error: cpError } = await supabaseAdmin
      .from('customer_profiles')
      .select(`
        business_name, contact_email, tiktok_profile_url, tiktok_handle,
        monthly_price, subscription_interval, scope_items, invoice_text,
        first_invoice_behavior, billing_day_of_month,
        account_manager, account_manager_profile_id, game_plan
      `)
      .eq('id', profileId)
      .single();

    if (cpError || !cp) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const normalizedUserEmail = (user.email || '').trim().toLowerCase();
    const normalizedCpEmail = (cp.contact_email || '').trim().toLowerCase();
    const ownsProfile = linkedId === profileId ||
      (normalizedUserEmail.length > 0 && normalizedUserEmail === normalizedCpEmail);

    if (!ownsProfile) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Resolve content manager
    let contentManager = null;
    if (cp.account_manager_profile_id) {
      const { data: tm } = await supabaseAdmin
        .from('team_members')
        .select('name, avatar_url, email')
        .eq('profile_id', cp.account_manager_profile_id)
        .maybeSingle();

      if (tm) {
        contentManager = {
          name: tm.name || cp.account_manager || 'Din content manager',
          avatarUrl: tm.avatar_url || null,
          email: tm.email || null,
        };
      }
    }
    if (!contentManager && cp.account_manager) {
      contentManager = {
        name: cp.account_manager,
        avatarUrl: null,
        email: null,
      };
    }

    const { data: gamePlanRecord } = await supabaseAdmin
      .from('customer_game_plans')
      .select('html, plain_text, editor_version, updated_at')
      .eq('customer_id', profileId)
      .maybeSingle();

    const gamePlanDocument = resolveGamePlanDocument(gamePlanRecord, cp.game_plan);
    const gamePlanPreview = extractGamePlanEmailData({
      html: gamePlanDocument.html,
      plain_text: gamePlanDocument.plainText,
    });

    return NextResponse.json({
      customer: {
        businessName: cp.business_name || 'Ditt företag',
        tiktokHandle: cp.tiktok_handle || null,
        tiktokProfileUrl: cp.tiktok_profile_url || null,
      },
      contentManager,
      subscription: {
        pricePerMonth: Number(cp.monthly_price) || 0,
        interval: cp.subscription_interval || 'month',
        scopeItems: Array.isArray(cp.scope_items) ? cp.scope_items : [],
        invoiceText: cp.invoice_text || null,
        firstInvoiceBehavior: cp.first_invoice_behavior || 'prorated',
        billingDayOfMonth: Number(cp.billing_day_of_month) || 25,
      },
      process: { steps: PROCESS_STEPS },
      gamePlan: {
        hasGamePlan: gamePlanDocument.hasGamePlan,
        title: gamePlanPreview.title || null,
        description: gamePlanPreview.description || null,
        goals: Array.isArray(gamePlanPreview.goals) ? gamePlanPreview.goals.slice(0, 3) : [],
        updatedAt: gamePlanDocument.updatedAt,
      },
    });
  } catch (error) {
    console.error('Welcome context error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
