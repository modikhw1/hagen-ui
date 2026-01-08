# Edge Cases & Error Handling - letrend

> **Purpose**: Define behavior for edge cases, errors, and unusual states
> **Status**: Revised based on owner input
> **Updated**: January 1, 2026

---

## Edge Case Categories

1. [Profile & Onboarding](#profile--onboarding) *(NEW)*
2. [Recommendations](#recommendations) *(NEW)*
3. [Availability & Timing](#availability--timing)
4. [Payment & Transactions](#payment--transactions)
5. [Video & Media](#video--media)
6. [Video Submissions](#video-submissions) *(Renamed from Cashback)*
7. [User Account](#user-account)
8. [Concurrency](#concurrency)
9. [Data & Validation](#data--validation)

---

## Profile & Onboarding

### EC-P1: User abandons onboarding chat mid-conversation

**Scenario**: User starts profile chat but closes tab before completing.

**Handling**:
- Save partial profile data to session/localStorage
- On return: "Pick up where you left off?"
- Option to start fresh

**Recovery**:
```
┌─────────────────────────────────────────┐
│ Welcome back!                           │
│                                         │
│ You were setting up your profile.       │
│                                         │
│ [Continue] [Start Over]                 │
└─────────────────────────────────────────┘
```

---

### EC-P2: User tries to access /for-you without profile

**Scenario**: User navigates directly to recommendations page without completing onboarding.

**Handling**:
- Redirect to /start (onboarding chat)
- Show: "Let's set up your profile first so we can show you relevant concepts."

**NOT shown**:
- Generic recommendations (defeats the purpose)
- Browse page (doesn't exist)

---

### EC-P3: User provides "Other" business type not in our list

**Scenario**: User selects "Other..." and types "Pet grooming salon".

**Handling**:
- Accept and store as-is
- AI attempts to map to closest category for recommendations
- Flag for staff review to potentially add new category

**Recommendation calculation**:
- Use partial matching where possible
- Show concepts tagged as "flexible" or "universal"
- May show lower match percentages (honest about uncertainty)

---

### EC-P4: User's social links are private or inaccessible

**Scenario**: User shares Instagram link, but account is private.

**Handling**:
- Gracefully skip analysis
- Message: "We couldn't access that account (it might be private). No worries—we'll work with what you told us!"
- Continue with manual preferences only

---

### EC-P5: User wants to update profile after purchases

**Scenario**: User bought concepts for "café", now wants to change to "bar".

**Handling**:
- Allow profile updates at any time
- Existing purchases remain accessible
- New recommendations reflect updated profile
- Optional: "Your recommendations will update based on your new preferences."

---

### EC-P6: Social link analysis returns unexpected tone

**Scenario**: AI infers "edgy" from socials, but user selected "wholesome".

**Handling**:
- User's explicit preference takes priority
- Store inferred data as secondary signal
- Don't override or contradict user's stated preference

---

## Recommendations

### EC-R1: No concepts match user's profile

**Scenario**: New user with unusual profile combination, no concepts score above threshold.

**Handling**:
```
┌─────────────────────────────────────────┐
│ We're finding concepts for you          │
│                                         │
│ Your profile is a bit unique—we're      │
│ working on adding more concepts that    │
│ fit. Check back soon!                   │
│                                         │
│ [Update Preferences]                    │
└─────────────────────────────────────────┘
```

**Actions**:
- Log profile for staff review (demand signal)
- Consider showing lower-match concepts with disclaimer

---

### EC-R2: All recommendations are sold out

**Scenario**: User's top matches are all sold out in their market.

**Handling**:
- Show sold-out concepts grayed out (so user knows supply exists)
- Show message: "Popular concepts sell fast. New ones are added regularly."
- Option to see concepts with lower match scores

---

### EC-R3: User in new market with no concepts available

**Scenario**: User is in a newly supported country with no active listings.

**Handling**:
```
┌─────────────────────────────────────────┐
│ We're just getting started in [Country] │
│                                         │
│ New concepts are coming soon.           │
│ Leave your email and we'll let you know │
│ when there's something for you.         │
│                                         │
│ [Email input] [Notify Me]               │
└─────────────────────────────────────────┘
```

---

### EC-R4: Match percentage calculation fails

**Scenario**: Missing data prevents match % calculation for some concepts.

**Handling**:
- Hide match % for affected concepts
- Show other indicators (trend, difficulty, price)
- Log for investigation

**Display**:
- Instead of "94% match" show nothing (don't show "0%" or "N/A")

---

---

## Availability & Timing

### EC-1: Concept expires during viewing (detail page)

**Scenario**: User is on concept detail page, 72-hour window ends while they're reading.

**Detection**:
- Client-side timer checks expiry
- API returns 410 Gone on purchase attempt

**Handling**:
```
┌─────────────────────────────────────────┐
│ ⚠️ This concept has expired             │
│                                         │
│ The listing window has closed.          │
│ This concept may return in the future.  │
│                                         │
│ [Browse Other Concepts]                 │
└─────────────────────────────────────────┘
```

**Actions**:
- Disable purchase button
- Show overlay/modal
- Remove from browse results

---

### EC-2: Concept sells out in user's market during viewing

**Scenario**: Last copy in user's market sells while they're on detail page.

**Detection**:
- Real-time update (WebSocket) OR
- Check availability on "Purchase" click

**Handling**:
```
┌─────────────────────────────────────────┐
│ 😔 Sold out in your market              │
│                                         │
│ All copies for [Country] have sold.     │
│                                         │
│ [Browse Other Concepts]                 │
└─────────────────────────────────────────┘
```

**Note**: Concept may still be available in other markets (global cap not reached).

---

### EC-3: Concept sells out globally during checkout

**Scenario**: User enters checkout, last global copy sells before they submit payment.

**Detection**: Pre-purchase inventory check

**Handling**:
```
┌─────────────────────────────────────────┐
│ 😔 This concept just sold out           │
│                                         │
│ Sorry, the last copy was purchased      │
│ moments ago.                            │
│                                         │
│ [Browse Other Concepts]                 │
└─────────────────────────────────────────┘
```

**Actions**:
- No charge to user
- Clear checkout state
- Redirect after 5 seconds (or on button click)

---

### EC-4: User in unsupported market

**Scenario**: User from country not in market_contexts table.

**Detection**: IP geolocation returns unsupported country

**Options**:

**Option A: Block access**
```
┌─────────────────────────────────────────┐
│ letrend isn't available in your region  │
│                                         │
│ We're not yet operating in [Country].   │
│ Leave your email to be notified when    │
│ we launch there.                        │
│                                         │
│ [Email input] [Notify Me]               │
└─────────────────────────────────────────┘
```

**Option B: Default to USD pricing**
- Allow purchase
- Use USD pricing (no PPP adjustment)
- Show disclaimer: "Prices shown in USD"

**[DECISION NEEDED: Which approach?]**

---

### EC-5: User VPN/location mismatch

**Scenario**: User appears to be in different country than their billing address.

**Risk**: PPP arbitrage (buy from low-PPP country, actually in high-PPP)

**Options**:
- Ignore (MVP simplicity)
- Use billing country for pricing
- Flag for manual review if mismatch > threshold

**Recommendation**: Use billing country for MVP. Add detection later if abuse occurs.

---

## Payment & Transactions

### EC-6: Payment succeeds but webhook fails

**Scenario**: Stripe charges card, but webhook to create transaction record fails.

**Detection**: Stripe webhook retry / reconciliation job

**Handling**:
- Stripe retries webhooks automatically
- Run daily reconciliation: compare Stripe charges to transactions table
- Alert staff for manual resolution if mismatch persists

**User experience**:
- User sees success page (optimistic)
- If transaction not created within 5 minutes, show in purchases as "Processing..."
- Email user if manual intervention needed

---

### EC-7: Double-click on purchase button

**Scenario**: User clicks "Pay" multiple times quickly.

**Prevention**:
- Disable button on first click
- Server-side idempotency key (Stripe handles this)
- Frontend loading state

**If double charge occurs**:
- Stripe idempotency prevents actual double charge
- If somehow double transaction created, flag for refund

---

### EC-8: User already owns concept

**Scenario**: User tries to purchase concept they already bought.

**Detection**: Check transactions table before checkout

**Handling**:
```
┌─────────────────────────────────────────┐
│ You already own this concept            │
│                                         │
│ [View in My Purchases]                  │
└─────────────────────────────────────────┘
```

**Show instead of**: Purchase button on detail page

---

### EC-9: Credits exceed purchase price

**Scenario**: User has $15 credits, concept costs $12.

**Handling**:
- Allow full credit usage
- Remaining $3 stays as credits
- No payment method needed
- "Pay $0.00" button (or "Use Credits")

---

### EC-10: Partial credits + card payment fails

**Scenario**: User applies $5 credits to $12 purchase, card declined for remaining $7.

**Handling**:
- Credits NOT deducted until payment succeeds
- Show card error
- Credits remain available
- User can retry or use different card

---

### EC-11: Refund requested

**Scenario**: User requests refund (not cashback, actual refund).

**Policy options**:
- No refunds (digital product)
- Refund within X hours if not viewed
- Case-by-case manual review

**[DECISION NEEDED: Refund policy?]**

**Recommendation**: No automatic refunds. Manual review for disputes via support.

---

## Video & Media

### EC-12: Signed URL expires during viewing

**Scenario**: User watches video for 4+ hours, URL expires.

**Detection**: Video player receives 403 error

**Handling**:
```
┌─────────────────────────────────────────┐
│ Session expired                         │
│                                         │
│ Your viewing session has timed out.     │
│ Click refresh to continue watching.     │
│                                         │
│ [Refresh]                               │
└─────────────────────────────────────────┘
```

**Actions**:
- Remember current playback position
- On refresh: Fetch new signed URL, resume from position
- Seamless experience

---

### EC-13: Video file missing from GCS

**Scenario**: Video referenced in database doesn't exist in storage.

**Detection**: 404 from GCS when generating signed URL

**Handling**:
- Log error for staff investigation
- Show user:
```
┌─────────────────────────────────────────┐
│ Video temporarily unavailable           │
│                                         │
│ We're working to restore this video.    │
│ Please try again later or contact       │
│ support if the issue persists.          │
│                                         │
│ [Contact Support]                       │
└─────────────────────────────────────────┘
```

**Staff action**: Investigate, re-upload, or remove listing

---

### EC-14: Video fails to load (network)

**Scenario**: User's network too slow or interrupted.

**Detection**: Video loading timeout / error event

**Handling**:
```
┌─────────────────────────────────────────┐
│ Video failed to load                    │
│                                         │
│ Check your internet connection and      │
│ try again.                              │
│                                         │
│ [Retry]                                 │
└─────────────────────────────────────────┘
```

---

### EC-15: Subtitle generation fails

**Scenario**: Translation API fails when generating subtitles for new language.

**Detection**: API error during subtitle generation

**Handling**:
- Serve video without subtitles
- Show toggle as disabled: "Subtitles unavailable"
- Log for retry later
- Don't block video access

---

## Video Submissions

*Renamed from "Cashback" - this feature is de-emphasized in the UI but still functions.*

### EC-16: Submitted URL is not public

**Scenario**: User submits TikTok/Instagram URL but video is private.

**Detection**: Automated check fails to fetch post

**Handling** (automated):
- Mark as "Needs attention"
- Email user: "We couldn't access your video. Please make sure it's set to public."
- Allow resubmission within deadline

**[DECISION NEEDED: Allow resubmission after failed auto-check?]**

---

### EC-17: Submitted URL is wrong platform

**Scenario**: User selects "TikTok" but pastes Instagram URL.

**Detection**: Client-side URL pattern validation

**Handling**:
- Inline error: "This doesn't look like a TikTok URL. Did you mean Instagram?"
- Don't submit until corrected

---

### EC-18: Video posted before purchase

**Scenario**: User submits video that was posted before they purchased the concept.

**Detection**: Compare post date to transaction date

**Handling**:
- Auto-reject
- Reason: "This video was posted before your purchase date."
- No appeal (clear abuse attempt)

---

### EC-19: Cashback submitted on deadline day, verified after

**Scenario**: User submits at 11:59pm on day 30, verification happens next day.

**Handling**:
- Submission timestamp is what matters
- If submitted before deadline, eligible regardless of verification timing
- Verification can happen after deadline

---

### EC-20: User deletes video after cashback submission

**Scenario**: User submits URL, then deletes video before verification.

**Detection**: Video not found during verification

**Handling**:
- Reject: "The video is no longer available at the submitted URL."
- No resubmission (suspicious behavior)

---

### EC-21: Duplicate cashback submission

**Scenario**: User tries to submit cashback twice for same purchase.

**Detection**: Check transaction.cashback_submitted flag

**Handling**:
- Block submission
- Show: "You've already submitted a cashback claim for this purchase."
- Link to status page

---

### EC-22: Same video URL submitted for different purchases

**Scenario**: User buys two concepts, submits same video for both cashbacks.

**Detection**: Check produced_content table for duplicate post_url

**Handling options**:
- Allow (different concepts, same video is creative)
- Block (one video = one cashback)
- Flag for manual review

**[DECISION NEEDED: Policy on this?]**

**Recommendation**: Block. One video = one cashback. Prevents gaming.

---

## User Account

### EC-23: User deletes account with active purchases

**Scenario**: User requests account deletion but has purchased concepts.

**Handling options**:
- Delete account, void purchases (harsh)
- Delete account, keep transaction records (for analytics)
- Prevent deletion until cashback windows expire
- Soft delete (anonymize, retain data)

**[DECISION NEEDED: Account deletion policy?]**

**Recommendation**: Soft delete. Anonymize PII, retain transactions for analytics and audit.

---

### EC-24: Email already registered (different auth provider)

**Scenario**: User registered with Google, tries to register with same email via password.

**Handling**:
- "This email is already registered. Try logging in with Google."
- Or: Allow account linking

**Recommendation**: Show message, don't auto-link (security risk).

---

### EC-25: User loses access to email

**Scenario**: User can't access registered email, can't reset password.

**Handling**:
- Manual support process
- Verify identity through other means
- Staff can reset/transfer account

---

## Concurrency

### EC-26: Two users try to buy last copy simultaneously

**Scenario**: Market cap is 1 remaining, two users click "Pay" at same time.

**Handling**:
- Database transaction with locking
- First to complete wins
- Second sees: "This concept just sold out in your market"
- Second user's payment NOT processed (check before charge)

**Implementation**:
```sql
BEGIN;
SELECT sold_count FROM listing_windows WHERE id = ? FOR UPDATE;
-- Check if sold_count < per_market_cap
-- If yes: process payment, increment sold_count
-- If no: abort, return sold_out error
COMMIT;
```

---

### EC-27: Staff rates video while another staff edits

**Scenario**: Two staff members rate same video simultaneously.

**Handling**:
- Last write wins (simple)
- Or: Lock video while being rated
- Or: Show "Being edited by [name]" warning

**Recommendation**: Last write wins for MVP. Low volume, low risk.

---

## Data & Validation

### EC-28: Concept missing required analysis fields

**Scenario**: Concept approved for listing but visual_analysis missing some fields.

**Detection**: Schema validation before listing

**Handling**:
- Don't list incomplete concepts
- Flag for staff to re-analyze or manually fill
- Viewer gracefully handles missing fields (show "—" or hide section)

---

### EC-29: Price calculation results in $0 or negative

**Scenario**: PPP adjustment or credits result in zero/negative price.

**Handling**:
- Floor price at $1 (or configurable minimum)
- Or: Allow $0 purchases (free with credits)

**[DECISION NEEDED: Minimum price?]**

---

### EC-30: Virality score outside 0-10 range

**Scenario**: Model outputs score > 10 or < 0.

**Detection**: Validation on model output

**Handling**:
- Clamp to 0-10 range
- Log anomaly for investigation
- Don't reject concept

---

## Error Message Guidelines

### Tone (Plain Language)
- Clear and direct
- No blame ("Your payment failed" not "You entered wrong info")
- Actionable when possible
- Human, not robotic
- **No jargon** - speak to mid/low tech comfort users
- **No error codes** in user-facing messages

### Structure
```
[What happened]
[Why / Context (if helpful)]
[What to do next]
```

### Examples

**Good:**
```
Payment declined
Your card was declined by your bank. Please try a different card or contact your bank.
[Try Again] [Use Different Card]
```

**Bad:**
```
Error 402
Transaction failed. Error code: CARD_DECLINED_GENERIC
```

---

## Error Logging

### What to log
- Error type and message
- User ID (if authenticated)
- Timestamp
- Page/endpoint
- Request context (sanitized)
- Stack trace (server-side)

### What NOT to log
- Full card numbers
- Passwords
- Full session tokens
- PII beyond user ID

### Alerting thresholds
| Error Type | Alert Threshold |
|------------|-----------------|
| Payment failures | > 10% of attempts in 1 hour |
| Video load failures | > 5% of views in 1 hour |
| API errors (5xx) | Any |
| Cashback verification failures | > 50% in 1 day |

---

## Recovery Procedures

### User-initiated recovery
- Retry buttons where appropriate
- Clear error messages with next steps
- Support contact always available

### Automatic recovery
- Webhook retries (Stripe, exponential backoff)
- Signed URL refresh on expiry
- Session refresh on auth errors

### Manual recovery (Staff)
- Reconciliation dashboard for payment mismatches
- Video re-upload capability
- Manual cashback approval override
- Transaction void/refund capability

---

## Testing Checklist

For each edge case:
- [ ] Unit test for detection logic
- [ ] Integration test for full flow
- [ ] UI test for error display
- [ ] Documented in runbook for support

---

*This document defines edge case handling for letrend. Revised based on owner input.*
