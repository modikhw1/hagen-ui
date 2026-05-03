#!/bin/bash

# Test if Supabase database has the required tables
echo "🔍 Checking database setup..."
echo ""

# You'll need to run this SQL in your Supabase SQL Editor:
cat << 'EOF'
To verify your database is ready, run this in Supabase SQL Editor:

SELECT 
  table_name,
  CASE 
    WHEN table_name IN ('analyzed_videos', 'rating_schema_versions', 'discovered_patterns', 'video_metrics') 
    THEN '✅ Required'
    ELSE '📋 Found'
  END as status
FROM information_schema.tables 
WHERE table_schema = 'public'
  AND table_name IN (
    'analyzed_videos', 
    'rating_schema_versions', 
    'discovered_patterns', 
    'video_metrics'
  )
ORDER BY table_name;

-- Also check if pgvector extension is enabled:
SELECT * FROM pg_extension WHERE extname = 'vector';

EOF

echo ""
echo "📝 If tables are missing, run this migration:"
echo "   File: supabase/migrations/002_ai_analysis_system.sql"
echo "   Location: Supabase Dashboard → SQL Editor"
echo ""
