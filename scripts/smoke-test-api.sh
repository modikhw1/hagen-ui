#!/usr/bin/env bash
# smoke-test-api.sh
# Validates that all migrated Express API routes respond correctly.
# Routes requiring authentication return 401; public routes return 200.
# Run: bash scripts/smoke-test-api.sh [BASE_URL]
# Default BASE_URL: http://localhost:8080

set -euo pipefail

BASE="${1:-http://localhost:8080}"
PASS=0
FAIL=0

check() {
  local label="$1"
  local method="$2"
  local path="$3"
  local expected_status="$4"
  shift 4
  local extra_args=("$@")

  local url="${BASE}${path}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X "$method" "${extra_args[@]}" "$url" 2>/dev/null || echo "000")

  if [[ "$status" == "$expected_status" ]]; then
    echo "  PASS  [$status] $method $path  ($label)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  [$status != $expected_status] $method $path  ($label)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "=== Express API Smoke Test ==="
echo "    Base URL: $BASE"
echo ""

# ── System ────────────────────────────────────────────────────────────────────
echo "── System"
check "health probe"   GET /api/healthz 200

# ── Auth guard (all protected routes → 401 without token) ────────────────────
echo ""
echo "── Auth guard (expect 401 without Bearer token)"
check "me"                         GET  /api/me                                      401
check "admin customers list"       GET  /api/admin/customers                         401
check "admin customer detail"      GET  /api/admin/customers/test-id                 401
check "admin billing health"       GET  /api/admin/billing/health                    401
check "admin billing invoices"     GET  /api/admin/billing/invoices                  401
check "admin billing subscriptions" GET /api/admin/billing/subscriptions             401
check "admin billing sync-events"  GET  /api/admin/billing/sync-events               401
check "admin overview metrics"     GET  /api/admin/overview/metrics                  401
check "admin overview attention"   GET  /api/admin/overview/attention                401
check "admin overview costs"       GET  /api/admin/overview/costs                    401
check "admin overview cm-pulse"    GET  /api/admin/overview/cm-pulse                 401
check "admin team list"            GET  /api/admin/team                              401
check "admin team lite"            GET  /api/admin/team/lite                         401
check "admin demos board"          GET  /api/admin/demos                             401
check "admin concepts list"        GET  /api/admin/concepts                          401
check "admin invoices list"        GET  /api/admin/invoices                          401
check "admin subscriptions list"   GET  /api/admin/subscriptions                     401
check "admin audit log"            GET  /api/admin/audit-log                         401
check "admin payroll"              GET  /api/admin/payroll                           401
check "admin settings"             GET  /api/admin/settings                          401
check "admin notifications"        GET  /api/admin/notifications                     401
check "admin notifications unread" GET  "/api/admin/notifications/unread-count"      401
check "admin tiktok profile-preview" GET /api/admin/tiktok/profile-preview          401
check "studio-v2 customers"        GET  /api/studio-v2/customers                     401
check "studio-v2 feed-spans"       GET  /api/studio-v2/feed-spans                    401
check "studio-v2 email jobs"       GET  /api/studio-v2/email/jobs                    401
check "studio-v2 email job patch" GET  /api/studio-v2/email/jobs/test-job             401
check "studio email schedules"     GET  /api/studio/email/schedules                  401
check "customer feed"              GET  /api/customer/feed                            401
check "customer game-plan"         GET  /api/customer/game-plan                      401
check "customer notes"             GET  /api/customer/notes                           401
check "onboarding welcome-context" GET  /api/onboarding/welcome-context              401
check "stripe customer-invoices"   GET  /api/stripe/customer-invoices                401
check "stripe pending-agreement"   GET  /api/stripe/pending-agreement                401

# ── Stripe webhook (fail-closed security check) ──────────────────────────────
# Without STRIPE_WEBHOOK_SECRET: returns 500 (fail-closed, secret not configured)
# With STRIPE_WEBHOOK_SECRET + no/bad sig: returns 400 (signature rejected)
# Both are correct "reject" behaviors — the important thing is we never get 200/201.
echo ""
echo "── Stripe webhook security (fail-closed: no 2xx without valid Stripe sig)"
check_webhook() {
  local label="$1"
  shift
  local url="${BASE}/api/stripe/webhook"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" -X POST "$@" "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "400" || "$status" == "500" ]]; then
    echo "  PASS  [$status] POST /api/stripe/webhook  ($label)"
    PASS=$((PASS + 1))
  else
    echo "  FAIL  [$status != 400|500] POST /api/stripe/webhook  ($label)"
    FAIL=$((FAIL + 1))
  fi
}

check_webhook "no signature — rejected" \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_nosig","type":"invoice.paid","data":{"object":{}}}'

check_webhook "bad signature — rejected" \
  -H "Content-Type: application/json" \
  -H "Stripe-Signature: t=bad,v1=bad" \
  -d '{"id":"evt_badsig","type":"invoice.paid","data":{"object":{}}}'

# ── Letrend / Hagen proxy ────────────────────────────────────────────────────
echo ""
echo "── Letrend proxy (no auth required for proxy routes)"
# These proxy to the Hagen external service; expect 200, 401, or 502 depending on Hagen
STATUS=$(curl -s -o /dev/null -w "%{http_code}" "${BASE}/api/letrend/library" 2>/dev/null || echo "000")
if [[ "$STATUS" == "200" || "$STATUS" == "401" || "$STATUS" == "502" || "$STATUS" == "500" ]]; then
  echo "  PASS  [$STATUS] GET /api/letrend/library (proxy-or-upstream-error)"
  PASS=$((PASS + 1))
else
  echo "  FAIL  [$STATUS] GET /api/letrend/library (unexpected)"
  FAIL=$((FAIL + 1))
fi

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
echo ""

if [[ $FAIL -gt 0 ]]; then
  exit 1
fi
exit 0
