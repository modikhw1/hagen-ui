import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createSupabaseAdmin } from '../lib/supabase.js';

const router = Router();

// GET /api/me
// Returns the current user's full profile row using the service-role key,
// which bypasses RLS — required because the anon key cannot read profiles
// for admin/content_manager users due to RLS policies.
router.get('/', requireAuth, async (req, res) => {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from('profiles')
      .select('*')
      .eq('id', req.user!.id)
      .maybeSingle();

    if (error) {
      res.status(500).json({ error: 'Kunde inte hämta profil' });
      return;
    }

    if (!data) {
      // Profile row doesn't exist yet (new user not yet onboarded)
      res.status(404).json({ error: 'Profil hittades inte', code: 'profile_not_found' });
      return;
    }

    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Serverfel' });
  }
});

export default router;
