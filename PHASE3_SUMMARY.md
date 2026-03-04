# Phase 3 Summary: Concepts Architecture

## Completed ✅

### 1. Database Schema
**File:** `app/supabase/migrations/007_concepts_architecture.sql`

Created 3 new tables:
- `concepts` - Master library of TikTok concepts (replaces clips-priority.json)
- `customer_concepts` - Customer-specific customizations
- `concept_versions` - Version history and audit trail

**Features:**
- RLS policies for security (admin, content_manager, customer access)
- Helper functions: `update_concept_with_version()`, `get_customer_concept()`
- Indexes for performance
- Full comments/documentation

### 2. Migration Scripts
**Files:**
- `app/scripts/migrate-concepts-to-supabase.js` (JavaScript)
- `app/scripts/migrate-concepts-to-supabase.ts` (TypeScript)
- `app/supabase/migrations/007_MIGRATION_GUIDE.md` (Guide)

**What they do:**
1. Load clips from `clips-priority.json`
2. Insert all clips into `concepts` table
3. Migrate existing `customer_profiles.concepts` → `customer_concepts` table
4. Verify migration success

**Usage:**
```bash
cd app
node scripts/migrate-concepts-to-supabase.js
```

### 3. API Endpoints
**Files:**
- `app/src/app/api/admin/concepts/route.ts` (GET, POST)
- `app/src/app/api/admin/concepts/[id]/route.ts` (GET, PUT, DELETE)

**Endpoints:**
- `GET /api/admin/concepts` - List all concepts (with filters)
- `POST /api/admin/concepts` - Create new CM-created concept
- `GET /api/admin/concepts/[id]` - Get single concept
- `PUT /api/admin/concepts/[id]` - Update concept (with version history)
- `DELETE /api/admin/concepts/[id]` - Delete concept (if not used)

**Security:** All protected with `withAuth(['admin', 'content_manager'])`

### 4. Concept Edit Page Fixed
**File:** `app/src/app/studio/concepts/[id]/edit/page.tsx`

**Changed:**
- Removed TODO comment
- Implemented real save functionality
- Calls `PUT /api/admin/concepts/[id]` to save overrides
- Shows success/error feedback

### 5. New Database-based Concept Loader
**File:** `app/src/lib/conceptLoaderDB.ts`

**Functions:**
- `loadConcepts()` - Load all active concepts from Supabase
- `loadConceptById(id)` - Load single concept
- `getRawConcepts()` - Get raw data for admin
- `loadDashboardData()` - Generate dashboard rows
- `loadCustomerConcepts(customerId)` - Load with customer customizations

**Features:**
- Works server-side and client-side
- Uses correct Supabase key based on context
- Maintains same interface as old JSON loader

---

## Next Steps (To Complete Phase 3)

### Step 1: Run Migration ⚠️ REQUIRED

1. **Run SQL migration:**
   - Go to Supabase Dashboard → SQL Editor
   - Open `app/supabase/migrations/007_concepts_architecture.sql`
   - Copy and paste, click "Run"

2. **Run data migration:**
   ```bash
   cd app
   node scripts/migrate-concepts-to-supabase.js
   ```

3. **Verify:**
   ```sql
   SELECT COUNT(*) FROM concepts;  -- Should be 19
   SELECT COUNT(*) FROM customer_concepts;  -- Depends on existing data
   ```

### Step 2: Update Application to Use Database

Currently the app still uses the old JSON-based ConceptLoader. To fully migrate:

**Option A: Gradual Migration (Recommended)**
- Keep `conceptLoader.ts` (JSON) for backward compatibility
- Use `conceptLoaderDB.ts` (Supabase) in new code
- Gradually update pages one by one
- Test each update

**Option B: Full Migration**
- Replace all imports of `conceptLoader.ts` with `conceptLoaderDB.ts`
- Update all pages to use async `await loadConcepts()`
- Test thoroughly

**Files that need updating (Option B):**
```bash
# Find all usages
grep -r "from '@/lib/conceptLoader'" app/src/
```

Common files:
- `app/src/app/studio/concepts/page.tsx`
- `app/src/app/studio/concepts/[id]/page.tsx`
- `app/src/app/studio/concepts/[id]/edit/page.tsx`
- Any customer dashboard pages

### Step 3: Test Everything

**Test checklist:**
- [ ] Can view concepts in Studio
- [ ] Can edit concept and save changes
- [ ] Changes persist after refresh
- [ ] Version history is created (check `concept_versions` table)
- [ ] Customer-specific concepts load correctly
- [ ] RLS policies work (customers only see their concepts)

---

## Migration Safety

**Before running migration:**
1. Backup `clips-priority.json` (already in git)
2. Backup Supabase database (via Supabase Dashboard)
3. Test on development environment first

**Rollback if needed:**
```sql
-- WARNING: Deletes all data!
DROP TABLE IF EXISTS concept_versions CASCADE;
DROP TABLE IF EXISTS customer_concepts CASCADE;
DROP TABLE IF EXISTS concepts CASCADE;
```

**After rollback:**
- App will continue using JSON files
- No data loss (JSON files unchanged)
- Can retry migration after fixing issues

---

## Benefits of This Architecture

✅ **Editability:** CMs can now edit concepts and changes are saved
✅ **Version Control:** Full audit trail of concept changes
✅ **Customer Customization:** Each customer can have personalized concept versions
✅ **Scalability:** Database queries are faster than loading large JSON
✅ **Collaboration:** Multiple CMs can work simultaneously
✅ **Search:** Easy to add search/filter functionality
✅ **API First:** Clean REST API for future integrations

---

## Known Limitations

⚠️ **ConceptLoader still uses JSON by default**
- Need to update imports manually or create automatic fallback

⚠️ **No automatic sync from hagen backend**
- Concepts imported once during migration
- Future: Add API endpoint to import new concepts from hagen

⚠️ **Client-side loading requires auth**
- `conceptLoaderDB.ts` uses Supabase client
- RLS policies enforce access control

---

## Phase 3 Status

✅ Database schema created
✅ Migration scripts created
✅ API endpoints created
✅ Edit page fixed
✅ Database-based loader created

⏳ Migration not run yet (waiting for user)
⏳ App code not updated to use DB (optional)

**Completion:** 80% (core infrastructure done, deployment pending)
