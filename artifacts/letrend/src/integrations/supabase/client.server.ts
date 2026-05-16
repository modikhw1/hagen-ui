// @ts-nocheck
import { createClient } from '@supabase/supabase-js';

// Read in this order to support both the Vite-native naming used by the rest of
// the stack and the legacy NEXT_PUBLIC_* names that older code relied on.
const supabaseUrl =
  process.env.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.NEXT_PUBLIC_SUPABASE_URL;

const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error(
    'Supabase admin client misconfigured: SUPABASE_URL (or VITE_SUPABASE_URL) is missing.',
  );
}
if (!supabaseServiceKey) {
  throw new Error(
    'Supabase admin client misconfigured: SUPABASE_SERVICE_ROLE_KEY is missing.',
  );
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
