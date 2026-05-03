# Schema Simplification Summary

## Completed Actions (December 9, 2025)

### 1. Created ROADMAP.md
**Purpose**: Document all deferred features until core system is validated

**Contents**:
- All Priority 1-3 features from FEATURE_GAPS_AND_FRAMEWORKS.md
- Brand profile integration plans (shelved)
- Criteria extraction system (shelved)
- Fine-tuning pipeline (shelved)
- Decision log and validation criteria

**Key Decision**: No new features until correlation analysis shows >0.6 between Gemini features and human ratings.

---

### 2. Created Migration 011_simplify_schema.sql
**Purpose**: Remove redundant and unused database elements

**Actions**:
1. ✅ Drop `active_criteria` view (unused in application code)
2. ✅ Drop `ratings_with_videos` view (unused)
3. ✅ Remove `analyzed_videos.user_ratings` JSONB column (redundant with `video_ratings` table)
4. ✅ Drop `ratings_v2` table (limitless schema experiment, never integrated)
5. ✅ Drop `discovered_criteria` table (part of ratings_v2 system)
6. ✅ Drop `learned_patterns` table (part of ratings_v2 system)

**Safety Check**: Migration includes verification that no orphaned data exists in `user_ratings` column before dropping.

**Kept Tables**:
- `video_ratings` - Primary human ratings storage
- `analyzed_videos` - Gemini analysis (visual_analysis, audio_analysis)
- `discovered_patterns` - From migration 002 (may still be used)
- `rating_schema_versions` - Tracks core schema evolution

---

### 3. Updated /rate Page
**Purpose**: Deprecate legacy rating interface while keeping it functional

**Changes**:
- ✅ Added prominent migration notice banner at top of page
- ✅ Banner directs users to `/analyze-rate`
- ✅ Explains new system is primary, old system for comparison only
- ✅ Includes direct "Switch to New System" button

**UI Preserved**: All functionality remains intact for comparison testing.

---

## Current System Architecture (Simplified)

### Data Flow for Rating Content

```
1. VIDEO ANALYSIS
   ├─ Input: Video URL
   ├─ Process: Gemini analyzes video
   ├─ Output: 150-200 features stored in analyzed_videos.visual_analysis
   └─ Status: Working ✅

2. HUMAN RATING (Two Interfaces)
   
   A. /rate (LEGACY - Being Deprecated)
      ├─ Input: 5 dimensions (0-1) + overall + notes
      ├─ Storage: video_ratings table
      └─ Status: Functional but deprecated ⚠️
   
   B. /analyze-rate (PRIMARY)
      ├─ Input: Quality tier + 3 note fields
      ├─ Storage: video_ratings table + content_embedding
      └─ Status: Active, recommended ✅

3. PATTERN DISCOVERY
   ├─ Input: video_ratings.overall_score + analyzed_videos.visual_analysis
   ├─ Process: Calculate correlations between Gemini features and human scores
   ├─ Output: Which features predict quality
   └─ Status: Implemented but needs validation ⏳
```

### Simplified Database Schema

**Core Tables (Active)**:

1. `analyzed_videos`
   - Stores Gemini's deep analysis (150-200 features)
   - Columns: `visual_analysis`, `audio_analysis`, `metadata`
   - Removed: `user_ratings` (redundant)

2. `video_ratings`
   - Stores all human ratings
   - Columns: `overall_score`, `dimensions`, `notes`, `tags`
   - Single source of truth for ratings

3. `brand_profiles`
   - Stores brand identity profiles
   - Status: Implemented but not connected to rating workflow yet

4. `brand_conversations` + `brand_conversation_messages`
   - Conversational brand profiling system
   - Status: Implemented, kept separate from rating workflow

**Removed Tables/Views**:
- ❌ `active_criteria` (view)
- ❌ `ratings_with_videos` (view)
- ❌ `ratings_v2` (table)
- ❌ `discovered_criteria` (table)
- ❌ `learned_patterns` (table)
- ❌ `analyzed_videos.user_ratings` (column)

**Pattern Discovery Tables (Kept)**:
- ✅ `discovered_patterns` - AI insights from correlation analysis
- ✅ `rating_schema_versions` - Schema evolution tracking

---

## Application Code Changes Needed

### Files Referencing Removed Elements

The following files reference `analyzed_videos.user_ratings` and need updates:

1. `/src/components/features/SimilarVideos.tsx`
   - Lines 12, 128-135
   - Currently displays ratings from `video.user_ratings`
   - **Action needed**: Change to join with `video_ratings` table

2. `/src/app/api/videos/rate/route.ts`
   - Lines 41, 52, 189
   - Reads/writes `user_ratings` column
   - **Action needed**: Remove writes, change reads to use `video_ratings` join

3. `/src/app/api/videos/analyze/deep/route.ts`
   - Line 147
   - Returns `userRatings: video.user_ratings`
   - **Action needed**: Join with `video_ratings` table instead

4. `/src/app/api/videos/analyze/route.ts`
   - Lines 31, 42, 142
   - Queries `user_ratings` column
   - **Action needed**: Update queries to join `video_ratings`

5. `/src/app/api/videos/similar/route.ts`
   - Lines 108, 110, 134
   - Filters by `user_ratings` presence
   - **Action needed**: Change to check `video_ratings` table existence

6. `/src/app/api/videos/library/route.ts`
   - Lines 15, 16
   - Selects `user_ratings` column
   - **Action needed**: Join with `video_ratings` table

7. `/src/types/database.ts`
   - Lines 50, 69, 88
   - Type definition includes `user_ratings: Json`
   - **Action needed**: Remove from type definition

---

## Next Steps (Priority Order)

### Immediate (Do Now)
1. ✅ Run migration `011_simplify_schema.sql` in Supabase
2. ⏳ Update application code to stop referencing `user_ratings` column
3. ⏳ Update TypeScript types in `database.ts`

### Short Term (This Week)
4. ⏳ Export existing 100 ratings as gold standard dataset
5. ⏳ Run correlation analysis on existing ratings
6. ⏳ Document which Gemini features predict quality

### Medium Term (After Validation)
7. ⏳ Build `/analyze/correlations` dashboard
8. ⏳ Establish "evergreen quality" metric definition
9. ⏳ Compare old vs new rating system effectiveness
10. ⏳ Remove `/rate` page entirely if new system proves better

---

## Success Criteria

Before re-introducing any features, validate:

1. **Correlation Strength**: Gemini features show >0.6 correlation with human ratings
2. **Quality Definition**: Clear definition of "evergreen quality" independent of trends/brand
3. **Reproducible Patterns**: High-rated videos share identifiable traits
4. **System Confidence**: Can predict with 70%+ accuracy whether content is "good"

---

## Files Created/Modified

### New Files
- ✅ `/ROADMAP.md` - Deferred features documentation
- ✅ `/supabase/migrations/011_simplify_schema.sql` - Schema cleanup
- ✅ `/SIMPLIFICATION_SUMMARY.md` - This file

### Modified Files
- ✅ `/src/app/rate/page.tsx` - Added deprecation notice

### Files Needing Updates
- ⏳ `/src/components/features/SimilarVideos.tsx`
- ⏳ `/src/app/api/videos/rate/route.ts`
- ⏳ `/src/app/api/videos/analyze/deep/route.ts`
- ⏳ `/src/app/api/videos/analyze/route.ts`
- ⏳ `/src/app/api/videos/similar/route.ts`
- ⏳ `/src/app/api/videos/library/route.ts`
- ⏳ `/src/types/database.ts`

---

## Rollback Plan

If simplification causes issues:

1. **Restore ratings_v2**: Re-run `006_limitless_schema.sql`
2. **Restore user_ratings column**: 
   ```sql
   ALTER TABLE analyzed_videos ADD COLUMN user_ratings JSONB;
   ```
3. **Restore views**:
   ```sql
   -- Copy from 006_limitless_schema.sql lines 215-230
   ```

**Note**: Data in `user_ratings` column will be permanently lost after migration. Ensure `video_ratings` table has all necessary data before proceeding.

---

*Generated: December 9, 2025*  
*Status: Migration ready, application code updates pending*
