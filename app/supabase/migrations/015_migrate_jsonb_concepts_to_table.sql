-- =====================================================
-- Migration 015: Migrate customer_profiles.concepts JSONB → customer_concepts table
-- =====================================================
-- Reads existing customer_profiles.concepts JSONB arrays and creates rows
-- in customer_concepts for each entry (if they don't already exist).
-- Idempotent: uses ON CONFLICT (customer_profile_id, concept_id) DO NOTHING
-- =====================================================

-- Ensure the UNIQUE constraint exists (may be missing if table was created before migration 007)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'customer_concepts'::regclass
      AND contype = 'u'
      AND conname LIKE '%customer_profile_id%concept_id%'
  ) THEN
    ALTER TABLE customer_concepts
      ADD CONSTRAINT customer_concepts_customer_profile_id_concept_id_key
      UNIQUE (customer_profile_id, concept_id);
    RAISE NOTICE 'Added UNIQUE constraint on customer_concepts(customer_profile_id, concept_id)';
  ELSE
    RAISE NOTICE 'UNIQUE constraint already exists on customer_concepts, skipping';
  END IF;
END $$;

DO $$
DECLARE
  profile_row RECORD;
  concept_entry JSONB;
  v_concept_id TEXT;
BEGIN
  -- Iterate over all customer profiles that have a non-empty concepts array
  FOR profile_row IN
    SELECT id, business_name, concepts
    FROM customer_profiles
    WHERE concepts IS NOT NULL
      AND jsonb_array_length(concepts) > 0
  LOOP
    RAISE NOTICE 'Processing customer: % (%)', profile_row.business_name, profile_row.id;

    FOR concept_entry IN SELECT * FROM jsonb_array_elements(profile_row.concepts)
    LOOP
      -- Support both { "concept_id": "..." } and { "id": "..." } shapes
      v_concept_id := COALESCE(
        concept_entry->>'concept_id',
        concept_entry->>'id'
      );

      IF v_concept_id IS NULL THEN
        RAISE WARNING 'Skipping entry without concept_id/id for customer %: %',
          profile_row.id, concept_entry;
        CONTINUE;
      END IF;

      -- Only insert if the concept exists in the concepts table
      IF NOT EXISTS (SELECT 1 FROM concepts WHERE id = v_concept_id) THEN
        RAISE WARNING 'Concept % not found in concepts table, skipping for customer %',
          v_concept_id, profile_row.id;
        CONTINUE;
      END IF;

      INSERT INTO customer_concepts (
        customer_profile_id,
        concept_id,
        custom_headline,
        custom_description,
        custom_why_it_works,
        custom_instructions,
        custom_target_audience,
        custom_script,
        custom_production_notes,
        match_percentage,
        status,
        notes,
        added_at,
        base_concept_version
      )
      SELECT
        profile_row.id,
        v_concept_id,
        concept_entry->>'custom_headline',
        concept_entry->>'custom_description',
        concept_entry->>'custom_why_it_works',
        concept_entry->>'custom_instructions',
        concept_entry->>'custom_target_audience',
        concept_entry->>'custom_script',
        CASE
          WHEN concept_entry->'custom_production_notes' IS NOT NULL
          THEN ARRAY(SELECT jsonb_array_elements_text(concept_entry->'custom_production_notes'))
          ELSE NULL
        END,
        COALESCE((concept_entry->>'match_percentage')::INTEGER, 85),
        COALESCE(concept_entry->>'status', 'active'),
        concept_entry->>'notes',
        COALESCE(
          (concept_entry->>'added_at')::TIMESTAMPTZ,
          NOW()
        ),
        1
      WHERE NOT EXISTS (
        SELECT 1 FROM customer_concepts
        WHERE customer_profile_id = profile_row.id
          AND concept_id = v_concept_id
      );

    END LOOP;
  END LOOP;

  RAISE NOTICE 'Migration 015 complete.';
END $$;

-- =====================================================
-- Done
-- =====================================================

SELECT
  cp.business_name,
  COUNT(cc.id) AS migrated_concepts
FROM customer_profiles cp
LEFT JOIN customer_concepts cc ON cc.customer_profile_id = cp.id
GROUP BY cp.id, cp.business_name
ORDER BY migrated_concepts DESC;
