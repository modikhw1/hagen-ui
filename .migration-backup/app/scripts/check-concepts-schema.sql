-- Check if concepts tables already exist
-- Run this in Supabase SQL Editor to see current state

SELECT
  'concepts' as table_name,
  EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'concepts'
  ) as exists
UNION ALL
SELECT
  'customer_concepts',
  EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'customer_concepts'
  )
UNION ALL
SELECT
  'concept_versions',
  EXISTS (
    SELECT FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'concept_versions'
  );

-- Check row counts if tables exist
SELECT 'concepts' as table_name, COUNT(*) as row_count FROM concepts WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'concepts')
UNION ALL
SELECT 'customer_concepts', COUNT(*) FROM customer_concepts WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'customer_concepts')
UNION ALL
SELECT 'concept_versions', COUNT(*) FROM concept_versions WHERE EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'concept_versions');

-- List all policies on concepts tables
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN ('concepts', 'customer_concepts', 'concept_versions')
ORDER BY tablename, policyname;
