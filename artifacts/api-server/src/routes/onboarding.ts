import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createSupabaseAdmin } from '../lib/supabase.js';
import { logger } from '../lib/logger.js';

const router = Router();

const PROCESS_STEPS = [
  { number: '01', title: 'Kickoff och målbild', description: 'Vi lär känna er verksamhet, era mål och er tonalitet.' },
  { number: '02', title: 'En anpassad plan för er', description: 'Vi identifierar relevanta trender, teman och idéer, anpassat för er.' },
  { number: '03', title: 'Inspelning med stöd', description: 'Ni filmar, vi styr riktningen. Koncept, instruktioner och manus finns redo.' },
  { number: '04', title: 'Publicera och iterera', description: 'Vi mäter era resultat, ger feedback och justerar riktningen.' },
  { number: '05', title: 'Skala det som fungerar', description: 'Mer av det som ger resultat. Iterativ förbättring med ögon mot data.' },
];

// GET /api/onboarding/welcome-context
router.get('/welcome-context', requireAuth, async (req, res) => {
  try {
    const userId = req.user!.id;
    const profileId = req.query['profileId'] as string | undefined;
    const supabase = createSupabaseAdmin();

    let customerProfileId = profileId;
    if (!customerProfileId) {
      const { data: profileLink } = await supabase
        .from('profiles')
        .select('matching_data')
        .eq('id', userId)
        .maybeSingle();
      const md = (profileLink?.matching_data as Record<string, unknown> | null);
      customerProfileId = md?.customer_profile_id as string | undefined;
    }

    if (!customerProfileId) {
      res.json({
        customerProfile: null,
        gamePlanHtml: null,
        processSteps: PROCESS_STEPS,
      });
      return;
    }

    const { data: cp, error } = await supabase
      .from('customer_profiles')
      .select('id, business_name, contact_email, status, game_plan, account_manager, contract_start_date')
      .eq('id', customerProfileId)
      .maybeSingle();

    if (error || !cp) {
      res.json({
        customerProfile: null,
        gamePlanHtml: null,
        processSteps: PROCESS_STEPS,
      });
      return;
    }

    const { data: gpRecord } = await supabase
      .from('customer_game_plans')
      .select('html')
      .eq('customer_id', customerProfileId)
      .maybeSingle();

    const gamePlanHtml = gpRecord?.html ??
      (typeof (cp as Record<string, unknown>).game_plan === 'string'
        ? (cp as Record<string, unknown>).game_plan as string
        : null);

    res.json({
      customerProfile: {
        id: cp.id ?? customerProfileId,
        businessName: (cp as Record<string, unknown>).business_name,
        contactEmail: (cp as Record<string, unknown>).contact_email,
        status: (cp as Record<string, unknown>).status,
        accountManager: (cp as Record<string, unknown>).account_manager,
        contractStartDate: (cp as Record<string, unknown>).contract_start_date,
      },
      gamePlanHtml: gamePlanHtml ?? null,
      processSteps: PROCESS_STEPS,
    });
  } catch (err) {
    logger.error(err, 'onboarding welcome-context error');
    res.status(500).json({ error: 'Internt serverfel' });
  }
});

export default router;
