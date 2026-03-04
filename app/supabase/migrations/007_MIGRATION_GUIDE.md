# Running Migration 007: Concepts Architecture

## Overview

This migration moves concept data from JSON files (`clips-priority.json`) to Supabase database tables.

**What it does:**
- Creates `concepts` table (master library)
- Creates `customer_concepts` table (customer-specific customizations)
- Creates `concept_versions` table (version history)
- Adds RLS policies and helper functions

---

## Step 1: Run SQL Migration

### Method 1: Via Supabase Dashboard (Recommended)

1. Go to: https://supabase.com/dashboard/project/your-project/sql/new
2. Open file: `app/supabase/migrations/007_concepts_architecture.sql`
3. Copy entire contents
4. Paste in SQL Editor and click "Run"

### Method 2: Via psql

```bash
psql "your-connection-string" -f app/supabase/migrations/007_concepts_architecture.sql
```

---

## Step 2: Migrate Data from JSON

After running the SQL migration, migrate existing data:

```bash
cd app
node scripts/migrate-concepts-to-supabase.js
```

**Expected output:**
```
🚀 Starting concept migration to Supabase...

📁 Step 1: Loading clips-priority.json...
✓ Loaded 19 clips from JSON
   Version: 2.0

📝 Step 2: Migrating clips to `concepts` table...
   ✓ Inserted clip-70690326
   ...
   Summary:
   - Inserted: 19
   - Skipped: 0
   - Errors: 0

📝 Step 3: Migrating customer concepts...
   Found X customer profiles with concepts
   ...

✅ Migration complete!
```

---

## Step 3: Verify Migration

Run these queries in Supabase SQL Editor:

```sql
-- Check concept count
SELECT COUNT(*) FROM concepts;
-- Expected: 19 (from clips-priority.json)

-- Check sample concepts
SELECT id, source,
       backend_data->>'url' as url,
       overrides->>'headline_sv' as headline
FROM concepts
LIMIT 5;

-- Check customer concepts
SELECT cc.concept_id, cc.match_percentage, cp.business_name
FROM customer_concepts cc
JOIN customer_profiles cp ON cp.id = cc.customer_profile_id
LIMIT 10;
```

---

## Step 4: Update Application Code

After successful migration, update:

1. ✅ ConceptLoader - Switch from JSON to Supabase
2. ✅ API Endpoints - Create concept CRUD
3. ✅ Studio Edit Page - Save to database

---

## Troubleshooting

### "concepts table already exists"
- Migration was already run
- Safe to run data migration script again (it checks for duplicates)

### "permission denied"
- Check `.env.local` has correct `SUPABASE_SERVICE_ROLE_KEY`

### "clips-priority.json not found"
- Ensure running from `/app` directory
- File should be at `src/data/clips-priority.json`

---

## Rollback (if needed)

```sql
-- WARNING: This deletes all migrated data!
DROP TABLE IF EXISTS concept_versions CASCADE;
DROP TABLE IF EXISTS customer_concepts CASCADE;
DROP TABLE IF EXISTS concepts CASCADE;
DROP FUNCTION IF EXISTS update_concept_with_version;
DROP FUNCTION IF EXISTS get_customer_concept;
```

---

**Status:** ✅ Ready to run!
