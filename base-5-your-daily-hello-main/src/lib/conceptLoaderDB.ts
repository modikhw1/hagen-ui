/**
 * Concept Loader (Database Version)
 *
 * Loads clips from Supabase database instead of JSON files.
 * Use this after running migration 007.
 *
 * Usage:
 *   import { loadConcepts, loadConceptById } from '@/lib/conceptLoaderDB'
 *   const concepts = await loadConcepts()
 */

import { createClient } from '@supabase/supabase-js';
import { createBrowserClient } from '@supabase/ssr';
import { translateClipToConcept, type BackendClip, type TranslatedConcept, type ClipOverride } from './translator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create Supabase client.
// Client-side: use createBrowserClient (reads auth cookies → satisfies RLS).
// Server-side: use service role key if available, otherwise anon.
function getSupabaseClient() {
  if (typeof window !== 'undefined') {
    return createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(supabaseUrl, serviceKey || supabaseAnonKey);
}

/**
 * Load all active concepts from Supabase
 */
export async function loadConcepts(): Promise<TranslatedConcept[]> {
  try {
    const supabase = getSupabaseClient();

    const { data: concepts, error } = await supabase
      .from('concepts')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[conceptLoaderDB] Error loading concepts:', error);
      return [];
    }

    // Transform database rows to TranslatedConcept format.
    // Use the Supabase row id (not backend_data.id) so that lookups keyed on
    // customer_concepts.concept_id (which is concepts.id, a UUID) resolve correctly.
    return concepts.map(row => {
      const clip = row.backend_data as BackendClip;
      const override = row.overrides as ClipOverride;
      const translated = translateClipToConcept(clip, override);
      return { ...translated, id: row.id as string };
    });
  } catch (error) {
    console.error('[conceptLoaderDB] Fatal error:', error);
    return [];
  }
}

/**
 * Load active concepts created by a specific CM.
 */
export async function loadMyConcepts(userId: string): Promise<TranslatedConcept[]> {
  if (!userId) return [];

  try {
    const supabase = getSupabaseClient();

    const { data: concepts, error } = await supabase
      .from('concepts')
      .select('*')
      .eq('is_active', true)
      .eq('created_by', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[conceptLoaderDB] Error loading my concepts:', error);
      return [];
    }

    return concepts.map(row => {
      const clip = row.backend_data as BackendClip;
      const override = row.overrides as ClipOverride;
      const translated = translateClipToConcept(clip, override);
      return { ...translated, id: row.id as string };
    });
  } catch (error) {
    console.error('[conceptLoaderDB] Fatal error in loadMyConcepts:', error);
    return [];
  }
}

/**
 * Load concepts most recently assigned to the current CM's customers.
 */
export async function loadRecentlyAssigned(userId: string): Promise<TranslatedConcept[]> {
  if (!userId) return [];

  try {
    const supabase = getSupabaseClient();

    const { data: customers, error: customerError } = await supabase
      .from('customer_profiles')
      .select('id')
      .eq('account_manager_profile_id', userId);

    if (customerError) {
      console.error('[conceptLoaderDB] Error loading CM customers:', customerError);
      return [];
    }

    const customerIds = (customers || [])
      .map(row => row.id as string)
      .filter(Boolean);

    if (customerIds.length === 0) {
      return [];
    }

    const { data: assignments, error: assignmentError } = await supabase
      .from('customer_concepts')
      .select('concept_id, created_at')
      .in('customer_profile_id', customerIds)
      .order('created_at', { ascending: false });

    if (assignmentError) {
      console.error('[conceptLoaderDB] Error loading recent assignments:', assignmentError);
      return [];
    }

    const recentConceptIds = Array.from(
      new Set(
        (assignments || [])
          .map(row => row.concept_id as string)
          .filter(Boolean)
      )
    );

    if (recentConceptIds.length === 0) {
      return [];
    }

    const { data: concepts, error: conceptsError } = await supabase
      .from('concepts')
      .select('*')
      .in('id', recentConceptIds)
      .eq('is_active', true);

    if (conceptsError) {
      console.error('[conceptLoaderDB] Error loading recently assigned concepts:', conceptsError);
      return [];
    }

    const conceptMap = new Map(
      (concepts || []).map(row => {
        const clip = row.backend_data as BackendClip;
        const override = row.overrides as ClipOverride;
        const translated = translateClipToConcept(clip, override);
        return [row.id as string, { ...translated, id: row.id as string }];
      })
    );

    return recentConceptIds
      .map(id => conceptMap.get(id))
      .filter((concept): concept is TranslatedConcept => Boolean(concept));
  } catch (error) {
    console.error('[conceptLoaderDB] Fatal error in loadRecentlyAssigned:', error);
    return [];
  }
}

/**
 * Load a single concept by ID
 */
export async function loadConceptById(id: string): Promise<TranslatedConcept | undefined> {
  try {
    const supabase = getSupabaseClient();

    const { data: concept, error } = await supabase
      .from('concepts')
      .select('*')
      .eq('id', id)
      .eq('is_active', true)
      .maybeSingle();

    if (error || !concept) {
      console.error('[conceptLoaderDB] Concept not found:', id);
      return undefined;
    }

    const clip = concept.backend_data as BackendClip;
    const override = concept.overrides as ClipOverride;
    return translateClipToConcept(clip, override);
  } catch (error) {
    console.error('[conceptLoaderDB] Fatal error:', error);
    return undefined;
  }
}

/**
 * Get raw concepts (for admin/debug)
 */
export async function getRawConcepts(): Promise<unknown[]> {
  try {
    const supabase = getSupabaseClient();

    const { data: concepts, error } = await supabase
      .from('concepts')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[conceptLoaderDB] Error loading raw concepts:', error);
      return [];
    }

    return concepts;
  } catch (error) {
    console.error('[conceptLoaderDB] Fatal error:', error);
    return [];
  }
}

/**
 * Dashboard row structure
 */
interface DashboardRow {
  id: string;
  title: string;
  subtitle: string;
  concepts: TranslatedConcept[];
}

/**
 * Generate dashboard rows from concepts
 */
export function generateDashboardRows(concepts: TranslatedConcept[]): DashboardRow[] {
  return [
    {
      id: 'top-matches',
      title: 'Bästa matchningar',
      subtitle: 'Passar bäst för ditt varumärke',
      concepts: concepts
        .sort((a, b) => b.matchPercentage - a.matchPercentage)
        .slice(0, 4),
    },
    {
      id: 'fresh',
      title: 'Nytt denna vecka',
      subtitle: 'Nyligen tillagt',
      concepts: concepts.filter(c => c.isNew),
    },
    {
      id: 'easy-wins',
      title: 'Snabba vinster',
      subtitle: 'Filma på under 15 minuter',
      concepts: concepts.filter(c => c.difficulty === 'easy').slice(0, 4),
    },
    {
      id: 'trending',
      title: 'Trendar nu',
      subtitle: 'Populära format just nu',
      concepts: concepts.filter(c => c.trendLevel >= 4),
    },
  ].filter(row => row.concepts.length > 0);
}

/**
 * Load concepts and generate dashboard data
 */
export async function loadDashboardData(): Promise<{
  concepts: TranslatedConcept[];
  rows: DashboardRow[];
}> {
  const concepts = await loadConcepts();
  const rows = generateDashboardRows(concepts);
  return { concepts, rows };
}
