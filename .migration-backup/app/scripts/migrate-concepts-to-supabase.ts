/**
 * Migration Script: Move concepts from JSON to Supabase
 *
 * This script:
 * 1. Reads clips-priority.json
 * 2. Inserts all clips into the `concepts` table
 * 3. Migrates customer_profiles.concepts JSONB → customer_concepts table
 *
 * Usage:
 *   npx ts-node app/scripts/migrate-concepts-to-supabase.ts
 *
 * Or add to package.json:
 *   "migrate:concepts": "ts-node app/scripts/migrate-concepts-to-supabase.ts"
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing environment variables');
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✓' : '✗');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface ClipsData {
  _meta: {
    version: string;
    lastUpdated: string;
    description: string;
  };
  clips: any[];
  overrides: Record<string, any>;
  defaults: any;
}

async function main() {
  console.log('🚀 Starting concept migration to Supabase...\n');

  // =====================================================
  // Step 1: Load clips-priority.json
  // =====================================================
  console.log('📁 Step 1: Loading clips-priority.json...');
  const jsonPath = path.join(process.cwd(), 'src', 'data', 'clips-priority.json');

  if (!fs.existsSync(jsonPath)) {
    console.error(`❌ File not found: ${jsonPath}`);
    process.exit(1);
  }

  const clipsData: ClipsData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`✓ Loaded ${clipsData.clips.length} clips from JSON`);
  console.log(`   Version: ${clipsData._meta.version}`);
  console.log(`   Last Updated: ${clipsData._meta.lastUpdated}\n`);

  // =====================================================
  // Step 2: Insert clips into `concepts` table
  // =====================================================
  console.log('📝 Step 2: Migrating clips to `concepts` table...');
  let insertedCount = 0;
  let skippedCount = 0;
  let errorCount = 0;

  for (const clip of clipsData.clips) {
    try {
      // Check if concept already exists
      const { data: existing } = await supabase
        .from('concepts')
        .select('id')
        .eq('id', clip.id)
        .maybeSingle();

      if (existing) {
        console.log(`   ⏭  Skipping ${clip.id} (already exists)`);
        skippedCount++;
        continue;
      }

      // Get override for this clip
      const override = clipsData.overrides[clip.id] || {};

      // Insert concept
      const { error } = await supabase
        .from('concepts')
        .insert({
          id: clip.id,
          source: 'hagen',
          created_by: null, // From hagen backend, not created by user
          backend_data: clip,
          overrides: override,
          is_active: true,
          version: 1,
        });

      if (error) {
        console.error(`   ❌ Error inserting ${clip.id}:`, error.message);
        errorCount++;
      } else {
        console.log(`   ✓ Inserted ${clip.id}`);
        insertedCount++;
      }
    } catch (err: any) {
      console.error(`   ❌ Exception for ${clip.id}:`, err.message);
      errorCount++;
    }
  }

  console.log(`\n   Summary:`);
  console.log(`   - Inserted: ${insertedCount}`);
  console.log(`   - Skipped: ${skippedCount}`);
  console.log(`   - Errors: ${errorCount}\n`);

  // =====================================================
  // Step 3: Migrate customer_profiles.concepts → customer_concepts
  // =====================================================
  console.log('📝 Step 3: Migrating customer concepts...');

  // Fetch all customer profiles that have concepts
  const { data: profiles, error: profilesError } = await supabase
    .from('customer_profiles')
    .select('id, business_name, concepts')
    .not('concepts', 'is', null);

  if (profilesError) {
    console.error('❌ Error fetching customer profiles:', profilesError.message);
    process.exit(1);
  }

  console.log(`   Found ${profiles?.length || 0} customer profiles with concepts\n`);

  let customerConceptsInserted = 0;
  let customerConceptsSkipped = 0;
  let customerConceptsErrors = 0;

  for (const profile of profiles || []) {
    const concepts = profile.concepts as any[] || [];
    console.log(`   Processing ${profile.business_name} (${concepts.length} concepts)...`);

    for (const concept of concepts) {
      try {
        // Check if already migrated
        const { data: existing } = await supabase
          .from('customer_concepts')
          .select('id')
          .eq('customer_profile_id', profile.id)
          .eq('concept_id', concept.concept_id || concept.id)
          .maybeSingle();

        if (existing) {
          customerConceptsSkipped++;
          continue;
        }

        // Insert customer concept
        const { error } = await supabase
          .from('customer_concepts')
          .insert({
            customer_profile_id: profile.id,
            concept_id: concept.concept_id || concept.id,
            custom_headline: concept.custom_headline || null,
            custom_description: concept.custom_description || null,
            custom_why_it_works: concept.custom_why_it_works || null,
            custom_instructions: concept.custom_instructions || null,
            custom_target_audience: concept.custom_target_audience || null,
            custom_script: concept.custom_script || null,
            custom_production_notes: concept.custom_production_notes || null,
            match_percentage: concept.match_percentage || 85,
            status: concept.status || 'active',
            notes: concept.notes || null,
            added_at: concept.added_at || new Date().toISOString(),
            base_concept_version: 1,
          });

        if (error) {
          console.error(`      ❌ Error inserting concept ${concept.concept_id || concept.id}:`, error.message);
          customerConceptsErrors++;
        } else {
          customerConceptsInserted++;
        }
      } catch (err: any) {
        console.error(`      ❌ Exception:`, err.message);
        customerConceptsErrors++;
      }
    }
  }

  console.log(`\n   Summary:`);
  console.log(`   - Inserted: ${customerConceptsInserted}`);
  console.log(`   - Skipped: ${customerConceptsSkipped}`);
  console.log(`   - Errors: ${customerConceptsErrors}\n`);

  // =====================================================
  // Step 4: Verification
  // =====================================================
  console.log('🔍 Step 4: Verifying migration...');

  const { count: conceptsCount } = await supabase
    .from('concepts')
    .select('*', { count: 'exact', head: true });

  const { count: customerConceptsCount } = await supabase
    .from('customer_concepts')
    .select('*', { count: 'exact', head: true });

  console.log(`   ✓ Total concepts in DB: ${conceptsCount}`);
  console.log(`   ✓ Total customer_concepts in DB: ${customerConceptsCount}\n`);

  // =====================================================
  // Done
  // =====================================================
  console.log('✅ Migration complete!\n');
  console.log('Next steps:');
  console.log('1. Update ConceptLoader to read from Supabase');
  console.log('2. Create API endpoints for concept CRUD');
  console.log('3. Update Studio concept edit page to save to DB');
}

main().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
