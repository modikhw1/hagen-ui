#!/bin/bash
# DATA STATE VERIFICATION SCRIPT
# Run this BEFORE starting any development session
# Usage: ./scripts/verify-data-state.sh

set -e

echo "=========================================="
echo "  HAGEN DATA STATE VERIFICATION"
echo "  $(date)"
echo "=========================================="
echo ""

# Check if server is running
PORT=${1:-3001}
if ! curl -s "http://localhost:$PORT/api/videos/analyze?count=true" > /dev/null 2>&1; then
    echo "❌ Server not running on port $PORT"
    echo "   Start with: npm run dev"
    exit 1
fi

echo "✅ Server running on port $PORT"
echo ""

# 1. Video counts
echo "📊 VIDEO COUNTS"
echo "---------------"
TOTAL=$(curl -s "http://localhost:$PORT/api/videos/analyze?count=true" | jq -r '.count // 0')
echo "Total videos imported: $TOTAL"

WITH_GCS=$(curl -s "http://localhost:$PORT/api/videos/analyze?limit=200" | jq '[.videos[] | select(.gcs_uri != null)] | length')
echo "Videos with GCS upload: $WITH_GCS"

WITH_DEEP=$(curl -s "http://localhost:$PORT/api/videos/analyze?limit=200" | jq '[.videos[] | select(.visual_analysis.feature_count != null)] | length')
echo "Videos with FULL deep analysis (150-200 features): $WITH_DEEP"

WITH_PARTIAL=$(curl -s "http://localhost:$PORT/api/videos/analyze?limit=200" | jq '[.videos[] | select(.visual_analysis != null and .visual_analysis.feature_count == null)] | length')
echo "Videos with partial/legacy analysis only: $WITH_PARTIAL"

echo ""
echo "📋 ANALYSIS VERSIONS"
echo "--------------------"
curl -s "http://localhost:$PORT/api/videos/analyze?limit=200" | jq -r '
  [.videos[] | select(.visual_analysis != null) | 
   {version: (if .visual_analysis.prediction_model != null then "v0 (prediction only)"
              elif (.visual_analysis | keys | length) <= 10 then "v1 (basic)"
              elif (.visual_analysis | keys | length) <= 17 then "v2 (extended)"
              else "v3 (full/current)" end)}
  ] | group_by(.version) | map("\(.[0].version): \(length)") | .[]'
echo ""

# 2. Rating counts
echo "📝 RATING COUNTS"
echo "----------------"
RATED=$(curl -s "http://localhost:$PORT/api/ratings" | jq 'length')
echo "Videos rated (in video_ratings): $RATED"

WITH_NOTES=$(curl -s "http://localhost:$PORT/api/ratings" | jq '[.[] | select(.notes != null and .notes != "")] | length')
echo "Ratings with notes: $WITH_NOTES"

WITH_AI=$(curl -s "http://localhost:$PORT/api/ratings" | jq '[.[] | select(.ai_prediction != null)] | length')
echo "Ratings with AI predictions: $WITH_AI"
echo ""

# 3. CRITICAL: Overlap check (must have FULL deep analysis with feature_count)
echo "🔗 DATA OVERLAP (for correlation)"
echo "----------------------------------"
OVERLAP=$(curl -s "http://localhost:$PORT/api/ratings" | jq '[.[] | select(.video.visual_analysis.feature_count != null)] | length')
echo "Videos with BOTH rating AND full deep analysis: $OVERLAP"

if [ "$OVERLAP" -lt 10 ]; then
    echo "⚠️  WARNING: Less than 10 videos have both. Correlation analysis will be weak."
elif [ "$OVERLAP" -lt 20 ]; then
    echo "⚡ OK: $OVERLAP videos ready for basic correlation."
else
    echo "✅ GOOD: $OVERLAP videos ready for robust correlation analysis."
fi
echo ""

# 4. Sample video check
echo "🔍 SAMPLE VIDEO (first rated)"
echo "-----------------------------"
curl -s "http://localhost:$PORT/api/ratings?limit=1" | jq '.[0] | {
  video_id: .video_id,
  human_score: .overall_score,
  ai_predicted: .ai_prediction.overall,
  has_notes: (.notes != null and .notes != ""),
  has_deep_analysis: (.video.visual_analysis != null),
  feature_count: (.video.visual_analysis.feature_count // "N/A")
}'
echo ""

# 5. Brand Profiles
echo "🏷️  BRAND PROFILES"
echo "------------------"
BRAND_PROFILES=$(curl -s "http://localhost:$PORT/api/brand-profile" | jq '.profiles | length // 0' 2>/dev/null || echo "0")
echo "Total brand profiles: $BRAND_PROFILES"

if [ "$BRAND_PROFILES" != "0" ] && [ "$BRAND_PROFILES" != "null" ]; then
    COMPLETE_PROFILES=$(curl -s "http://localhost:$PORT/api/brand-profile?status=complete" | jq '.profiles | length // 0' 2>/dev/null || echo "0")
    DRAFT_PROFILES=$(curl -s "http://localhost:$PORT/api/brand-profile?status=draft" | jq '.profiles | length // 0' 2>/dev/null || echo "0")
    echo "  Complete: $COMPLETE_PROFILES"
    echo "  Draft: $DRAFT_PROFILES"
    
    # Sample profile
    echo ""
    echo "Sample brand profile:"
    curl -s "http://localhost:$PORT/api/brand-profile?limit=1" | jq '.profiles[0] | {
      name: .name,
      business_type: .business_type,
      status: .status,
      has_characteristics: (.characteristics != null and .characteristics != {}),
      has_tone: (.tone != null and .tone != {})
    }' 2>/dev/null || echo "  (none)"
else
    echo "  No brand profiles created yet"
fi
echo ""

# 6. Reminder
echo "=========================================="
echo "  📖 See DATA_ARCHITECTURE.md for details"
echo "  🔧 Update that doc before changing data structures"
echo "=========================================="
