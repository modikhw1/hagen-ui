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
import { translateClipToConcept, type BackendClip, type TranslatedConcept, type ClipOverride } from './translator';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Create Supabase client (uses anon key for client-side, service key for server-side)
function getSupabaseClient() {
  if (typeof window !== 'undefined') {
    // Client-side: use anon key
    return createClient(supabaseUrl, supabaseAnonKey);
  } else {
    // Server-side: prefer service key if available
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    return createClient(supabaseUrl, serviceKey || supabaseAnonKey);
  }
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

    // Transform database rows to TranslatedConcept format
    return concepts.map(row => {
      const clip = row.backend_data as BackendClip;
      const override = row.overrides as ClipOverride;
      return translateClipToConcept(clip, override);
    });
  } catch (error) {
    console.error('[conceptLoaderDB] Fatal error:', error);
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
export async function getRawConcepts(): Promise<any[]> {
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
