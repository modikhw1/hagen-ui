#!/usr/bin/env bash
# smoke-test-hagen.sh
#
# Quick end-to-end smoke test for the Hagen ingest routes used by LeTrend.
# Run against a live Hagen instance (Railway or local Next.js dev server).
#
# Usage:
#   HAGEN_URL=https://your-hagen.up.railway.app bash scripts/smoke-test-hagen.sh
#   HAGEN_URL=http://localhost:3001 bash scripts/smoke-test-hagen.sh
#
# Prerequisites: curl, jq

set -euo pipefail

HAGEN_URL="${HAGEN_URL:-http://localhost:3001}"
PASS=0
FAIL=0

green() { printf "\033[32m%s\033[0m\n" "$*"; }
red()   { printf "\033[31m%s\033[0m\n" "$*"; }
bold()  { printf "\033[1m%s\033[0m\n" "$*"; }

check() {
  local label="$1"
  local status="$2"
  local body="$3"
  local expected_key="${4:-}"

  if [[ "$status" -lt 200 || "$status" -ge 300 ]]; then
    red "FAIL [$label] HTTP $status"
    echo "  Body: $(echo "$body" | head -c 300)"
    FAIL=$((FAIL+1))
    return
  fi

  if [[ -n "$expected_key" ]]; then
    if ! echo "$body" | jq -e "$expected_key" > /dev/null 2>&1; then
      red "FAIL [$label] key '$expected_key' missing in response"
      echo "  Body: $(echo "$body" | head -c 300)"
      FAIL=$((FAIL+1))
      return
    fi
  fi

  green "PASS [$label]"
  PASS=$((PASS+1))
}

bold "=== Hagen smoke tests → $HAGEN_URL ==="
echo ""

# ── 1. Version handshake ────────────────────────────────────────────────────
bold "1. GET /api/letrend/version"
resp=$(curl -sf -w "\n%{http_code}" "$HAGEN_URL/api/letrend/version" 2>/dev/null || echo -e '{}\n000')
body=$(echo "$resp" | head -n -1)
status=$(echo "$resp" | tail -n1)
check "version" "$status" "$body" '.routes.studio_concepts_analyze'
check "version:enrich_route" "$status" "$body" '.routes.studio_concepts_enrich'

# ── 2. studio/concepts/analyze — missing body ───────────────────────────────
bold "2. POST /api/studio/concepts/analyze (no body → 400)"
resp=$(curl -sf -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$HAGEN_URL/api/studio/concepts/analyze" 2>/dev/null || echo -e '{}\n000')
body=$(echo "$resp" | head -n -1)
status=$(echo "$resp" | tail -n1)
if [[ "$status" == "400" ]]; then
  green "PASS [analyze:400-on-missing-url]"
  PASS=$((PASS+1))
else
  red "FAIL [analyze:400-on-missing-url] expected 400 got $status"
  FAIL=$((FAIL+1))
fi

# ── 3. studio/concepts/analyze — invalid URL ────────────────────────────────
bold "3. POST /api/studio/concepts/analyze (invalid URL → 400)"
resp=$(curl -sf -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{"videoUrl":"not-a-url"}' \
  "$HAGEN_URL/api/studio/concepts/analyze" 2>/dev/null || echo -e '{}\n000')
body=$(echo "$resp" | head -n -1)
status=$(echo "$resp" | tail -n1)
if [[ "$status" == "400" ]]; then
  green "PASS [analyze:400-on-invalid-url]"
  PASS=$((PASS+1))
else
  red "FAIL [analyze:400-on-invalid-url] expected 400 got $status"
  FAIL=$((FAIL+1))
fi

# ── 4. studio/concepts/enrich — missing body ────────────────────────────────
bold "4. POST /api/studio/concepts/enrich (no backend_data → 400)"
resp=$(curl -sf -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d '{}' \
  "$HAGEN_URL/api/studio/concepts/enrich" 2>/dev/null || echo -e '{}\n000')
body=$(echo "$resp" | head -n -1)
status=$(echo "$resp" | tail -n1)
if [[ "$status" == "400" ]]; then
  green "PASS [enrich:400-on-missing-data]"
  PASS=$((PASS+1))
else
  red "FAIL [enrich:400-on-missing-data] expected 400 got $status"
  FAIL=$((FAIL+1))
fi

# ── 5. studio/concepts/enrich — minimal valid payload ───────────────────────
bold "5. POST /api/studio/concepts/enrich (minimal payload → overrides)"
ENRICH_PAYLOAD='{"backend_data":{"script":{"conceptCore":"Restaurangpersonalen testar maten","hasScript":true,"transcript":"Vi testar.","humor":{"isHumorous":false}},"content":{"keyMessage":"Bakom kulisserna på restaurangen","format":"talking head"},"audio":{"hasVoiceover":true},"technical":{"pacing":6}}}'
resp=$(curl -sf -w "\n%{http_code}" -X POST \
  -H "Content-Type: application/json" \
  -d "$ENRICH_PAYLOAD" \
  "$HAGEN_URL/api/studio/concepts/enrich" 2>/dev/null || echo -e '{}\n000')
body=$(echo "$resp" | head -n -1)
status=$(echo "$resp" | tail -n1)
check "enrich:overrides" "$status" "$body" '.overrides.headline_sv'
check "enrich:businessTypes" "$status" "$body" '.overrides.businessTypes'

# ── Summary ─────────────────────────────────────────────────────────────────
echo ""
bold "=== Results: $PASS passed, $FAIL failed ==="
[[ $FAIL -eq 0 ]] && exit 0 || exit 1
